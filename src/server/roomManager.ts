import crypto from 'node:crypto';
import {
  AIDifficulty,
  AIPersonality,
  AIThinkingState,
  AIThoughtLogEntry,
  ChatMessage,
  ClientRoomState,
  Clue,
  ClueCount,
  GameHistoryRecord,
  GameMode,
  GameStatus,
  GuessLogEntry,
  PlayerRole,
  RoomPlayer,
  RoomRulesConfig,
  ServerBoardCard,
  Team,
  TurnPhase,
  WinReason,
} from '../shared/types';
import {
  calculateMaxGuesses,
  DEFAULT_ROOM_RULES,
  evaluateCardGuess,
  generateGameBoard,
  getOppositeTeam,
  sanitizeBoardForViewer,
   shuffleArray,
  validateClue,
} from '../shared/rulesEngine';
import { getDifficultyLabel, getPersonalityLabel } from '../shared/semanticEngine';
import { requestAIOperativeDecision, requestAISpymasterClue } from './aiProvider';
import {
  cleanupExpiredRooms,
  deleteRoomSnapshot,
  insertGameHistory,
  loadActiveRoomSnapshots,
  saveRoomSnapshot,
} from './db';

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const AI_AGENT_NAMES: Record<AIPersonality, string[]> = {
  cautious: ['代號・磐石 (AI)', '代號・守望 (AI)'],
  risky: ['代號・獵鷹 (AI)', '代號・赤鋒 (AI)'],
  associative: ['代號・星圖 (AI)', '代號・幻影 (AI)'],
  analytical: ['代號・稜鏡 (AI)', '代號・矩陣 (AI)'],
  intuitive: ['代號・閃電 (AI)', '代號・直覺 (AI)'],
};

export interface ServerRoomState {
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
  board: ServerBoardCard[];
  clueHistory: Clue[];
  guessHistory: GuessLogEntry[];
  chatMessages: ChatMessage[];
  aiThinking: AIThinkingState;
  winnerTeam: Team | null;
  winReason: WinReason | null;
  startedAt: number | null;
  finishedAt: number | null;
  aiThoughtLogs: AIThoughtLogEntry[];
  historyRecorded?: boolean;
}

export type RoomStateListener = (room: ServerRoomState) => void;

export class RoomManager {
  private rooms = new Map<string, ServerRoomState>();
  private actionLocks = new Set<string>();
  private aiTimers = new Map<string, NodeJS.Timeout>();
  private turnCountdownTimers = new Map<string, NodeJS.Timeout>();
  private onRoomUpdated?: RoomStateListener;
  private persistToDb: boolean;
  private stepDelayMultiplier: number;

  constructor(options?: {
    onRoomUpdated?: RoomStateListener;
    persistToDb?: boolean;
    stepDelayMultiplier?: number;
  }) {
    this.onRoomUpdated = options?.onRoomUpdated;
    this.persistToDb = options?.persistToDb ?? true;
    this.stepDelayMultiplier = options?.stepDelayMultiplier ?? 1;

    if (this.persistToDb) {
      this.restoreFromDatabase();
    }
  }

  public setUpdateListener(listener: RoomStateListener): void {
    this.onRoomUpdated = listener;
  }

  public restoreFromDatabase(): void {
    const snapshots = loadActiveRoomSnapshots<ServerRoomState>();
    for (const room of snapshots) {
      room.aiThinking = { active: false };
      for (const p of room.players) {
        if (!p.isAI) {
          p.isConnected = false;
        }
      }
      this.rooms.set(room.roomCode, room);
    }
  }

  public generateUniqueRoomCode(): string {
    for (let attempt = 0; attempt < 100; attempt++) {
      let code = '';
      for (let i = 0; i < 6; i++) {
        const idx = Math.floor(Math.random() * ROOM_CODE_CHARS.length);
        code += ROOM_CODE_CHARS[idx];
      }
      if (!this.rooms.has(code)) {
        return code;
      }
    }
    return crypto.randomBytes(3).toString('hex').toUpperCase();
  }

  public getRoom(roomCode: string): ServerRoomState | undefined {
    return this.rooms.get(roomCode.toUpperCase());
  }

  public listPublicRooms(): Array<{
    roomCode: string;
    hostName: string;
    playerCount: number;
    maxPlayers: number;
    status: GameStatus;
    mode: GameMode;
    createdAt: number;
  }> {
    this.runExpiryCleanup();
    const list: Array<{
      roomCode: string;
      hostName: string;
      playerCount: number;
      maxPlayers: number;
      status: GameStatus;
      mode: GameMode;
      createdAt: number;
    }> = [];

    for (const room of this.rooms.values()) {
      if (room.mode === 'multiplayer' && room.rules.isPublic) {
        const host = room.players.find((p) => p.id === room.hostId) ?? room.players[0];
        list.push({
          roomCode: room.roomCode,
          hostName: host?.name ?? '未知特務',
          playerCount: room.players.length,
          maxPlayers: room.rules.maxPlayers,
          status: room.status,
          mode: room.mode,
          createdAt: room.createdAt,
        });
      }
    }
    return list.sort((a, b) => b.createdAt - a.createdAt);
  }

  public runExpiryCleanup(expiryMs?: number): number {
    const cutoff = Date.now() - (expiryMs || Number(process.env.ROOM_EXPIRY_MS) || 86400000);
    let removed = 0;
    for (const [code, room] of this.rooms.entries()) {
      if (room.updatedAt < cutoff) {
        this.clearTimers(code);
        this.rooms.delete(code);
        removed++;
      }
    }
    if (this.persistToDb) {
      cleanupExpiredRooms(expiryMs);
    }
    return removed;
  }

  /**
   * Creates a new room (Single-player AI, Multiplayer, or Practice).
   */
  public createRoom(params: {
    hostId: string;
    hostName: string;
    mode: GameMode;
    hostTeam?: Team;
    hostRole?: PlayerRole;
    aiDifficulty?: AIDifficulty;
    aiPersonality?: AIPersonality;
    rules?: Partial<RoomRulesConfig>;
    autoStart?: boolean;
  }): ServerRoomState {
    const roomCode = this.generateUniqueRoomCode();
    const now = Date.now();
    const rules: RoomRulesConfig = {
      ...DEFAULT_ROOM_RULES,
      ...params.rules,
      isPublic:
        params.mode === 'multiplayer'
          ? (params.rules?.isPublic ?? true)
          : false,
    };

    const hostTeam: Team = params.hostTeam ?? 'red';
    const hostRole: PlayerRole =
      params.mode === 'single_spymaster'
        ? 'spymaster'
        : params.mode === 'single_operative'
        ? 'operative'
        : params.hostRole ?? 'spymaster';

    const generated = generateGameBoard(
      params.mode === 'single_spymaster' || params.mode === 'single_operative'
        ? hostTeam
        : undefined
    );

    const hostPlayer: RoomPlayer = {
      id: params.hostId,
      name: params.hostName.trim() || '特務指揮官',
      team: hostTeam,
      role: hostRole,
      isAI: false,
      isHost: true,
      isReady: true,
      isConnected: true,
      lastSeenAt: now,
    };

    const room: ServerRoomState = {
      roomCode,
      mode: params.mode,
      status: 'lobby',
      hostId: params.hostId,
      createdAt: now,
      updatedAt: now,
      rules,
      players: [hostPlayer],
      startingTeam: generated.startingTeam,
      currentTurnTeam: generated.startingTeam,
      turnPhase: 'giving_clue',
      turnNumber: 1,
      turnStartedAt: now,
      redRemaining: generated.redTotal,
      blueRemaining: generated.blueTotal,
      redTotal: generated.redTotal,
      blueTotal: generated.blueTotal,
      currentClue: null,
      guessesMadeThisTurn: 0,
      maxGuessesThisTurn: 1,
      board: generated.board,
      clueHistory: [],
      guessHistory: [],
      chatMessages: [
        {
          id: crypto.randomUUID(),
          senderId: 'system',
          senderName: '情報中心系統',
          text: `行動房間 [${roomCode}] 已建立。`,
          isSystem: true,
          timestamp: now,
        },
      ],
      aiThinking: { active: false },
      winnerTeam: null,
      winReason: null,
      startedAt: null,
      finishedAt: null,
      aiThoughtLogs: [],
    };

    this.rooms.set(roomCode, room);

    // If single-player or practice mode, populate required AI teammates/opponents automatically
    if (
      params.mode === 'single_spymaster' ||
      params.mode === 'single_operative' ||
      params.mode === 'practice'
    ) {
      const diff = params.aiDifficulty ?? 'normal';
      const pers = params.aiPersonality ?? 'analytical';
      this.fillRequiredAISeats(room, diff, pers);
      if (params.autoStart !== false) {
        this.startGame(roomCode, params.hostId, hostTeam);
      }
    } else {
      this.saveAndBroadcast(room);
    }

    return room;
  }

  /**
   * Joins an existing room or reconnects an existing player by `playerId`.
   */
  public joinRoom(params: {
    roomCode: string;
    playerId: string;
    playerName: string;
  }): ServerRoomState {
    const code = params.roomCode.trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) {
      throw new Error(`找不到房間代碼「${code}」，請確認代碼是否正確。`);
    }

    const existing = room.players.find((p) => p.id === params.playerId);
    if (existing) {
      existing.isConnected = true;
      if (params.playerName.trim()) {
        existing.name = params.playerName.trim();
      }
      existing.lastSeenAt = Date.now();
      this.saveAndBroadcast(room);
      return room;
    }

    if (room.players.filter((p) => !p.isAI).length >= room.rules.maxPlayers) {
      throw new Error('此房間席位已滿。');
    }

    // Balance team & role assignment for new human player
    const redCount = room.players.filter((p) => p.team === 'red').length;
    const blueCount = room.players.filter((p) => p.team === 'blue').length;
    const assignedTeam: Team = redCount <= blueCount ? 'red' : 'blue';
    const hasTeamSpymaster = room.players.some(
      (p) => p.team === assignedTeam && p.role === 'spymaster'
    );
    const assignedRole: PlayerRole = hasTeamSpymaster ? 'operative' : 'spymaster';

    const newPlayer: RoomPlayer = {
      id: params.playerId,
      name: params.playerName.trim() || `特務-${params.playerId.slice(0, 4)}`,
      team: assignedTeam,
      role: assignedRole,
      isAI: false,
      isHost: false,
      isReady: true,
      isConnected: true,
      lastSeenAt: Date.now(),
    };

    room.players.push(newPlayer);
    room.chatMessages.push({
      id: crypto.randomUUID(),
      senderId: 'system',
      senderName: '情報中心系統',
      text: `${newPlayer.name} 已加入房間。`,
      isSystem: true,
      timestamp: Date.now(),
    });

    this.saveAndBroadcast(room);
    return room;
  }

  public markPlayerDisconnected(roomCode: string, playerId: string): void {
    const room = this.rooms.get(roomCode.toUpperCase());
    if (!room) return;
    const player = room.players.find((p) => p.id === playerId && !p.isAI);
    if (!player) return;
    player.isConnected = false;
    player.lastSeenAt = Date.now();
    this.saveAndBroadcast(room);
  }

  public leaveRoom(roomCode: string, playerId: string): ServerRoomState | null {
    const code = roomCode.toUpperCase();
    const room = this.rooms.get(code);
    if (!room) return null;

    const idx = room.players.findIndex((p) => p.id === playerId);
    if (idx === -1) return room;

    const [removed] = room.players.splice(idx, 1);

    const remainingHumans = room.players.filter((p) => !p.isAI);
    if (remainingHumans.length === 0) {
      this.clearTimers(code);
      this.rooms.delete(code);
      if (this.persistToDb) {
        deleteRoomSnapshot(code);
      }
      return null;
    }

    if (room.hostId === playerId) {
      const nextHost = remainingHumans[0];
      room.hostId = nextHost.id;
      nextHost.isHost = true;
    }

    room.chatMessages.push({
      id: crypto.randomUUID(),
      senderId: 'system',
      senderName: '情報中心系統',
      text: `${removed.name} 離開了房間。`,
      isSystem: true,
      timestamp: Date.now(),
    });

    this.saveAndBroadcast(room);
    return room;
  }

  /**
   * Updates a player's team/role/ready status or allows the host to assign any player's seat.
   */
  public updateSeat(params: {
    roomCode: string;
    requesterId: string;
    targetPlayerId: string;
    team?: Team;
    role?: PlayerRole;
    isReady?: boolean;
    aiDifficulty?: AIDifficulty;
    aiPersonality?: AIPersonality;
  }): ServerRoomState {
    const room = this.requireRoom(params.roomCode);
    const isHost = room.hostId === params.requesterId;
    const isSelf = params.requesterId === params.targetPlayerId;

    if (!isHost && !isSelf) {
      throw new Error('只有房主可以調整其他特務的隊伍與職位。');
    }

    const target = room.players.find((p) => p.id === params.targetPlayerId);
    if (!target) {
      throw new Error('找不到指定的玩家席位。');
    }

    const nextTeam = params.team ?? target.team;
    const nextRole = params.role ?? target.role;

    // If setting someone as spymaster, demote existing spymaster of that team to operative
    if (nextRole === 'spymaster') {
      for (const other of room.players) {
        if (other.id !== target.id && other.team === nextTeam && other.role === 'spymaster') {
          other.role = 'operative';
        }
      }
    }

    target.team = nextTeam;
    target.role = nextRole;
    if (params.isReady !== undefined) {
      target.isReady = params.isReady;
    }
    if (target.isAI) {
      if (params.aiDifficulty) target.aiDifficulty = params.aiDifficulty;
      if (params.aiPersonality) target.aiPersonality = params.aiPersonality;
    }

    this.saveAndBroadcast(room);
    return room;
  }

  /**
   * Host adds an AI player to a specific team & role.
   */
  public addAIPlayer(params: {
    roomCode: string;
    requesterId: string;
    team: Team;
    role: PlayerRole;
    difficulty?: AIDifficulty;
    personality?: AIPersonality;
  }): ServerRoomState {
    const room = this.requireRoom(params.roomCode);
    this.requireHost(room, params.requesterId);

    if (!room.rules.allowAI) {
      throw new Error('目前房間設定不允許加入 AI 特務。');
    }
    if (room.players.length >= 8) {
      throw new Error('房間總席位已達上限 (8 人)。');
    }

    const difficulty: AIDifficulty = params.difficulty ?? 'normal';
    const personalities: AIPersonality[] = [
      'analytical',
      'cautious',
      'associative',
      'intuitive',
      'risky',
    ];
    const personality: AIPersonality =
      params.personality ??
      personalities[room.players.filter((p) => p.isAI).length % personalities.length];

    if (params.role === 'spymaster') {
      for (const p of room.players) {
        if (p.team === params.team && p.role === 'spymaster') {
          p.role = 'operative';
        }
      }
    }

    const namePool = AI_AGENT_NAMES[personality];
    const aiCount = room.players.filter((p) => p.isAI).length;
    const aiName = `${namePool[aiCount % namePool.length]} #${aiCount + 1}`;

    const aiPlayer: RoomPlayer = {
      id: `ai-${crypto.randomUUID().slice(0, 8)}`,
      name: aiName,
      team: params.team,
      role: params.role,
      isAI: true,
      aiDifficulty: difficulty,
      aiPersonality: personality,
      isHost: false,
      isReady: true,
      isConnected: true,
      lastSeenAt: Date.now(),
    };

    room.players.push(aiPlayer);
    this.saveAndBroadcast(room);
    return room;
  }

  public removePlayer(params: {
    roomCode: string;
    requesterId: string;
    targetPlayerId: string;
  }): ServerRoomState {
    const room = this.requireRoom(params.roomCode);
    this.requireHost(room, params.requesterId);

    if (params.targetPlayerId === room.hostId) {
      throw new Error('房主不可移除自己。');
    }

    room.players = room.players.filter((p) => p.id !== params.targetPlayerId);
    this.saveAndBroadcast(room);
    return room;
  }

  /**
   * Automatically distributes existing human players and optionally fills missing seats with AI.
   */
  public autoAssignTeams(params: {
    roomCode: string;
    requesterId: string;
    fillWithAI?: boolean;
    aiDifficulty?: AIDifficulty;
  }): ServerRoomState {
    const room = this.requireRoom(params.roomCode);
    this.requireHost(room, params.requesterId);

    const humans = shuffleArray(room.players.filter((p) => !p.isAI));
    room.players = [...humans];

    const slots: Array<{ team: Team; role: PlayerRole }> = [
      { team: 'red', role: 'spymaster' },
      { team: 'blue', role: 'spymaster' },
      { team: 'red', role: 'operative' },
      { team: 'blue', role: 'operative' },
    ];

    humans.forEach((p, idx) => {
      if (idx < slots.length) {
        p.team = slots[idx].team;
        p.role = slots[idx].role;
      } else {
        p.team = idx % 2 === 0 ? 'red' : 'blue';
        p.role = 'operative';
      }
    });

    if (params.fillWithAI ?? room.rules.autoFillAI) {
      this.fillRequiredAISeats(room, params.aiDifficulty ?? 'normal', 'analytical');
    }

    this.saveAndBroadcast(room);
    return room;
  }

  public updateRoomRules(params: {
    roomCode: string;
    requesterId: string;
    rules: Partial<RoomRulesConfig>;
  }): ServerRoomState {
    const room = this.requireRoom(params.roomCode);
    this.requireHost(room, params.requesterId);

    room.rules = {
      ...room.rules,
      ...params.rules,
    };
    this.saveAndBroadcast(room);
    return room;
  }

  /**
   * Ensures both Red and Blue teams have at least 1 Spymaster and 1 Operative,
   * filling any vacant core role with an AI agent if `allowAI` / `autoFillAI` is enabled.
   */
  public fillRequiredAISeats(
    room: ServerRoomState,
    defaultDifficulty: AIDifficulty = 'normal',
    defaultPersonality: AIPersonality = 'analytical'
  ): void {
    const requiredRoles: Array<{ team: Team; role: PlayerRole; fallbackPersonality: AIPersonality }> = [
      { team: 'red', role: 'spymaster', fallbackPersonality: defaultPersonality },
      { team: 'red', role: 'operative', fallbackPersonality: 'associative' },
      { team: 'blue', role: 'spymaster', fallbackPersonality: defaultPersonality },
      { team: 'blue', role: 'operative', fallbackPersonality: 'cautious' },
    ];

    let aiCounter = room.players.filter((p) => p.isAI).length;

    for (const req of requiredRoles) {
      const exists = room.players.some(
        (p) => p.team === req.team && p.role === req.role
      );
      if (!exists) {
        const namePool = AI_AGENT_NAMES[req.fallbackPersonality];
        const aiName = `${namePool[aiCounter % namePool.length]} #${aiCounter + 1}`;
        aiCounter++;

        room.players.push({
          id: `ai-${crypto.randomUUID().slice(0, 8)}`,
          name: aiName,
          team: req.team,
          role: req.role,
          isAI: true,
          aiDifficulty: defaultDifficulty,
          aiPersonality: req.fallbackPersonality,
          isHost: false,
          isReady: true,
          isConnected: true,
          lastSeenAt: Date.now(),
        });
      }
    }
  }

  /**
   * Starts or restarts a game in the room.
   */
  public startGame(
    roomCode: string,
    requesterId: string,
    forcedStartingTeam?: Team
  ): ServerRoomState {
    const room = this.requireRoom(roomCode);
    this.requireHost(room, requesterId);
    this.clearTimers(room.roomCode);

    if (room.rules.allowAI && room.rules.autoFillAI) {
      const existingAI = room.players.find((p) => p.isAI);
      this.fillRequiredAISeats(
        room,
        existingAI?.aiDifficulty ?? 'normal',
        existingAI?.aiPersonality ?? 'analytical'
      );
    }

    // Validate both teams have a Spymaster and at least 1 Operative
    const teams: Team[] = ['red', 'blue'];
    for (const t of teams) {
      const teamLabel = t === 'red' ? '紅隊' : '藍隊';
      const hasSpymaster = room.players.some((p) => p.team === t && p.role === 'spymaster');
      const hasOperative = room.players.some((p) => p.team === t && p.role === 'operative');
      if (!hasSpymaster || !hasOperative) {
        throw new Error(
          `${teamLabel}必須至少有 1 名間諜領袖與 1 名間諜隊員（可開啟 AI 自動補位）。`
        );
      }
    }

    const generated = generateGameBoard(forcedStartingTeam);
    const now = Date.now();

    room.status = 'playing';
    room.startingTeam = generated.startingTeam;
    room.currentTurnTeam = generated.startingTeam;
    room.turnPhase = 'giving_clue';
    room.turnNumber = 1;
    room.turnStartedAt = now;
    room.redRemaining = generated.redTotal;
    room.blueRemaining = generated.blueTotal;
    room.redTotal = generated.redTotal;
    room.blueTotal = generated.blueTotal;
    room.currentClue = null;
    room.guessesMadeThisTurn = 0;
    room.maxGuessesThisTurn = 1;
    room.board = generated.board;
    room.clueHistory = [];
    room.guessHistory = [];
    room.aiThinking = { active: false };
    room.winnerTeam = null;
    room.winReason = null;
    room.startedAt = now;
    room.finishedAt = null;
    room.aiThoughtLogs = [];
    room.historyRecorded = false;

    room.chatMessages.push({
      id: crypto.randomUUID(),
      senderId: 'system',
      senderName: '情報中心系統',
      text: `暗線任務正式展開！由${
        room.startingTeam === 'red' ? '紅隊 (9 名特務)' : '藍隊 (9 名特務)'
      }先攻。`,
      isSystem: true,
      timestamp: now,
    });

    this.saveAndBroadcast(room);
    this.scheduleTurnTimer(room);
    this.scheduleAITurnIfNeeded(room);
    return room;
  }

  /**
   * Submits a clue from the active team's Spymaster.
   */
  public submitClue(params: {
    roomCode: string;
    playerId: string;
    word: string;
    count: ClueCount;
    publicReasoning?: string;
    secretReasoning?: string;
    secretTargets?: string[];
  }): ServerRoomState {
    const room = this.requireRoom(params.roomCode);

    if (room.status !== 'playing') {
      throw new Error('目前不在進行中的遊戲狀態。');
    }
    if (room.turnPhase !== 'giving_clue') {
      throw new Error('目前已給出線索，正處於隊員猜測階段。');
    }

    const player = room.players.find((p) => p.id === params.playerId);
    if (!player) {
      throw new Error('你不在此房間中。');
    }
    if (player.team !== room.currentTurnTeam) {
      throw new Error('目前不是你所屬陣營的回合。');
    }
    if (player.role !== 'spymaster') {
      throw new Error('權限拒絕：只有間諜領袖可以提交線索。');
    }

    const validation = validateClue(params.word, params.count, room.board, room.rules);
    if (!validation.valid) {
      throw new Error(validation.reason || '不合法的線索。');
    }

    const now = Date.now();
    const clue: Clue = {
      id: crypto.randomUUID(),
      turnNumber: room.turnNumber,
      team: room.currentTurnTeam,
      word: validation.normalizedWord,
      count: params.count,
      spymasterName: player.name,
      isAI: player.isAI,
      publicReasoning: params.publicReasoning,
      secretReasoning: params.secretReasoning,
      secretTargets: params.secretTargets,
      timestamp: now,
    };

    room.currentClue = clue;
    room.clueHistory.push(clue);
    room.turnPhase = 'guessing';
    room.guessesMadeThisTurn = 0;
    room.maxGuessesThisTurn = calculateMaxGuesses(clue.count);
    room.turnStartedAt = now;

    this.saveAndBroadcast(room);
    this.scheduleTurnTimer(room);
    this.scheduleAITurnIfNeeded(room);
    return room;
  }

  /**
   * Toggles a candidate mark on an unrevealed card by an operative.
   */
  public toggleCardMark(params: {
    roomCode: string;
    playerId: string;
    cardIndex: number;
  }): ServerRoomState {
    const room = this.requireRoom(params.roomCode);
    if (room.status !== 'playing') return room;

    const player = room.players.find((p) => p.id === params.playerId);
    if (!player || player.role !== 'operative') return room;

    const card = room.board[params.cardIndex];
    if (!card || card.revealed) return room;

    const existingIdx = card.marks.indexOf(player.name);
    if (existingIdx >= 0) {
      card.marks.splice(existingIdx, 1);
    } else {
      card.marks.push(player.name);
    }

    this.saveAndBroadcast(room);
    return room;
  }

  /**
   * Makes a card guess (flips a card) by an active team's Operative.
   */
  public makeGuess(params: {
    roomCode: string;
    playerId: string;
    cardIndex: number;
    reasoning?: string;
    confidence?: number;
  }): ServerRoomState {
    const room = this.requireRoom(params.roomCode);
    const lockKey = `${room.roomCode}:guess`;
    if (this.actionLocks.has(lockKey)) {
      throw new Error('系統正在處理上一張翻牌動作，請稍候。');
    }

    this.actionLocks.add(lockKey);
    try {
      if (room.status !== 'playing') {
        throw new Error('遊戲尚未開始或已經結束。');
      }
      if (room.turnPhase !== 'guessing') {
        throw new Error('目前尚未由間諜領袖提供線索，無法翻牌。');
      }

      const player = room.players.find((p) => p.id === params.playerId);
      if (!player) {
        throw new Error('你不在此房間中。');
      }
      if (player.team !== room.currentTurnTeam) {
        throw new Error('目前不是你所屬陣營的回合。');
      }
      if (player.role !== 'operative') {
        throw new Error('權限拒絕：間諜領袖不可親自翻牌猜測。');
      }

      const card = room.board[params.cardIndex];
      if (!card) {
        throw new Error('無效的代號卡片位置。');
      }
      if (card.revealed) {
        throw new Error('此代號卡已經翻開過了。');
      }

      const evalResult = evaluateCardGuess(
        room.board,
        params.cardIndex,
        room.currentTurnTeam,
        room.turnNumber,
        room.guessesMadeThisTurn,
        room.maxGuessesThisTurn
      );

      room.guessesMadeThisTurn += 1;
      room.redRemaining = evalResult.redRemaining;
      room.blueRemaining = evalResult.blueRemaining;

      const guessEntry: GuessLogEntry = {
        id: crypto.randomUUID(),
        turnNumber: room.turnNumber,
        team: room.currentTurnTeam,
        playerName: player.name,
        isAI: player.isAI,
        cardIndex: params.cardIndex,
        word: card.word,
        cardType: evalResult.cardType,
        outcome: evalResult.outcome,
        reasoning: params.reasoning,
        confidence: params.confidence,
        timestamp: Date.now(),
      };
      room.guessHistory.push(guessEntry);

      if (evalResult.gameEnded && evalResult.winnerTeam && evalResult.winReason) {
        this.finishGame(room, evalResult.winnerTeam, evalResult.winReason);
      } else if (evalResult.turnEnded) {
        this.advanceToNextTeamTurn(room);
      } else {
        this.saveAndBroadcast(room);
        this.scheduleAITurnIfNeeded(room);
      }

      return room;
    } finally {
      this.actionLocks.delete(lockKey);
    }
  }

  /**
   * Ends the current guessing turn voluntarily by an active team's Operative.
   */
  public endTurn(params: {
    roomCode: string;
    playerId: string;
    reasoning?: string;
  }): ServerRoomState {
    const room = this.requireRoom(params.roomCode);
    if (room.status !== 'playing') {
      throw new Error('遊戲未在進行中。');
    }
    if (room.turnPhase !== 'guessing') {
      throw new Error('在間諜領袖提供線索前無法結束猜測回合。');
    }

    const player = room.players.find((p) => p.id === params.playerId);
    if (!player) {
      throw new Error('你不在此房間中。');
    }
    if (player.team !== room.currentTurnTeam) {
      throw new Error('目前不是你所屬陣營的回合。');
    }
    if (player.role !== 'operative') {
      throw new Error('只有間諜隊員可以結束猜測階段。');
    }

    this.advanceToNextTeamTurn(room);
    return room;
  }

  public addChatMessage(params: {
    roomCode: string;
    senderId: string;
    text: string;
  }): ServerRoomState {
    const room = this.requireRoom(params.roomCode);
    const player = room.players.find((p) => p.id === params.senderId);
    if (!player) {
      throw new Error('你不在此房間中。');
    }
    const cleanText = params.text.trim().slice(0, 300);
    if (!cleanText) return room;

    room.chatMessages.push({
      id: crypto.randomUUID(),
      senderId: player.id,
      senderName: player.name,
      team: player.team,
      text: cleanText,
      timestamp: Date.now(),
    });
    if (room.chatMessages.length > 100) {
      room.chatMessages = room.chatMessages.slice(-100);
    }

    this.saveAndBroadcast(room);
    return room;
  }

  /**
   * Produces a role-sanitized view of the room for a specific player.
   * Ensures unrevealed card identities and secret spymaster target lists are NEVER leaked to operatives.
   */
  public sanitizeRoomForViewer(
    room: ServerRoomState,
    viewerId: string
  ): ClientRoomState {
    const viewer = room.players.find((p) => p.id === viewerId);
    const viewerIsSpymaster = viewer?.role === 'spymaster';
    const gameFinished = room.status === 'finished';
    const canSeeSecret = Boolean(viewerIsSpymaster || gameFinished);

    const sanitizedClues: Clue[] = room.clueHistory.map((c) => ({
      id: c.id,
      turnNumber: c.turnNumber,
      team: c.team,
      word: c.word,
      count: c.count,
      spymasterName: c.spymasterName,
      isAI: c.isAI,
      publicReasoning: c.publicReasoning,
      secretReasoning: canSeeSecret ? c.secretReasoning : undefined,
      secretTargets: canSeeSecret ? c.secretTargets : undefined,
      timestamp: c.timestamp,
    }));

    const currentClueSanitized: Clue | null = room.currentClue
      ? {
          ...room.currentClue,
          secretReasoning: canSeeSecret ? room.currentClue.secretReasoning : undefined,
          secretTargets: canSeeSecret ? room.currentClue.secretTargets : undefined,
        }
      : null;

    // Filter AI thought logs so operatives don't see Spymaster secret candidate scores during an active game
    const sanitizedThoughtLogs: AIThoughtLogEntry[] = room.aiThoughtLogs.map((log) => {
      if (log.role === 'spymaster' && !canSeeSecret) {
        return {
          ...log,
          candidateScores: undefined,
        };
      }
      return log;
    });

    return {
      roomCode: room.roomCode,
      mode: room.mode,
      status: room.status,
      hostId: room.hostId,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
      rules: { ...room.rules },
      players: room.players.map((p) => ({ ...p })),
      startingTeam: room.startingTeam,
      currentTurnTeam: room.currentTurnTeam,
      turnPhase: room.turnPhase,
      turnNumber: room.turnNumber,
      turnStartedAt: room.turnStartedAt,
      redRemaining: room.redRemaining,
      blueRemaining: room.blueRemaining,
      redTotal: room.redTotal,
      blueTotal: room.blueTotal,
      currentClue: currentClueSanitized,
      guessesMadeThisTurn: room.guessesMadeThisTurn,
      maxGuessesThisTurn: room.maxGuessesThisTurn,
      board: sanitizeBoardForViewer(room.board, Boolean(viewerIsSpymaster), gameFinished),
      clueHistory: sanitizedClues,
      guessHistory: [...room.guessHistory],
      chatMessages: [...room.chatMessages],
      aiThinking: { ...room.aiThinking },
      winnerTeam: room.winnerTeam,
      winReason: room.winReason,
      startedAt: room.startedAt,
      finishedAt: room.finishedAt,
      viewerIsSpymaster: Boolean(viewerIsSpymaster),
      viewerId,
      aiThoughtLogs: sanitizedThoughtLogs,
    };
  }

  private advanceToNextTeamTurn(room: ServerRoomState): void {
    room.currentTurnTeam = getOppositeTeam(room.currentTurnTeam);
    room.turnPhase = 'giving_clue';
    room.turnNumber += 1;
    room.turnStartedAt = Date.now();
    room.currentClue = null;
    room.guessesMadeThisTurn = 0;
    room.maxGuessesThisTurn = 1;
    room.aiThinking = { active: false };
    for (const c of room.board) {
      c.marks = [];
    }

    this.saveAndBroadcast(room);
    this.scheduleTurnTimer(room);
    this.scheduleAITurnIfNeeded(room);
  }

  private finishGame(
    room: ServerRoomState,
    winnerTeam: Team,
    winReason: WinReason
  ): void {
    this.clearTimers(room.roomCode);
    room.status = 'finished';
    room.winnerTeam = winnerTeam;
    room.winReason = winReason;
    room.finishedAt = Date.now();
    room.aiThinking = { active: false };

    const winnerLabel = winnerTeam === 'red' ? '紅隊' : '藍隊';
    const reasonText =
      winReason === 'assassin_revealed'
        ? '因對手誤觸殺手代號，'
        : winReason === 'opponent_revealed_last_agent'
        ? '因對手翻出最後一名特務，'
        : '成功找出所有己方特務，';

    room.chatMessages.push({
      id: crypto.randomUUID(),
      senderId: 'system',
      senderName: '情報中心系統',
      text: `任務結束！${reasonText}由【${winnerLabel}】奪得最終勝利！`,
      isSystem: true,
      timestamp: room.finishedAt,
    });

    if (this.persistToDb && !room.historyRecorded) {
      room.historyRecorded = true;
      const durationSeconds = room.startedAt
        ? Math.max(1, Math.round((room.finishedAt - room.startedAt) / 1000))
        : 60;
      const aiPlayer = room.players.find((p) => p.isAI);
      const aiDifficulty: AIDifficulty = aiPlayer?.aiDifficulty ?? 'normal';

      const humanPlayers = room.players.filter((p) => !p.isAI);
      for (const human of humanPlayers) {
        const record: GameHistoryRecord = {
          id: crypto.randomUUID(),
          roomCode: room.roomCode,
          playedAt: new Date(room.finishedAt).toISOString(),
          mode: room.mode,
          winnerTeam,
          winReason,
          playerName: human.name,
          playerTeam: human.team,
          playerRole: human.role,
          playerWon: human.team === winnerTeam,
          durationSeconds,
          totalGuesses: room.guessHistory.length,
          aiDifficulty,
        };
        insertGameHistory(record);
      }
    }

    this.saveAndBroadcast(room);
  }

  private scheduleTurnTimer(room: ServerRoomState): void {
    const existing = this.turnCountdownTimers.get(room.roomCode);
    if (existing) {
      clearTimeout(existing);
      this.turnCountdownTimers.delete(room.roomCode);
    }

    if (room.status !== 'playing' || !room.rules.turnTimerSeconds || room.rules.turnTimerSeconds <= 0) {
      return;
    }

    const timeoutMs = room.rules.turnTimerSeconds * 1000;
    const expectedTurn = room.turnNumber;
    const expectedPhase = room.turnPhase;

    const timer = setTimeout(() => {
      const currentRoom = this.rooms.get(room.roomCode);
      if (
        !currentRoom ||
        currentRoom.status !== 'playing' ||
        currentRoom.turnNumber !== expectedTurn ||
        currentRoom.turnPhase !== expectedPhase
      ) {
        return;
      }

      if (currentRoom.turnPhase === 'giving_clue') {
        // Auto-generate a safe 1-word fallback clue on timeout
        const spymaster = currentRoom.players.find(
          (p) => p.team === currentRoom.currentTurnTeam && p.role === 'spymaster'
        );
        if (spymaster) {
          void this.executeAISpymasterTurn(currentRoom, spymaster);
        }
      } else {
        this.advanceToNextTeamTurn(currentRoom);
      }
    }, timeoutMs);

    this.turnCountdownTimers.set(room.roomCode, timer);
  }

  /**
   * Checks if the active role of `currentTurnTeam` should be executed by an AI player.
   * Note: In mixed teams (human + AI operatives on the same team), if there is a connected
   * human operative on that team, the human operative has control (and can also ask AI or click cards);
   * if all operatives on `currentTurnTeam` are AI, the AI operative acts automatically!
   */
  private scheduleAITurnIfNeeded(room: ServerRoomState): void {
    if (room.status !== 'playing') return;

    const existingTimer = this.aiTimers.get(room.roomCode);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.aiTimers.delete(room.roomCode);
    }

    if (room.turnPhase === 'giving_clue') {
      const spymaster = room.players.find(
        (p) => p.team === room.currentTurnTeam && p.role === 'spymaster'
      );
      if (spymaster && spymaster.isAI) {
        const timer = setTimeout(() => {
          void this.executeAISpymasterTurn(room, spymaster);
        }, this.getBaseDelayMs(room, 250));
        this.aiTimers.set(room.roomCode, timer);
      }
    } else if (room.turnPhase === 'guessing') {
      const teamOperatives = room.players.filter(
        (p) => p.team === room.currentTurnTeam && p.role === 'operative'
      );
      const hasConnectedHumanOperative = teamOperatives.some(
        (p) => !p.isAI && p.isConnected
      );
      const aiOperative = teamOperatives.find((p) => p.isAI);

      if (!hasConnectedHumanOperative && aiOperative) {
        const timer = setTimeout(() => {
          void this.executeAIOperativeTurn(room, aiOperative);
        }, this.getBaseDelayMs(room, 350));
        this.aiTimers.set(room.roomCode, timer);
      }
    }
  }

  /**
   * Allows a human team in mixed or practice mode to explicitly trigger an AI teammate suggestion/action.
   */
  public async triggerAIAssist(params: {
    roomCode: string;
    requesterId: string;
  }): Promise<ServerRoomState> {
    const room = this.requireRoom(params.roomCode);
    if (room.status !== 'playing') return room;

    const actor: RoomPlayer = {
      id: 'ai-assist',
      name: '戰術 AI 顧問',
      team: room.currentTurnTeam,
      role: room.turnPhase === 'giving_clue' ? 'spymaster' : 'operative',
      isAI: true,
      aiDifficulty: 'hard',
      aiPersonality: 'analytical',
      isHost: false,
      isReady: true,
      isConnected: true,
      lastSeenAt: Date.now(),
    };

    if (room.turnPhase === 'giving_clue') {
      await this.executeAISpymasterTurn(room, actor, true);
    } else {
      await this.executeAIOperativeTurn(room, actor, true);
    }
    return room;
  }

  private async executeAISpymasterTurn(
    room: ServerRoomState,
    spymaster: RoomPlayer,
    assistOnly = false
  ): Promise<void> {
    const expectedTurn = room.turnNumber;
    const difficulty = spymaster.aiDifficulty ?? 'normal';
    const personality = spymaster.aiPersonality ?? 'analytical';

    const stages = [
      '「正在分析線索……」',
      '「正在比對代號……」',
      '「正在評估風險……」',
    ];

    for (const stageText of stages) {
      if (
        room.status !== 'playing' ||
        room.turnNumber !== expectedTurn ||
        room.turnPhase !== 'giving_clue'
      ) {
        return;
      }
      room.aiThinking = {
        active: true,
        actorId: spymaster.id,
        actorName: spymaster.name,
        team: spymaster.team,
        role: 'spymaster',
        stageText,
      };
      this.saveAndBroadcast(room);
      await this.sleep(this.getBaseDelayMs(room, 280));
    }

    const usedWords = room.clueHistory.map((c) => c.word);
    const decision = await requestAISpymasterClue({
      board: room.board,
      team: room.currentTurnTeam,
      difficulty,
      personality,
      rules: room.rules,
      usedClueWords: usedWords,
    });

    if (
      room.status !== 'playing' ||
      room.turnNumber !== expectedTurn ||
      room.turnPhase !== 'giving_clue'
    ) {
      return;
    }

    room.aiThinking = { active: false };

    room.aiThoughtLogs.unshift({
      id: crypto.randomUUID(),
      turnNumber: room.turnNumber,
      actorName: spymaster.name,
      team: spymaster.team,
      role: 'spymaster',
      difficulty,
      personality,
      provider: decision.provider,
      summary: decision.publicReasoning,
      candidateScores: decision.candidateScores,
      timestamp: Date.now(),
    });
    if (room.aiThoughtLogs.length > 30) {
      room.aiThoughtLogs = room.aiThoughtLogs.slice(0, 30);
    }

    if (assistOnly) {
      this.saveAndBroadcast(room);
      return;
    }

    // Ensure player is registered in room if assist fallback was used
    const actualSpymaster =
      room.players.find(
        (p) => p.team === room.currentTurnTeam && p.role === 'spymaster'
      ) ?? spymaster;

    this.submitClue({
      roomCode: room.roomCode,
      playerId: actualSpymaster.id,
      word: decision.word,
      count: decision.count,
      publicReasoning: decision.publicReasoning,
      secretReasoning: decision.secretReasoning,
      secretTargets: decision.targetWords,
    });
  }

  private async executeAIOperativeTurn(
    room: ServerRoomState,
    operative: RoomPlayer,
    assistOnly = false
  ): Promise<void> {
    const expectedTurn = room.turnNumber;
    const expectedGuesses = room.guessesMadeThisTurn;
    const difficulty = operative.aiDifficulty ?? 'normal';
    const personality = operative.aiPersonality ?? 'analytical';

    if (!room.currentClue) return;

    const stages = [
      '「正在分析線索……」',
      '「正在比對代號……」',
      '「正在評估風險……」',
    ];

    for (const stageText of stages) {
      if (
        room.status !== 'playing' ||
        room.turnNumber !== expectedTurn ||
        room.turnPhase !== 'guessing' ||
        room.guessesMadeThisTurn !== expectedGuesses
      ) {
        return;
      }
      room.aiThinking = {
        active: true,
        actorId: operative.id,
        actorName: operative.name,
        team: operative.team,
        role: 'operative',
        stageText,
      };
      this.saveAndBroadcast(room);
      await this.sleep(this.getBaseDelayMs(room, 280));
    }

    // CRITICAL INFORMATION ISOLATION:
    // Sanitize the board with `viewerIsSpymaster = false` before passing to AI Operative!
    const publicBoard = sanitizeBoardForViewer(room.board, false, false);
    const teamClues = room.clueHistory.filter((c) => c.team === room.currentTurnTeam);

    const decision = await requestAIOperativeDecision({
      publicBoard,
      currentClue: room.currentClue,
      guessesMadeThisTurn: room.guessesMadeThisTurn,
      maxGuessesThisTurn: room.maxGuessesThisTurn,
      difficulty,
      personality,
      teamClueHistory: teamClues,
    });

    if (
      room.status !== 'playing' ||
      room.turnNumber !== expectedTurn ||
      room.turnPhase !== 'guessing' ||
      room.guessesMadeThisTurn !== expectedGuesses
    ) {
      return;
    }

    room.aiThinking = { active: false };

    room.aiThoughtLogs.unshift({
      id: crypto.randomUUID(),
      turnNumber: room.turnNumber,
      actorName: operative.name,
      team: operative.team,
      role: 'operative',
      difficulty,
      personality,
      provider: decision.provider,
      summary: `【${getDifficultyLabel(difficulty)}・${getPersonalityLabel(
        personality
      )}】${decision.reasoning}`,
      candidateScores: decision.candidateScores,
      timestamp: Date.now(),
    });
    if (room.aiThoughtLogs.length > 30) {
      room.aiThoughtLogs = room.aiThoughtLogs.slice(0, 30);
    }

    if (assistOnly) {
      if (decision.action === 'guess' && decision.cardIndex !== undefined) {
        const card = room.board[decision.cardIndex];
        if (card && !card.revealed && !card.marks.includes(operative.name)) {
          card.marks.push(operative.name);
        }
      }
      this.saveAndBroadcast(room);
      return;
    }

    const actualOperative =
      room.players.find(
        (p) => p.team === room.currentTurnTeam && p.role === 'operative'
      ) ?? operative;

    if (decision.action === 'end_turn' && room.guessesMadeThisTurn > 0) {
      this.endTurn({
        roomCode: room.roomCode,
        playerId: actualOperative.id,
        reasoning: decision.reasoning,
      });
    } else if (decision.cardIndex !== undefined) {
      this.makeGuess({
        roomCode: room.roomCode,
        playerId: actualOperative.id,
        cardIndex: decision.cardIndex,
        reasoning: decision.reasoning,
        confidence: decision.confidence,
      });
    } else {
      this.endTurn({
        roomCode: room.roomCode,
        playerId: actualOperative.id,
      });
    }
  }

  private getBaseDelayMs(room: ServerRoomState, defaultMs: number): number {
    const speedFactor =
      room.rules.aiSpeed === 'fast'
        ? 0.45
        : room.rules.aiSpeed === 'cinematic'
        ? 1.5
        : 1.0;
    return Math.max(10, Math.round(defaultMs * speedFactor * this.stepDelayMultiplier));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private clearTimers(roomCode: string): void {
    const aiTimer = this.aiTimers.get(roomCode);
    if (aiTimer) {
      clearTimeout(aiTimer);
      this.aiTimers.delete(roomCode);
    }
    const cdTimer = this.turnCountdownTimers.get(roomCode);
    if (cdTimer) {
      clearTimeout(cdTimer);
      this.turnCountdownTimers.delete(roomCode);
    }
  }

  private requireRoom(roomCode: string): ServerRoomState {
    const room = this.rooms.get(roomCode.trim().toUpperCase());
    if (!room) {
      throw new Error(`找不到房間代碼「${roomCode}」。`);
    }
    return room;
  }

  private requireHost(room: ServerRoomState, requesterId: string): void {
    if (room.hostId !== requesterId) {
      throw new Error('只有房主可以執行此操作。');
    }
  }

  private saveAndBroadcast(room: ServerRoomState): void {
    room.updatedAt = Date.now();
    if (this.persistToDb) {
      saveRoomSnapshot(room);
    }
    if (this.onRoomUpdated) {
      this.onRoomUpdated(room);
    }
  }
}
