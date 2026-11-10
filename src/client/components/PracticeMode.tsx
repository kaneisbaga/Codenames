import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Bot,
  BrainCircuit,
  CheckCircle2,
  Compass,
  Crosshair,
  Eye,
  Play,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import {
  ClientBoardCard,
  ClueCount,
  ServerBoardCard,
  UserSettings,
} from '../../shared/types';
import {
  DEFAULT_ROOM_RULES,
  generateGameBoard,
  sanitizeBoardForViewer,
  validateClue,
} from '../../shared/rulesEngine';
import {
  generateLocalOperativeDecision,
  generateLocalSpymasterClue,
  scoreWordAgainstClue,
} from '../../shared/semanticEngine';
import { soundEngine } from '../utils/sound';
import { BoardGrid } from './BoardGrid';

type PracticeTab =
  | 'novice'
  | 'clue_drill'
  | 'guess_drill'
  | 'ai_spymaster_guide'
  | 'ai_operative_guide';

interface PracticeModeProps {
  settings: UserSettings;
  onStartLivePracticeGame: (role: 'spymaster' | 'operative') => void;
  onBackHome: () => void;
}

export const PracticeModeScreen: React.FC<PracticeModeProps> = ({
  settings,
  onStartLivePracticeGame,
  onBackHome,
}) => {
  const [activeTab, setActiveTab] = useState<PracticeTab>('novice');
  const [seed, setSeed] = useState(1);

  const generated = useMemo(() => {
    void seed;
    return generateGameBoard('red');
  }, [seed]);

  const [board, setBoard] = useState<ServerBoardCard[]>(() => generated.board);

  const resetPracticeBoard = () => {
    const next = generateGameBoard('red');
    setBoard(next.board);
    setCustomClueWord('');
    setCustomClueCount(2);
    setSelectedFeedback(null);
    setSeed((s) => s + 1);
  };

  // State for Clue Drill (線索練習)
  const [customClueWord, setCustomClueWord] = useState('');
  const [customClueCount, setCustomClueCount] = useState<ClueCount>(2);

  // State for Guess Drill (猜測練習)
  const [selectedFeedback, setSelectedFeedback] = useState<string | null>(null);

  const aiSpymasterDemo = useMemo(
    () =>
      generateLocalSpymasterClue(
        board,
        'red',
        'hard',
        'analytical',
        DEFAULT_ROOM_RULES
      ),
    [board]
  );

  const demoClueObj = useMemo(
    () => ({
      id: 'practice-clue',
      turnNumber: 1,
      team: 'red' as const,
      word: aiSpymasterDemo.word,
      count: aiSpymasterDemo.count,
      spymasterName: 'AI 示範領袖',
      isAI: true,
      timestamp: Date.now(),
    }),
    [aiSpymasterDemo]
  );

  const aiOperativeDemo = useMemo(() => {
    const pubBoard = sanitizeBoardForViewer(board, false, false);
    return generateLocalOperativeDecision(
      pubBoard,
      demoClueObj,
      0,
      typeof demoClueObj.count === 'number' ? demoClueObj.count + 1 : 'unlimited',
      'hard',
      'analytical',
      [demoClueObj]
    );
  }, [board, demoClueObj]);

  const customClueEvaluation = useMemo(() => {
    if (!customClueWord.trim()) return null;
    const validation = validateClue(
      customClueWord,
      customClueCount,
      board,
      DEFAULT_ROOM_RULES
    );
    if (!validation.valid) {
      return { valid: false as const, reason: validation.reason };
    }

    const scored = board
      .filter((c) => !c.revealed)
      .map((c) => {
        const res = scoreWordAgainstClue(validation.normalizedWord, c.word);
        return {
          word: c.word,
          type: c.type,
          score: res.score,
          reason: res.reason,
        };
      })
      .sort((a, b) => b.score - a.score);

    const topFriendly = scored.filter((s) => s.type === 'red' && s.score >= 0.45);
    const assassinRisk = scored.find((s) => s.type === 'assassin');

    return {
      valid: true as const,
      normalizedWord: validation.normalizedWord,
      topMatches: scored.slice(0, 6),
      friendlyCount: topFriendly.length,
      assassinScore: assassinRisk?.score ?? 0,
      assassinWord: assassinRisk?.word ?? '',
    };
  }, [customClueWord, customClueCount, board]);

  const handlePracticeCardClick = (cardIndex: number) => {
    const card = board[cardIndex];
    if (!card || card.revealed) return;

    const nextBoard = board.map((c, i) =>
      i === cardIndex ? { ...c, revealed: true } : c
    );
    setBoard(nextBoard);

    const affinity = scoreWordAgainstClue(aiSpymasterDemo.word, card.word);
    if (card.type === 'red') {
      soundEngine.playCorrectReveal();
      setSelectedFeedback(
        `✓ 正確！代號「${card.word}」屬於紅方特務（語意匹配度 ${Math.round(
          affinity.score * 100
        )}%：${affinity.reason}）。依規則你可以繼續猜下一張！`
      );
    } else if (card.type === 'assassin') {
      soundEngine.playWrongReveal();
      setSelectedFeedback(
        `☠ 觸發終局殺手！「${card.word}」是黑名單殺手代號，在正式比賽中翻開此卡將立即落敗。`
      );
    } else if (card.type === 'blue') {
      soundEngine.playWrongReveal();
      setSelectedFeedback(
        `✕ 誤觸敵方特務！「${card.word}」屬於藍隊特務，不但會結束本回合，還會幫對手推進進度。`
      );
    } else {
      soundEngine.playWrongReveal();
      setSelectedFeedback(
        `• 翻中中立路人！「${card.word}」為無辜平民，在正式比賽中會立即結束本回合。`
      );
    }
  };

  const showSecretKeyOnBoard =
    activeTab === 'novice' ||
    activeTab === 'clue_drill' ||
    activeTab === 'ai_spymaster_guide';

  const clientBoardView: ClientBoardCard[] = useMemo(
    () => sanitizeBoardForViewer(board, showSecretKeyOnBoard, false),
    [board, showSecretKeyOnBoard]
  );

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-100 p-3 sm:p-6 flex flex-col">
      <div className="max-w-7xl w-full mx-auto space-y-5">
        {/* Header */}
        <div className="rounded-2xl border border-amber-500/25 bg-[#0b1220]/95 p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBackHome}
              className="rounded-xl border border-slate-700 bg-slate-900 p-2 text-slate-300 hover:text-amber-300 transition"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-base sm:text-xl font-black tracking-wider text-white">
                特務戰術訓練學院 (練習模式)
              </h1>
              <p className="text-xs text-slate-400">
                提供新手引導、線索構思演練、猜測實戰與 AI 領袖／隊員決策解析
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="practice-refresh-board-btn"
              onClick={resetPracticeBoard}
              className="rounded-xl border border-slate-700 bg-slate-900 hover:border-amber-500/40 px-3.5 py-2 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition"
            >
              <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
              更換 25 張練習代號
            </button>

            <button
              type="button"
              data-testid="practice-start-full-game-btn"
              onClick={() => onStartLivePracticeGame('operative')}
              className="rounded-xl bg-amber-500 hover:bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950 flex items-center gap-1.5 transition"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              進入實戰練習局
            </button>
          </div>
        </div>

        {/* 5 Practice Sub-Mode Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {(
            [
              { id: 'novice', label: '1. 新手練習', icon: Compass },
              { id: 'clue_drill', label: '2. 線索練習', icon: Eye },
              { id: 'guess_drill', label: '3. 猜測練習', icon: Crosshair },
              { id: 'ai_spymaster_guide', label: '4. AI 領袖教學', icon: BrainCircuit },
              { id: 'ai_operative_guide', label: '5. AI 隊員教學', icon: Bot },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                data-testid={`practice-tab-${tab.id}`}
                onClick={() => {
                  setActiveTab(tab.id);
                  setSelectedFeedback(null);
                }}
                className={`rounded-xl border px-3 py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                  active
                    ? 'border-amber-400 bg-amber-500/20 text-amber-200 shadow-md'
                    : 'border-slate-800 bg-slate-900/70 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Main Split Layout: 5x5 Board + Interactive Drill / Tutorial Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-8 space-y-3">
            {selectedFeedback && (
              <div
                data-testid="practice-feedback-banner"
                className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-200"
              >
                {selectedFeedback}
              </div>
            )}

            <BoardGrid
              board={clientBoardView}
              viewerIsSpymaster={showSecretKeyOnBoard}
              showSpymasterKey={showSecretKeyOnBoard}
              canGuess={true}
              canMark={false}
              reducedMotion={settings.reducedMotion}
              cardSize={settings.cardSize}
              fontSize={settings.fontSize}
              onCardClick={handlePracticeCardClick}
              onToggleMark={() => {}}
            />
          </div>

          {/* Right Panel: Mode-Specific Interactive Module */}
          <div className="lg:col-span-4 rounded-2xl border border-slate-800 bg-[#0b1220]/95 p-5 space-y-4 text-xs leading-relaxed">
            {activeTab === 'novice' && (
              <div className="space-y-3">
                <h2 className="text-sm font-black text-amber-400">
                  新手練習：3 分鐘掌握暗線任務
                </h2>
                <p className="text-slate-300">
                  左側即為標準 5×5 情報桌面。目前我們開啟了「領袖視角」，因此你能直接看見每張代號卡的秘密身分：
                </p>
                <ul className="space-y-1.5 text-slate-300 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                  <li>
                    • <strong className="text-rose-400">紅框卡片 (9 張)</strong>：紅隊特務（先攻需全數找出）
                  </li>
                  <li>
                    • <strong className="text-sky-400">藍框卡片 (8 張)</strong>：藍隊特務（後攻需全數找出）
                  </li>
                  <li>
                    • <strong className="text-stone-300">灰框卡片 (7 張)</strong>：中立路人（翻中即結束回合）
                  </li>
                  <li>
                    • <strong className="text-amber-400">金黑警示卡 (1 張)</strong>：終局殺手（翻中立即落敗！）
                  </li>
                </ul>
                <p className="text-slate-400">
                  試著直接點擊左側任意代號卡，體驗揭曉機密檔案與語意回饋！
                </p>
              </div>
            )}

            {activeTab === 'clue_drill' && (
              <div className="space-y-3">
                <h2 className="text-sm font-black text-amber-400">
                  線索練習：測試你的領袖線索評分
                </h2>
                <p className="text-slate-300">
                  假設你是<strong className="text-rose-400">紅隊間諜領袖</strong>，請觀察左側紅框卡片，輸入一個你想給出的線索詞語，系統將即時模擬 AI 隊員會聯想到哪些卡片：
                </p>

                <div className="flex gap-2">
                  <input
                    type="text"
                    data-testid="practice-clue-input"
                    value={customClueWord}
                    onChange={(e) => setCustomClueWord(e.target.value)}
                    placeholder="輸入測試線索（如：海洋、皇室）"
                    className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-amber-400 focus:outline-none"
                  />
                  <select
                    value={String(customClueCount)}
                    onChange={(e) => setCustomClueCount(Number(e.target.value))}
                    className="rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs font-mono text-amber-300"
                  >
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>
                        {n} 張
                      </option>
                    ))}
                  </select>
                </div>

                {customClueEvaluation && !customClueEvaluation.valid && (
                  <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 p-3 text-rose-300">
                    ✕ 違規提示：{customClueEvaluation.reason}
                  </div>
                )}

                {customClueEvaluation && customClueEvaluation.valid && (
                  <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-emerald-400">
                        ✓ 線索合法：「{customClueEvaluation.normalizedWord}」
                      </span>
                      <span className="text-[11px] text-slate-400">
                        殺手風險：{Math.round(customClueEvaluation.assassinScore * 100)}%
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      隊員最可能聯想的前 5 張代號：
                    </div>
                    {customClueEvaluation.topMatches.slice(0, 5).map((m) => (
                      <div
                        key={m.word}
                        className="flex items-center justify-between text-[11px] px-2 py-1 rounded bg-slate-900"
                      >
                        <span
                          className={`font-bold ${
                            m.type === 'red'
                              ? 'text-rose-400'
                              : m.type === 'blue'
                              ? 'text-sky-400'
                              : m.type === 'assassin'
                              ? 'text-amber-400'
                              : 'text-stone-400'
                          }`}
                        >
                          {m.word} (
                          {m.type === 'red'
                            ? '紅方'
                            : m.type === 'blue'
                            ? '藍方'
                            : m.type === 'assassin'
                            ? '殺手'
                            : '路人'}
                          )
                        </span>
                        <span className="font-mono text-amber-300">
                          {Math.round(m.score * 100)}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'guess_drill' && (
              <div className="space-y-3">
                <h2 className="text-sm font-black text-amber-400">
                  猜測練習：扮演間諜隊員破譯線索
                </h2>
                <p className="text-slate-300">
                  現在已隱藏秘密關鍵名單！紅隊 AI 領袖針對目前桌面給出了以下線索：
                </p>

                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-center">
                  <div className="text-[11px] text-slate-400">領袖線索與目標數量</div>
                  <div className="text-xl font-black text-amber-300 mt-1">
                    {aiSpymasterDemo.word} :{' '}
                    {aiSpymasterDemo.count === 'unlimited'
                      ? '∞'
                      : aiSpymasterDemo.count}
                  </div>
                </div>

                <p className="text-slate-300">
                  請直接點擊左側 5×5 桌面中你認為最符合「
                  <strong className="text-amber-300">{aiSpymasterDemo.word}</strong>
                  」的代號卡進行驗證！
                </p>
              </div>
            )}

            {activeTab === 'ai_spymaster_guide' && (
              <div className="space-y-3">
                <h2 className="text-sm font-black text-amber-400">
                  AI 領袖教學：多目標語意串聯與避險
                </h2>
                <p className="text-slate-300">
                  觀察 AI 間諜領袖如何分析左側桌面並產生最佳線索：
                </p>
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">推薦最佳線索</span>
                    <span className="font-mono font-black text-base text-amber-300">
                      {aiSpymasterDemo.word} : {String(aiSpymasterDemo.count)}
                    </span>
                  </div>
                  <p className="text-slate-300 text-[11px]">
                    {aiSpymasterDemo.secretReasoning}
                  </p>
                  <div className="space-y-1 pt-2 border-t border-slate-800">
                    {aiSpymasterDemo.candidateScores.map((c) => (
                      <div
                        key={c.word}
                        className="flex items-center justify-between text-[11px]"
                      >
                        <span className="font-bold text-rose-300">目標：{c.word}</span>
                        <span className="font-mono text-emerald-400">
                          關聯度 {Math.round(c.score * 100)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'ai_operative_guide' && (
              <div className="space-y-3">
                <h2 className="text-sm font-black text-amber-400">
                  AI 隊員教學：公開資訊推理與停損策略
                </h2>
                <p className="text-slate-300">
                  AI 隊員在完全不知道卡片秘密顏色的前提下，收到線索「
                  <strong className="text-amber-300">
                    {aiSpymasterDemo.word} : {String(aiSpymasterDemo.count)}
                  </strong>
                  」時的推理排序：
                </p>
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 space-y-2">
                  <p className="text-slate-200">{aiOperativeDemo.reasoning}</p>
                  <div className="space-y-1.5 pt-2 border-t border-slate-800">
                    {aiOperativeDemo.candidateScores.map((c, idx) => (
                      <div
                        key={c.word}
                        className="rounded-lg bg-slate-900 p-2 flex items-center justify-between"
                      >
                        <div>
                          <span className="font-bold text-amber-300 mr-2">
                            #{idx + 1} {c.word}
                          </span>
                          <div className="text-[10px] text-slate-400">{c.reason}</div>
                        </div>
                        <span className="font-mono font-bold text-emerald-400">
                          {Math.round(c.score * 100)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
