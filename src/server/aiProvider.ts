import {
  AIDifficulty,
  AIPersonality,
  ClientBoardCard,
  Clue,
  RoomRulesConfig,
  ServerBoardCard,
  Team,
} from '../shared/types';
import { validateClue } from '../shared/rulesEngine';
import {
  generateLocalOperativeDecision,
  generateLocalSpymasterClue,
  getDifficultyLabel,
  getPersonalityLabel,
  OperativeGuessDecision,
  SpymasterClueDecision,
} from '../shared/semanticEngine';

const AI_TIMEOUT_MS = 6500;

export function isGeminiConfigured(): boolean {
  const key = process.env.GEMINI_API_KEY?.trim();
  return Boolean(key && key.length > 10);
}

export function getConfiguredGeminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';
}

/**
 * Scrubs any unrevealed board codenames from public-facing Spymaster reasoning
 * so the Spymaster never accidentally reveals target words in the public log.
 */
function sanitizePublicSpymasterReasoning(
  rawText: string,
  board: readonly ServerBoardCard[],
  difficulty: AIDifficulty,
  personality: AIPersonality,
  count: number | 'unlimited'
): string {
  let text = rawText.trim();
  for (const card of board) {
    if (!card.revealed && text.includes(card.word)) {
      text = text.replaceAll(card.word, '【機密代號】');
    }
  }
  if (!text) {
    return `【${getDifficultyLabel(difficulty)}・${getPersonalityLabel(
      personality
    )}】已完成桌面語意關聯與風險比對，鎖定 ${
      count === 'unlimited' ? '無限' : count
    } 個目標。`;
  }
  return text;
}

/**
 * Requests a Spymaster clue from Gemini API (if configured), with strict validation
 * and automatic fallback to the local semantic graph engine.
 */
export async function requestAISpymasterClue(params: {
  board: readonly ServerBoardCard[];
  team: Team;
  difficulty: AIDifficulty;
  personality: AIPersonality;
  rules: RoomRulesConfig;
  usedClueWords: readonly string[];
  forceFallback?: boolean;
}): Promise<SpymasterClueDecision & { provider: 'gemini' | 'local' }> {
  const { board, team, difficulty, personality, rules, usedClueWords, forceFallback } =
    params;

  if (!forceFallback && isGeminiConfigured()) {
    try {
      const apiKey = process.env.GEMINI_API_KEY!.trim();
      const model = getConfiguredGeminiModel();

      const unrevealed = board.filter((c) => !c.revealed);
      const myWords = unrevealed.filter((c) => c.type === team).map((c) => c.word);
      const enemyWords = unrevealed
        .filter((c) => c.type !== team && c.type !== 'bystander' && c.type !== 'assassin')
        .map((c) => c.word);
      const bystanderWords = unrevealed
        .filter((c) => c.type === 'bystander')
        .map((c) => c.word);
      const assassinWord = unrevealed.find((c) => c.type === 'assassin')?.word ?? '無';
      const allForbiddenChars = unrevealed.map((c) => c.word).join('、');

      const prompt = `你是桌遊《機密代號》(Codenames) 的「間諜領袖」(Spymaster)。
我方陣營：${team === 'red' ? '紅隊' : '藍隊'}
難度設定：${getDifficultyLabel(difficulty)}
決策個性：${getPersonalityLabel(personality)}

【桌面未翻開代號】
- 我方特務（必須引導隊員猜中）：${myWords.join('、')}
- 敵方特務（必須避免誤導）：${enemyWords.join('、')}
- 中立路人（盡量避免）：${bystanderWords.join('、')}
- 殺手代號（絕對禁止關聯，猜中即落敗）：${assassinWord}

【嚴格線索規則】
1. 線索必須是繁體中文的單一詞語（2 至 4 個字為佳）。
2. 線索絕對不可等於桌面任何代號，也不可包含未翻開代號中的任何一個字（禁用字詞包含：${allForbiddenChars}）。
3. 已使用過的線索不可重複：${usedClueWords.join('、') || '無'}。
4. publicReasoning 供所有玩家觀看，絕對不可洩露我方目標代號的名稱！
5. secretReasoning 為領袖機密紀錄，可說明你想連結哪幾個我方代號。`;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          model
        )}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: difficulty === 'hard' ? 0.4 : 0.6,
              responseMimeType: 'application/json',
              responseSchema: {
                type: 'OBJECT',
                properties: {
                  word: { type: 'STRING' },
                  count: { type: 'INTEGER' },
                  targetWords: {
                    type: 'ARRAY',
                    items: { type: 'STRING' },
                  },
                  publicReasoning: { type: 'STRING' },
                  secretReasoning: { type: 'STRING' },
                },
                required: [
                  'word',
                  'count',
                  'targetWords',
                  'publicReasoning',
                  'secretReasoning',
                ],
              },
            },
          }),
        }
      );

      clearTimeout(timer);

      if (response.ok) {
        const data = (await response.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const rawJson = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawJson) {
          const parsed = JSON.parse(rawJson) as {
            word: string;
            count: number;
            targetWords: string[];
            publicReasoning: string;
            secretReasoning: string;
          };

          const safeCount = Math.max(1, Math.min(myWords.length, Number(parsed.count) || 1));
          const validation = validateClue(parsed.word, safeCount, board, rules);

          if (validation.valid && !usedClueWords.includes(validation.normalizedWord)) {
            const validTargets = Array.isArray(parsed.targetWords)
              ? parsed.targetWords.filter((w) => myWords.includes(w))
              : [];

            return {
              provider: 'gemini',
              word: validation.normalizedWord,
              count: safeCount,
              targetWords: validTargets.length > 0 ? validTargets : myWords.slice(0, safeCount),
              publicReasoning: sanitizePublicSpymasterReasoning(
                parsed.publicReasoning || '',
                board,
                difficulty,
                personality,
                safeCount
              ),
              secretReasoning:
                parsed.secretReasoning ||
                `【Gemini 領袖分析】以「${validation.normalizedWord}」串聯 ${validTargets.join('、')}`,
              candidateScores: validTargets.map((w) => ({
                word: w,
                score: 0.9,
                reason: `Gemini 語意連結「${validation.normalizedWord}」`,
              })),
            };
          }
        }
      }
    } catch {
      // Automatic fallback to local AI on timeout, network error, or invalid schema
    }
  }

  const localDecision = generateLocalSpymasterClue(
    board,
    team,
    difficulty,
    personality,
    rules,
    usedClueWords
  );

  return {
    ...localDecision,
    provider: 'local',
  };
}

/**
 * Requests an Operative guess decision.
 * CRITICAL SECURITY REQUIREMENT:
 * Takes ONLY `ClientBoardCard[]` where unrevealed cards have `type === undefined`.
 * Neither Gemini nor Local AI Operative ever receives secret card identities.
 */
export async function requestAIOperativeDecision(params: {
  publicBoard: readonly ClientBoardCard[];
  currentClue: Clue;
  guessesMadeThisTurn: number;
  maxGuessesThisTurn: number | 'unlimited';
  difficulty: AIDifficulty;
  personality: AIPersonality;
  teamClueHistory: readonly Clue[];
  forceFallback?: boolean;
}): Promise<OperativeGuessDecision & { provider: 'gemini' | 'local' }> {
  const {
    publicBoard,
    currentClue,
    guessesMadeThisTurn,
    maxGuessesThisTurn,
    difficulty,
    personality,
    teamClueHistory,
    forceFallback,
  } = params;

  // Verify information isolation at runtime: ensure no unrevealed card has a secret `type`
  for (const card of publicBoard) {
    if (!card.revealed && card.type !== undefined) {
      throw new Error('SECURITY_VIOLATION: AI Operative received secret card identity.');
    }
  }

  if (!forceFallback && isGeminiConfigured()) {
    try {
      const apiKey = process.env.GEMINI_API_KEY!.trim();
      const model = getConfiguredGeminiModel();

      const unrevealedOptions = publicBoard
        .filter((c) => !c.revealed)
        .map((c) => ({ index: c.index, word: c.word, category: c.category }));

      const revealedSummary = publicBoard
        .filter((c) => c.revealed)
        .map((c) => `${c.word}(${c.type})`)
        .join('、');

      const prompt = `你是桌遊《機密代號》(Codenames) 的「間諜隊員」(Operative)。
你不知道秘密關鍵名單，只能根據間諜領袖給出的線索與桌面公開代號進行推理。
難度：${getDifficultyLabel(difficulty)}
個性：${getPersonalityLabel(personality)}

【本回合線索】
詞語：「${currentClue.word}」
關聯數量：${currentClue.count === 'unlimited' ? '無限' : currentClue.count}
本回合已猜測次數：${guessesMadeThisTurn}（${
        guessesMadeThisTurn === 0
          ? '本回合尚未猜測，依規則必須至少選擇一張代號卡猜測 (action="guess")'
          : '若對剩餘候選信心不足，可選擇 action="end_turn" 結束回合'
      }）

【目前未翻開的候選代號】
${JSON.stringify(unrevealedOptions)}

【已翻開的代號】
${revealedSummary || '無'}

請從未翻開的候選代號中選出最符合線索的一張（或當已猜過至少 1 張且信心不足時結束回合），並提供簡短繁體中文推理摘要 (reasoning)。`;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          model
        )}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.3,
              responseMimeType: 'application/json',
              responseSchema: {
                type: 'OBJECT',
                properties: {
                  action: { type: 'STRING', enum: ['guess', 'end_turn'] },
                  cardIndex: { type: 'INTEGER' },
                  confidence: { type: 'NUMBER' },
                  reasoning: { type: 'STRING' },
                },
                required: ['action', 'cardIndex', 'confidence', 'reasoning'],
              },
            },
          }),
        }
      );

      clearTimeout(timer);

      if (response.ok) {
        const data = (await response.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const rawJson = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawJson) {
          const parsed = JSON.parse(rawJson) as {
            action: 'guess' | 'end_turn';
            cardIndex: number;
            confidence: number;
            reasoning: string;
          };

          if (parsed.action === 'end_turn' && guessesMadeThisTurn > 0) {
            return {
              provider: 'gemini',
              action: 'end_turn',
              confidence: Number(parsed.confidence) || 0.3,
              reasoning: parsed.reasoning || '評估剩餘代號風險較高，決定結束本回合。',
              candidateScores: [],
            };
          }

          const targetCard = publicBoard.find(
            (c) => c.index === parsed.cardIndex && !c.revealed
          );
          if (targetCard) {
            return {
              provider: 'gemini',
              action: 'guess',
              cardIndex: targetCard.index,
              word: targetCard.word,
              confidence: Math.max(0.1, Math.min(0.99, Number(parsed.confidence) || 0.8)),
              reasoning:
                parsed.reasoning ||
                `根據線索「${currentClue.word}」推理鎖定代號「${targetCard.word}」。`,
              candidateScores: [
                {
                  word: targetCard.word,
                  score: Math.max(0.1, Math.min(0.99, Number(parsed.confidence) || 0.8)),
                  reason: parsed.reasoning || 'Gemini 語意推理首選',
                },
              ],
            };
          }
        }
      }
    } catch {
      // Fallback to local AI Operative engine
    }
  }

  const localDecision = generateLocalOperativeDecision(
    publicBoard,
    currentClue,
    guessesMadeThisTurn,
    maxGuessesThisTurn,
    difficulty,
    personality,
    teamClueHistory
  );

  return {
    ...localDecision,
    provider: 'local',
  };
}
