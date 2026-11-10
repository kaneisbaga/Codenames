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
} from '../../shared/types';
import {
  calculateMaxGuesses,
  DEFAULT_ROOM_RULES,
  evaluateCardGuess,
  generateGameBoard,
  getOppositeTeam,
  sanitizeBoardForViewer,
  shuffleArray,
  validateClue,
} from '../../shared/rulesEngine';
import {
  generateLocalOperativeDecision,
  generateLocalSpymasterClue,
  getDifficultyLabel,
  getPersonalityLabel,
} from '../../shared/semanticEngine';

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LOCAL_ROOMS_STORAGE_KEY = 'darkline_static_rooms_v1';
const LOCAL_HISTORY_STORAGE_KEY = 'darkline_static_history_v1';
const BROADCAST_CHANNEL_NAME = 'darkline_room_sync_v1';

const AI_AGENT_NAMES: Record<AIPersonality, string[]> = {
  cautious: ['代號・磐石 (AI)', '代號・守望 (AI)'],
  risky: ['代號・獵鷹 (AI)', '代號・赤鋒 (AI)'],
  associative: ['代號・星圖 (AI)', '代號・幻影 (AI)'],
  analytical: ['代號・稜鏡 (AI)', '代號・矩陣 (AI)'],
  intuitive: ['代號・閃電 (AI)', '代號・直覺 (AI)'],
};

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

export interface LocalServerRoomState {
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

export function loadLocalGameHistory(): GameHistoryRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLocalGameHistoryRecord(record: GameHistoryRecord): void {
  try {
    const current = loadLocalGameHistory().filter((r) => r.id !== record.id);
    current.unshift(record);
    localStorage.setItem(LOCAL_HISTORY_STORAGE_KEY, JSON.stringify(current.slice(0, 100)));
  } catch {
    // ignore storage errors
  }
}

export function deleteLocalGameHistoryById(id: string): void {
  try {
    const filtered = loadLocalGameHistory().filter((r) => r.id !== id);
    localStorage.setItem(LOCAL_HISTORY_STORAGE_KEY, JSON.stringify(filtered));
  } catch {
    // ignore storage errors
  }
}

export function clearLocalGameHistory(): void {
  try {
    localStorage.removeItem(LOCAL_HISTORY_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}

export class LocalBrowserRoomEngine {
  private rooms = new Map<string, LocalServerRoomState>();
  private aiTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private turnTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private listeners = new Map<string, (state: ClientRoomState) => void>();
  private activeRoomByPlayer = new Map<string, string>();
  private channel: BroadcastChannel | null = null;

  constructor() {
    this.restoreRoomsFromStorage();
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
        this.channel.onmessage = (ev) => {
          const data = ev.data as { type?: string; room?: LocalServerRoomState };
          if (data?.type === 'room_updated' && data.room?.roomCode) {
            this.rooms.set(data.room.roomCode, data.room);
            this.notifyLocalListeners(data.room);
          }
        };
      } catch {
        this.channel = null;
      }
    }
  }

  public subscribe(playerId: string, callback: (state: ClientRoomState) => void): () => void {
    this.listeners.set(playerId, callback);
    return () => {
      this.listeners.delete(playerId);
    };
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
    this.restoreRoomsFromStorage();
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

  public async handleEvent(event: string, payload: Record<string, any>): Promise<any> {
    try {
      switch (event) {
        case 'room:create': {
          const room = this.createRoom({
            hostId: payload.playerId,
            hostName: payload.playerName,
            mode: payload.mode,
            hostTeam: payload.team,
            hostRole: payload.role,
            aiDifficulty: payload.aiDifficulty,
            aiPersonality: payload.aiPersonality,
            rules: payload.rules,
            autoStart: payload.autoStart,
          });
          this.activeRoomByPlayer.set(payload.playerId, room.roomCode);
          const sanitized = this.sanitizeRoomForViewer(room, payload.playerId);
          return { ok: true, state: sanitized };
        }
        case 'room:join': {
          this.restoreRoomsFromStorage();
          const room = this.joinRoom({
            roomCode: payload.roomCode,
            playerId: payload.playerId,
            playerName: payload.playerName,
          });
          this.activeRoomByPlayer.set(payload.playerId, room.roomCode);
          const sanitized = this.sanitizeRoomForViewer(room, payload.playerId);
          return { ok: true, state: sanitized };
        }
        case 'room:leave': {
          this.activeRoomByPlayer.delete(payload.playerId);
          this.leaveRoom(payload.roomCode, payload.playerId);
          return { ok: true };
        }
        case 'room:updateSeat': {
          const room = this.updateSeat(payload as any);
          return { ok: true, state: this.sanitizeRoomForViewer(room, payload.requesterId) };
        }
        case 'room:addAI': {
          const room = this.addAIPlayer(payload as any);
          return { ok: true, state: this.sanitizeRoomForViewer(room, payload.requesterId) };
        }
        case 'room:removePlayer': {
          const room = this.removePlayer(payload as any);
          return { ok: true, state: this.sanitizeRoomForViewer(room, payload.requesterId) };
        }
        case 'room:autoAssign': {
          const room = this.autoAssignTeams(payload as any);
          return { ok: true, state: this.sanitizeRoomForViewer(room, payload.requesterId) };
        }
        case 'room:updateRules': {
          const room = this.updateRoomRules(payload as any);
          return { ok: true, state: this.sanitizeRoomForViewer(room, payload.requesterId) };
        }
        case 'game:start': {
          const room = this.startGame(payload.roomCode, payload.requesterId, payload.startingTeam);
          return { ok: true, state: this.sanitizeRoomForViewer(room, payload.requesterId) };
        }
        case 'game:submitClue': {
          const room = this.submitClue(payload as any);
          return { ok: true, state: this.sanitizeRoomForViewer(room, payload.playerId) };
        }
        case 'game:makeGuess': {
          const room = this.makeGuess(payload as any);
          return { ok: true, state: this.sanitizeRoomForViewer(room, payload.playerId) };
        }
        case 'game:toggleMark': {
          const room = this.toggleCardMark(payload as any);
          return { ok: true, state: this.sanitizeRoomForViewer(room, payload.playerId) };
        }
        case 'game:endTurn': {
          const room = this.endTurn(payload as any);
          return { ok: true, state: this.sanitizeRoomForViewer(room, payload.playerId) };
        }
        case 'game:aiAssist': {
          const room = await this.triggerAIAssist(payload as any);
          return { ok: true, state: this.sanitizeRoomForViewer(room, payload.requesterId) };
        }
        case 'chat:send': {
          const room = this.addChatMessage(payload as any);
          return { ok: true, state: this.sanitizeRoomForViewer(room, payload.senderId) };
        }
        default:
          return { ok: false, error: `未知事件：${event}` };
      }
    } catch (err: any) {
      return { ok: false, error: err?.message || '操作執行失敗' };
    }
  }

  private generateUniqueRoomCode(): string {
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
    return 'DL2026';
  }

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
  }): LocalServerRoomState {
    const roomCode = this.generateUniqueRoomCode();
    const now = Date.now();
    const rules: RoomRulesConfig = {
      ...DEFAULT_ROOM_RULES,
      ...params.rules,
      isPublic: params.mode === 'multiplayer' ? (params.rules?.isPublic ?? true) : false,
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

    const room: LocalServerRoomState = {
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
          id: randomId(),
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
    this.activeRoomByPlayer.set(params.hostId, roomCode);

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

  public joinRoom(params: {
    roomCode: string;
    playerId: string;
    playerName: string;
  }): LocalServerRoomState {
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
      id: randomId(),
      senderId: 'system',
      senderName: '情報中心系統',
      text: `${newPlayer.name} 已加入房間。`,
      isSystem: true,
      timestamp: Date.now(),
    });

    this.saveAndBroadcast(room);
    return room;
  }

  public leaveRoom(roomCode: string, playerId: string): LocalServerRoomState | null {
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
      this.persistRoomsToStorage();
      return null;
    }

    if (room.hostId === playerId) {
      const nextHost = remainingHumans[0];
      room.hostId = nextHost.id;
      nextHost.isHost = true;
    }

    room.chatMessages.push({
      id: randomId(),
      senderId: 'system',
      senderName: '情報中心系統',
      text: `${removed.name} 離開了房間。`,
      isSystem: true,
      timestamp: Date.now(),
    });

    this.saveAndBroadcast(room);
    return room;
  }

  public updateSeat(params: {
    roomCode: string;
    requesterId: string;
    targetPlayerId: string;
    team?: Team;
    role?: PlayerRole;
    isReady?: boolean;
    aiDifficulty?: AIDifficulty;
    aiPersonality?: AIPersonality;
  }): LocalServerRoomState {
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

  public addAIPlayer(params: {
    roomCode: string;
    requesterId: string;
    team: Team;
    role: PlayerRole;
    difficulty?: AIDifficulty;
    personality?: AIPersonality;
  }): LocalServerRoomState {
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
      id: `ai-${randomId().slice(0, 8)}`,
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
  }): LocalServerRoomState {
    const room = this.requireRoom(params.roomCode);
    this.requireHost(room, params.requesterId);

    if (params.targetPlayerId === room.hostId) {
      throw new Error('房主不可移除自己。');
    }

    room.players = room.players.filter((p) => p.id !== params.targetPlayerId);
    this.saveAndBroadcast(room);
    return room;
  }

  public autoAssignTeams(params: {
    roomCode: string;
    requesterId: string;
    fillWithAI?: boolean;
    aiDifficulty?: AIDifficulty;
  }): LocalServerRoomState {
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
  }): LocalServerRoomState {
    const room = this.requireRoom(params.roomCode);
    this.requireHost(room, params.requesterId);

    room.rules = {
      ...room.rules,
      ...params.rules,
    };
    this.saveAndBroadcast(room);
    return room;
  }

  public fillRequiredAISeats(
    room: LocalServerRoomState,
    defaultDifficulty: AIDifficulty = 'normal',
    defaultPersonality: AIPersonality = 'analytical'
  ): void {
    const requiredRoles: Array<{
      team: Team;
      role: PlayerRole;
      fallbackPersonality: AIPersonality;
    }> = [
      { team: 'red', role: 'spymaster', fallbackPersonality: defaultPersonality },
      { team: 'red', role: 'operative', fallbackPersonality: 'associative' },
      { team: 'blue', role: 'spymaster', fallbackPersonality: defaultPersonality },
      { team: 'blue', role: 'operative', fallbackPersonality: 'cautious' },
    ];

    let aiCounter = room.players.filter((p) => p.isAI).length;

    for (const req of requiredRoles) {
      const exists = room.players.some((p) => p.team === req.team && p.role === req.role);
      if (!exists) {
        const namePool = AI_AGENT_NAMES[req.fallbackPersonality];
        const aiName = `${namePool[aiCounter % namePool.length]} #${aiCounter + 1}`;
        aiCounter++;

        room.players.push({
          id: `ai-${randomId().slice(0, 8)}`,
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

  public startGame(
    roomCode: string,
    requesterId: string,
    forcedStartingTeam?: Team
  ): LocalServerRoomState {
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
      id: randomId(),
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

  public submitClue(params: {
    roomCode: string;
    playerId: string;
    word: string;
    count: ClueCount;
    publicReasoning?: string;
    secretReasoning?: string;
    secretTargets?: string[];
  }): LocalServerRoomState {
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
      id: randomId(),
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

  public toggleCardMark(params: {
    roomCode: string;
    playerId: string;
    cardIndex: number;
  }): LocalServerRoomState {
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

  public makeGuess(params: {
    roomCode: string;
    playerId: string;
    cardIndex: number;
    reasoning?: string;
    confidence?: number;
  }): LocalServerRoomState {
    const room = this.requireRoom(params.roomCode);

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
      id: randomId(),
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
  }

  public endTurn(params: {
    roomCode: string;
    playerId: string;
    reasoning?: string;
  }): LocalServerRoomState {
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
  }): LocalServerRoomState {
    const room = this.requireRoom(params.roomCode);
    const player = room.players.find((p) => p.id === params.senderId);
    if (!player) {
      throw new Error('你不在此房間中。');
    }
    const cleanText = params.text.trim().slice(0, 300);
    if (!cleanText) return room;

    room.chatMessages.push({
      id: randomId(),
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

  public async triggerAIAssist(params: {
    roomCode: string;
    requesterId: string;
  }): Promise<LocalServerRoomState> {
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

  public sanitizeRoomForViewer(
    room: LocalServerRoomState,
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

  private advanceToNextTeamTurn(room: LocalServerRoomState): void {
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
    room: LocalServerRoomState,
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
      id: randomId(),
      senderId: 'system',
      senderName: '情報中心系統',
      text: `任務結束！${reasonText}由【${winnerLabel}】奪得最終勝利！`,
      isSystem: true,
      timestamp: room.finishedAt,
    });

    if (!room.historyRecorded) {
      room.historyRecorded = true;
      const durationSeconds = room.startedAt
        ? Math.max(1, Math.round((room.finishedAt - room.startedAt) / 1000))
        : 60;
      const aiPlayer = room.players.find((p) => p.isAI);
      const aiDifficulty: AIDifficulty = aiPlayer?.aiDifficulty ?? 'normal';

      const humanPlayers = room.players.filter((p) => !p.isAI);
      for (const human of humanPlayers) {
        saveLocalGameHistoryRecord({
          id: randomId(),
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
        });
      }
    }

    this.saveAndBroadcast(room);
  }

  private scheduleTurnTimer(room: LocalServerRoomState): void {
    const existing = this.turnTimers.get(room.roomCode);
    if (existing) {
      clearTimeout(existing);
      this.turnTimers.delete(room.roomCode);
    }

    if (
      room.status !== 'playing' ||
      !room.rules.turnTimerSeconds ||
      room.rules.turnTimerSeconds <= 0
    ) {
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

    this.turnTimers.set(room.roomCode, timer);
  }

  private scheduleAITurnIfNeeded(room: LocalServerRoomState): void {
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

  private async executeAISpymasterTurn(
    room: LocalServerRoomState,
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
      await this.sleep(this.getBaseDelayMs(room, 260));
    }

    const usedWords = room.clueHistory.map((c) => c.word);
    const decision = generateLocalSpymasterClue(
      room.board,
      room.currentTurnTeam,
      difficulty,
      personality,
      room.rules,
      usedWords
    );

    if (
      room.status !== 'playing' ||
      room.turnNumber !== expectedTurn ||
      room.turnPhase !== 'giving_clue'
    ) {
      return;
    }

    room.aiThinking = { active: false };

    room.aiThoughtLogs.unshift({
      id: randomId(),
      turnNumber: room.turnNumber,
      actorName: spymaster.name,
      team: spymaster.team,
      role: 'spymaster',
      difficulty,
      personality,
      provider: 'local',
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
    room: LocalServerRoomState,
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
      await this.sleep(this.getBaseDelayMs(room, 260));
    }

    const publicBoard = sanitizeBoardForViewer(room.board, false, false);
    const teamClues = room.clueHistory.filter((c) => c.team === room.currentTurnTeam);

    const decision = generateLocalOperativeDecision(
      publicBoard,
      room.currentClue,
      room.guessesMadeThisTurn,
      room.maxGuessesThisTurn,
      difficulty,
      personality,
      teamClues
    );

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
      id: randomId(),
      turnNumber: room.turnNumber,
      actorName: operative.name,
      team: operative.team,
      role: 'operative',
      difficulty,
      personality,
      provider: 'local',
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

  private getBaseDelayMs(room: LocalServerRoomState, defaultMs: number): number {
    const speedFactor =
      room.rules.aiSpeed === 'fast'
        ? 0.45
        : room.rules.aiSpeed === 'cinematic'
        ? 1.5
        : 1.0;
    return Math.max(20, Math.round(defaultMs * speedFactor));
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
    const cdTimer = this.turnTimers.get(roomCode);
    if (cdTimer) {
      clearTimeout(cdTimer);
      this.turnTimers.delete(roomCode);
    }
  }

  private requireRoom(roomCode: string): LocalServerRoomState {
    const room = this.rooms.get(roomCode.trim().toUpperCase());
    if (!room) {
      throw new Error(`找不到房間代碼「${roomCode}」。`);
    }
    return room;
  }

  private requireHost(room: LocalServerRoomState, requesterId: string): void {
    if (room.hostId !== requesterId) {
      throw new Error('只有房主可以執行此操作。');
    }
  }

  private restoreRoomsFromStorage(): void {
    try {
      const raw = localStorage.getItem(LOCAL_ROOMS_STORAGE_KEY);
      if (!raw) return;
      const list = JSON.parse(raw) as LocalServerRoomState[];
      if (!Array.isArray(list)) return;
      const cutoff = Date.now() - 86400000;
      for (const room of list) {
        if (room?.roomCode && room.updatedAt >= cutoff && !this.rooms.has(room.roomCode)) {
          this.rooms.set(room.roomCode, room);
        }
      }
    } catch {
      // ignore storage errors
    }
  }

  private persistRoomsToStorage(): void {
    try {
      const cutoff = Date.now() - 86400000;
      const active = Array.from(this.rooms.values())
        .filter((r) => r.updatedAt >= cutoff)
        .slice(-20);
      localStorage.setItem(LOCAL_ROOMS_STORAGE_KEY, JSON.stringify(active));
    } catch {
      // ignore storage errors
    }
  }

  private notifyLocalListeners(room: LocalServerRoomState): void {
    for (const [playerId, cb] of this.listeners.entries()) {
      const activeCode = this.activeRoomByPlayer.get(playerId);
      const isInRoom = room.players.some((p) => p.id === playerId);
      if (activeCode === room.roomCode || isInRoom) {
        cb(this.sanitizeRoomForViewer(room, playerId));
      }
    }
  }

  private saveAndBroadcast(room: LocalServerRoomState): void {
    room.updatedAt = Date.now();
    this.persistRoomsToStorage();
    this.notifyLocalListeners(room);
    if (this.channel) {
      try {
        this.channel.postMessage({ type: 'room_updated', room });
      } catch {
        // ignore channel errors
      }
    }
  }
}

export const localRoomEngine = new LocalBrowserRoomEngine();
