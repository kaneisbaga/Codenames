import {
  CardType,
  ClientBoardCard,
  ClueCount,
  ClueValidationResult,
  RoomRulesConfig,
  ServerBoardCard,
  Team,
  WinReason,
} from './types';
import { WORD_DICTIONARY, WordEntry } from './words';

export const DEFAULT_ROOM_RULES: RoomRulesConfig = {
  allowZeroClue: true,
  allowUnlimitedClue: true,
  allowProperNouns: false,
  allowCompoundWords: false,
  clueStrictness: 'standard',
  turnTimerSeconds: 0,
  aiSpeed: 'normal',
  maxPlayers: 8,
  allowAI: true,
  autoFillAI: true,
  isPublic: true,
};

/**
 * Fisher-Yates shuffle returning a new array.
 */
export function shuffleArray<T>(items: readonly T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function getOppositeTeam(team: Team): Team {
  return team === 'red' ? 'blue' : 'red';
}

export interface GeneratedBoardData {
  startingTeam: Team;
  board: ServerBoardCard[];
  redTotal: number;
  blueTotal: number;
}

/**
 * Generates a fresh 5x5 Codenames board:
 * - Starting team: 9 agents
 * - Second team: 8 agents
 * - Bystander: 7 cards
 * - Assassin: 1 card
 * Total = 25 unique codenames.
 */
export function generateGameBoard(forcedStartingTeam?: Team): GeneratedBoardData {
  const startingTeam: Team =
    forcedStartingTeam ?? (Math.random() < 0.5 ? 'red' : 'blue');
  const secondTeam: Team = getOppositeTeam(startingTeam);

  const selectedWords: WordEntry[] = shuffleArray(WORD_DICTIONARY).slice(0, 25);

  const cardTypes: CardType[] = [
    ...Array<CardType>(9).fill(startingTeam),
    ...Array<CardType>(8).fill(secondTeam),
    ...Array<CardType>(7).fill('bystander'),
    'assassin',
  ];

  const shuffledTypes = shuffleArray(cardTypes);

  const board: ServerBoardCard[] = selectedWords.map((entry, index) => ({
    index,
    word: entry.word,
    category: entry.category,
    type: shuffledTypes[index],
    revealed: false,
    marks: [],
  }));

  return {
    startingTeam,
    board,
    redTotal: startingTeam === 'red' ? 9 : 8,
    blueTotal: startingTeam === 'blue' ? 9 : 8,
  };
}

/**
 * Meta/positional/orthographic patterns forbidden by Codenames rules
 * ("線索不得透過位置、字數、字形或卡片位置暗示").
 */
const FORBIDDEN_META_PATTERNS: RegExp[] = [
  /第[一二三四五12345][排行列個張]/,
  /[左右上下中][邊方側角間]/,
  /[一二兩三四五12345]個字/,
  /字數|筆畫|部首|注音|拼音|位置|座標|角落|隔壁|對角/,
];

/**
 * Validates whether a clue word and count are legal according to the room's rules.
 */
export function validateClue(
  rawWord: string,
  count: ClueCount,
  board: readonly Pick<ServerBoardCard, 'word' | 'revealed'>[],
  rules: RoomRulesConfig = DEFAULT_ROOM_RULES
): ClueValidationResult {
  const normalizedWord = rawWord.trim().replace(/\s+/g, '');

  if (!normalizedWord) {
    return {
      valid: false,
      reason: '請輸入線索詞語。',
      normalizedWord: '',
    };
  }

  // Validate count
  if (count === 0 && !rules.allowZeroClue) {
    return {
      valid: false,
      reason: '目前房間設定不允許使用「0」作為線索數量。',
      normalizedWord,
    };
  }
  if (count === 'unlimited' && !rules.allowUnlimitedClue) {
    return {
      valid: false,
      reason: '目前房間設定不允許使用「無限 (∞)」作為線索數量。',
      normalizedWord,
    };
  }
  if (typeof count === 'number') {
    if (!Number.isInteger(count) || count < 0 || count > 9) {
      return {
        valid: false,
        reason: '線索數字必須介於 0 至 9 之間。',
        normalizedWord,
      };
    }
  }

  // Check multi-word / punctuation
  if (/[\s,.;:!?，。；：！？、/\\|+=@#$%^&*()[\]{}<>"'`~]/.test(rawWord.trim())) {
    if (!rules.allowCompoundWords && !rules.allowProperNouns) {
      return {
        valid: false,
        reason: '標準規則下線索只能是一個獨立詞語，不可包含空白或標點符號。',
        normalizedWord,
      };
    }
  }

  const maxLen = rules.allowProperNouns || rules.allowCompoundWords ? 8 : 5;
  if (normalizedWord.length > maxLen) {
    return {
      valid: false,
      reason: `線索詞語過長（上限 ${maxLen} 字），請使用精煉單詞。`,
      normalizedWord,
    };
  }

  // Check forbidden positional / meta hints
  for (const pattern of FORBIDDEN_META_PATTERNS) {
    if (pattern.test(normalizedWord)) {
      return {
        valid: false,
        reason: '線索不得透過卡片位置、字數或字形結構進行暗示。',
        normalizedWord,
      };
    }
  }

  // Check against board codenames and character variations
  const clueChars = Array.from(normalizedWord);

  for (const card of board) {
    const cardWord = card.word.trim();

    // Exact match is always forbidden against any card on the table
    if (normalizedWord === cardWord) {
      return {
        valid: false,
        reason: `不可直接使用桌面上的代號「${cardWord}」作為線索。`,
        normalizedWord,
      };
    }

    // Substring / superstring match against unrevealed cards (or all cards in strict mode)
    const shouldCheckCard =
      rules.clueStrictness === 'strict' ? true : !card.revealed;

    if (shouldCheckCard) {
      if (normalizedWord.includes(cardWord) || cardWord.includes(normalizedWord)) {
        return {
          valid: false,
          reason: `線索「${normalizedWord}」包含或直接變形自桌面代號「${cardWord}」。`,
          normalizedWord,
        };
      }

      // Character overlap check for standard & strict modes
      if (rules.clueStrictness === 'strict' || rules.clueStrictness === 'standard') {
        const overlappingChar = clueChars.find((ch) => cardWord.includes(ch));
        if (overlappingChar) {
          return {
            valid: false,
            reason: `線索「${normalizedWord}」含有桌面代號「${cardWord}」中的「${overlappingChar}」字，違反字詞變形限制。`,
            normalizedWord,
          };
        }
      }
    }
  }

  return {
    valid: true,
    normalizedWord,
  };
}

/**
 * Calculates maximum allowed guesses for a given clue count.
 * Standard Codenames rule:
 * - For N >= 1: max guesses = N + 1
 * - For 0 or 'unlimited': unlimited guesses (as long as you keep guessing your own team's agents)
 */
export function calculateMaxGuesses(count: ClueCount): number | 'unlimited' {
  if (count === 0 || count === 'unlimited') {
    return 'unlimited';
  }
  return count + 1;
}

export interface GuessEvaluationResult {
  cardType: CardType;
  outcome: 'correct' | 'bystander' | 'enemy' | 'assassin';
  canContinueGuessing: boolean;
  turnEnded: boolean;
  gameEnded: boolean;
  winnerTeam: Team | null;
  winReason: WinReason | null;
  redRemaining: number;
  blueRemaining: number;
}

/**
 * Evaluates a card reveal on the board and computes the resulting turn/game state.
 * Mutates `board[cardIndex].revealed = true`.
 */
export function evaluateCardGuess(
  board: ServerBoardCard[],
  cardIndex: number,
  guessingTeam: Team,
  turnNumber: number,
  guessesMadeBeforeThis: number,
  maxGuessesThisTurn: number | 'unlimited'
): GuessEvaluationResult {
  const card = board[cardIndex];
  if (!card) {
    throw new Error('無效的卡片索引。');
  }
  if (card.revealed) {
    throw new Error('此代號卡已經被翻開。');
  }

  card.revealed = true;
  card.revealedByTeam = guessingTeam;
  card.revealedAtTurn = turnNumber;
  card.marks = [];

  const redRemaining = board.filter((c) => c.type === 'red' && !c.revealed).length;
  const blueRemaining = board.filter((c) => c.type === 'blue' && !c.revealed).length;
  const guessesMadeNow = guessesMadeBeforeThis + 1;
  const oppositeTeam = getOppositeTeam(guessingTeam);

  // 1. Assassin check -> immediate defeat
  if (card.type === 'assassin') {
    return {
      cardType: 'assassin',
      outcome: 'assassin',
      canContinueGuessing: false,
      turnEnded: true,
      gameEnded: true,
      winnerTeam: oppositeTeam,
      winReason: 'assassin_revealed',
      redRemaining,
      blueRemaining,
    };
  }

  // 2. Check if either team has now revealed all of their agents
  if (redRemaining === 0) {
    return {
      cardType: card.type,
      outcome: guessingTeam === 'red' ? 'correct' : 'enemy',
      canContinueGuessing: false,
      turnEnded: true,
      gameEnded: true,
      winnerTeam: 'red',
      winReason:
        guessingTeam === 'red' ? 'all_agents_found' : 'opponent_revealed_last_agent',
      redRemaining,
      blueRemaining,
    };
  }

  if (blueRemaining === 0) {
    return {
      cardType: card.type,
      outcome: guessingTeam === 'blue' ? 'correct' : 'enemy',
      canContinueGuessing: false,
      turnEnded: true,
      gameEnded: true,
      winnerTeam: 'blue',
      winReason:
        guessingTeam === 'blue' ? 'all_agents_found' : 'opponent_revealed_last_agent',
      redRemaining,
      blueRemaining,
    };
  }

  // 3. Bystander -> end turn immediately
  if (card.type === 'bystander') {
    return {
      cardType: 'bystander',
      outcome: 'bystander',
      canContinueGuessing: false,
      turnEnded: true,
      gameEnded: false,
      winnerTeam: null,
      winReason: null,
      redRemaining,
      blueRemaining,
    };
  }

  // 4. Enemy agent -> end turn immediately
  if (card.type !== guessingTeam) {
    return {
      cardType: card.type,
      outcome: 'enemy',
      canContinueGuessing: false,
      turnEnded: true,
      gameEnded: false,
      winnerTeam: null,
      winReason: null,
      redRemaining,
      blueRemaining,
    };
  }

  // 5. Correct agent! Check if max guesses reached (N + 1)
  const reachedGuessLimit =
    maxGuessesThisTurn !== 'unlimited' && guessesMadeNow >= maxGuessesThisTurn;

  return {
    cardType: card.type,
    outcome: 'correct',
    canContinueGuessing: !reachedGuessLimit,
    turnEnded: reachedGuessLimit,
    gameEnded: false,
    winnerTeam: null,
    winReason: null,
    redRemaining,
    blueRemaining,
  };
}

/**
 * Sanitizes the 25 board cards for a specific viewer.
 * CRITICAL SECURITY REQUIREMENT:
 * Operatives and non-spymasters NEVER receive `card.type` for unrevealed cards
 * until the game is finished.
 */
export function sanitizeBoardForViewer(
  board: readonly ServerBoardCard[],
  viewerIsSpymaster: boolean,
  gameFinished: boolean
): ClientBoardCard[] {
  const canSeeSecret = viewerIsSpymaster || gameFinished;
  return board.map((card) => {
    const view: ClientBoardCard = {
      index: card.index,
      word: card.word,
      category: card.category,
      revealed: card.revealed,
      revealedByTeam: card.revealedByTeam,
      revealedAtTurn: card.revealedAtTurn,
      marks: [...card.marks],
    };
    if (card.revealed || canSeeSecret) {
      view.type = card.type;
    }
    return view;
  });
}
