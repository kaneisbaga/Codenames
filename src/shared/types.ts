export type Team = 'red' | 'blue';
export type CardType = 'red' | 'blue' | 'bystander' | 'assassin';
export type PlayerRole = 'spymaster' | 'operative';
export type TurnPhase = 'giving_clue' | 'guessing';
export type GameStatus = 'lobby' | 'playing' | 'finished';
export type GameMode = 'single_spymaster' | 'single_operative' | 'multiplayer' | 'practice';

export type AIDifficulty = 'easy' | 'normal' | 'hard';
export type AIPersonality = 'cautious' | 'risky' | 'associative' | 'analytical' | 'intuitive';
export type ClueStrictness = 'strict' | 'standard' | 'relaxed';
export type ClueCount = number | 'unlimited';

export interface RoomRulesConfig {
  allowZeroClue: boolean;
  allowUnlimitedClue: boolean;
  allowProperNouns: boolean;
  allowCompoundWords: boolean;
  clueStrictness: ClueStrictness;
  turnTimerSeconds: number; // 0 = no timer
  aiSpeed: 'fast' | 'normal' | 'cinematic';
  maxPlayers: number; // 4 to 8
  allowAI: boolean;
  autoFillAI: boolean;
  isPublic: boolean;
}

export interface RoomPlayer {
  id: string;
  name: string;
  team: Team;
  role: PlayerRole;
  isAI: boolean;
  aiDifficulty?: AIDifficulty;
  aiPersonality?: AIPersonality;
  isHost: boolean;
  isReady: boolean;
  isConnected: boolean;
  lastSeenAt: number;
}

/**
 * Internal server-side card structure (contains full secret identity).
 */
export interface ServerBoardCard {
  index: number;
  word: string;
  category: string;
  type: CardType;
  revealed: boolean;
  revealedByTeam?: Team;
  revealedAtTurn?: number;
  marks: string[]; // player IDs marking this card
}

/**
 * Sanitized client-side card view.
 * `type` is ONLY included if `revealed === true`, OR the receiving viewer is a spymaster, OR the game is finished.
 */
export interface ClientBoardCard {
  index: number;
  word: string;
  category: string;
  type?: CardType;
  revealed: boolean;
  revealedByTeam?: Team;
  revealedAtTurn?: number;
  marks: string[];
}

export interface Clue {
  id: string;
  turnNumber: number;
  team: Team;
  word: string;
  count: ClueCount;
  spymasterName: string;
  isAI: boolean;
  /** Public-safe thought summary (never reveals unrevealed card identities during active game) */
  publicReasoning?: string;
  /** Secret spymaster reasoning & target words (only visible to spymasters or after game finishes) */
  secretReasoning?: string;
  secretTargets?: string[];
  timestamp: number;
}

export interface GuessLogEntry {
  id: string;
  turnNumber: number;
  team: Team;
  playerName: string;
  isAI: boolean;
  cardIndex: number;
  word: string;
  cardType: CardType;
  outcome: 'correct' | 'bystander' | 'enemy' | 'assassin';
  /** AI operative's reasoning based strictly on public clues and visible board */
  reasoning?: string;
  confidence?: number;
  timestamp: number;
}

export interface AIThinkingState {
  active: boolean;
  actorId?: string;
  actorName?: string;
  team?: Team;
  role?: PlayerRole;
  stageText?: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  team?: Team;
  text: string;
  isSystem?: boolean;
  timestamp: number;
}

export type WinReason =
  | 'all_agents_found'
  | 'assassin_revealed'
  | 'opponent_revealed_last_agent';

/**
 * Sanitized room & game state sent to a specific client according to their role.
 */
export interface ClientRoomState {
  roomCode: string;
  mode: GameMode;
  status: GameStatus;
  hostId: string;
  createdAt: number;
  updatedAt: number;
  rules: RoomRulesConfig;
  players: RoomPlayer[];
  startingTeam: Team;
  currentTurnTeam: Team;
  turnPhase: TurnPhase;
  turnNumber: number;
  turnStartedAt: number;
  redRemaining: number;
  blueRemaining: number;
  redTotal: number;
  blueTotal: number;
  currentClue: Clue | null;
  guessesMadeThisTurn: number;
  maxGuessesThisTurn: number | 'unlimited';
  board: ClientBoardCard[];
  clueHistory: Clue[];
  guessHistory: GuessLogEntry[];
  chatMessages: ChatMessage[];
  aiThinking: AIThinkingState;
  winnerTeam: Team | null;
  winReason: WinReason | null;
  startedAt: number | null;
  finishedAt: number | null;
  /** Indicates whether the receiving client has spymaster keycard access */
  viewerIsSpymaster: boolean;
  viewerId: string;
  /** Latest AI Operative / Spymaster thought log visible to the user */
  aiThoughtLogs: AIThoughtLogEntry[];
}

export interface AIThoughtLogEntry {
  id: string;
  turnNumber: number;
  actorName: string;
  team: Team;
  role: PlayerRole;
  difficulty: AIDifficulty;
  personality: AIPersonality;
  provider: 'gemini' | 'local';
  summary: string;
  candidateScores?: Array<{ word: string; score: number; reason: string }>;
  timestamp: number;
}

export interface GameHistoryRecord {
  id: string;
  roomCode: string;
  playedAt: string;
  mode: GameMode;
  winnerTeam: Team;
  winReason: WinReason;
  playerName: string;
  playerTeam: Team;
  playerRole: PlayerRole;
  playerWon: boolean;
  durationSeconds: number;
  totalGuesses: number;
  aiDifficulty: AIDifficulty;
}

export interface UserSettings {
  nickname: string;
  aiDifficulty: AIDifficulty;
  aiPersonality: AIPersonality;
  aiSpeed: 'fast' | 'normal' | 'cinematic';
  turnTimerSeconds: number;
  allowZeroClue: boolean;
  allowUnlimitedClue: boolean;
  allowProperNouns: boolean;
  allowCompoundWords: boolean;
  clueStrictness: ClueStrictness;
  soundEnabled: boolean;
  soundVolume: number; // 0 to 1
  reducedMotion: boolean;
  themeMode: 'dark' | 'slate' | 'auto';
  cardSize: 'compact' | 'normal' | 'large';
  fontSize: 'normal' | 'large' | 'xlarge';
}

export interface ClueValidationResult {
  valid: boolean;
  reason?: string;
  normalizedWord: string;
}
