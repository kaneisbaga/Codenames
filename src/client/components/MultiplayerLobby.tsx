import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Bot,
  Check,
  Copy,
  Crown,
  Globe,
  Link2,
  Lock,
  Play,
  Plus,
  RefreshCw,
  Send,
  Shuffle,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import {
  AIDifficulty,
  AIPersonality,
  ClientRoomState,
  PlayerRole,
  RoomRulesConfig,
  Team,
} from '../../shared/types';
import { getDifficultyLabel, getPersonalityLabel } from '../../shared/semanticEngine';
import { localRoomEngine } from '../utils/localRoomEngine';

interface PublicRoomSummary {
  roomCode: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  status: string;
  createdAt: number;
}

interface MultiplayerEntryProps {
  nickname: string;
  onNicknameChange: (name: string) => void;
  onCreateRoom: (isPublic: boolean) => Promise<{ ok: boolean; error?: string }>;
  onJoinRoom: (code: string) => Promise<{ ok: boolean; error?: string }>;
  onBackHome: () => void;
}

export const MultiplayerEntryScreen: React.FC<MultiplayerEntryProps> = ({
  nickname,
  onNicknameChange,
  onCreateRoom,
  onJoinRoom,
  onBackHome,
}) => {
  const [joinCode, setJoinCode] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [publicRooms, setPublicRooms] = useState<PublicRoomSummary[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchPublicRooms = async () => {
    setLoadingRooms(true);
    try {
      const res = await fetch('/api/rooms');
      if (!res.ok) throw new Error('fallback');
      const data = (await res.json()) as { rooms?: PublicRoomSummary[] };
      setPublicRooms(data.rooms || localRoomEngine.listPublicRooms());
    } catch {
      setPublicRooms(localRoomEngine.listPublicRooms());
    } finally {
      setLoadingRooms(false);
    }
  };

  useEffect(() => {
    void fetchPublicRooms();
  }, []);

  const handleCreate = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await onCreateRoom(isPublic);
      if (!res.ok) setError(res.error || '建立房間失敗');
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async (codeToJoin: string) => {
    const clean = codeToJoin.trim().toUpperCase();
    if (!clean) {
      setError('請輸入 6 位房間代碼');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await onJoinRoom(clean);
      if (!res.ok) setError(res.error || '加入房間失敗');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-4xl rounded-2xl border border-amber-500/25 bg-[#0b1220]/95 p-6 sm:p-8 shadow-2xl space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBackHome}
              className="rounded-xl border border-slate-700 bg-slate-900 p-2 text-slate-300 hover:text-amber-300 hover:border-amber-500/40 transition"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-lg sm:text-xl font-black tracking-wider text-white">
                多人連線情報指揮室
              </h1>
              <p className="text-xs text-slate-400">
                支援跨電腦即時連線、邀請連結加入，以及人類與 AI 混合組隊
              </p>
            </div>
          </div>
        </div>

        {/* Nickname Input */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <label className="block text-xs font-bold text-amber-400">
              你的特務代號（暱稱）
            </label>
            <p className="text-[11px] text-slate-400">
              斷線重連時系統將自動根據你的識別碼恢復原本隊伍與領袖／隊員身份
            </p>
          </div>
          <input
            type="text"
            data-testid="multiplayer-nickname-input"
            value={nickname}
            maxLength={18}
            onChange={(e) => onNicknameChange(e.target.value)}
            placeholder="輸入特務暱稱"
            className="sm:w-64 rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-sm text-slate-100 focus:border-amber-400 focus:outline-none"
          />
        </div>

        {error && (
          <div
            data-testid="multiplayer-error"
            className="rounded-xl border border-rose-500/50 bg-rose-950/50 px-4 py-2.5 text-xs text-rose-200"
          >
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Create Room Card */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <h2 className="text-base font-bold text-amber-300 flex items-center gap-2">
                <Plus className="w-4 h-4" />
                建立新行動房間
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                開設一個 6 位代碼的專屬房間，可自由指派紅藍領袖、加入 AI 特務補位，或複製邀請網址給好友。
              </p>

              <div className="pt-2 flex items-center gap-4 text-xs">
                <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                  <input
                    type="radio"
                    checked={isPublic}
                    onChange={() => setIsPublic(true)}
                    className="accent-amber-500"
                  />
                  <Globe className="w-3.5 h-3.5 text-emerald-400" />
                  公開房間
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                  <input
                    type="radio"
                    checked={!isPublic}
                    onChange={() => setIsPublic(false)}
                    className="accent-amber-500"
                  />
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                  私人房間（僅限代碼/連結）
                </label>
              </div>
            </div>

            <button
              type="button"
              data-testid="create-room-submit-btn"
              onClick={() => void handleCreate()}
              disabled={busy}
              className="w-full rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 py-3 text-sm font-bold text-slate-950 transition"
            >
              立即建立房間
            </button>
          </div>

          {/* Join by Room Code Card */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <h2 className="text-base font-bold text-sky-300 flex items-center gap-2">
                <Users className="w-4 h-4" />
                輸入代碼加入房間
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                輸入房主分享的 6 位英數房間代碼（例如：A7K9M2）即可立即連線同步。
              </p>

              <div className="pt-2">
                <input
                  type="text"
                  data-testid="join-room-code-input"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="輸入 6 位房間代碼"
                  maxLength={6}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-center font-mono text-lg tracking-[0.25em] uppercase text-amber-300 focus:border-sky-400 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="button"
              data-testid="join-room-submit-btn"
              onClick={() => void handleJoin(joinCode)}
              disabled={busy || !joinCode.trim()}
              className="w-full rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-40 py-3 text-sm font-bold text-slate-950 transition"
            >
              加入指定房間
            </button>
          </div>
        </div>

        {/* Public Rooms Directory */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              目前公開行動房間 ({publicRooms.length})
            </h3>
            <button
              type="button"
              onClick={() => void fetchPublicRooms()}
              className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingRooms ? 'animate-spin' : ''}`} />
              重新整理
            </button>
          </div>

          {publicRooms.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-500">
              目前沒有公開等待中的房間，你可以直接建立一個新房間！
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {publicRooms.map((r) => (
                <div
                  key={r.roomCode}
                  className="rounded-lg border border-slate-800 bg-slate-900/70 px-3.5 py-2.5 flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-mono font-bold text-amber-300 text-sm">
                      #{r.roomCode}
                    </div>
                    <div className="text-slate-400 text-[11px]">
                      房主：{r.hostName} ・ 人數：{r.playerCount}/{r.maxPlayers}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleJoin(r.roomCode)}
                    className="rounded-lg bg-slate-800 hover:bg-amber-500 hover:text-slate-950 px-3 py-1.5 font-bold text-slate-200 transition"
                  >
                    加入
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface RoomLobbyScreenProps {
  room: ClientRoomState;
  playerId: string;
  onUpdateSeat: (params: {
    targetPlayerId: string;
    team?: Team;
    role?: PlayerRole;
    isReady?: boolean;
    aiDifficulty?: AIDifficulty;
    aiPersonality?: AIPersonality;
  }) => Promise<{ ok: boolean; error?: string }>;
  onAddAI: (
    team: Team,
    role: PlayerRole,
    difficulty: AIDifficulty,
    personality: AIPersonality
  ) => Promise<{ ok: boolean; error?: string }>;
  onRemovePlayer: (targetPlayerId: string) => Promise<{ ok: boolean; error?: string }>;
  onAutoAssign: (fillWithAI: boolean, aiDifficulty: AIDifficulty) => Promise<{ ok: boolean; error?: string }>;
  onUpdateRules: (rules: Partial<RoomRulesConfig>) => Promise<{ ok: boolean; error?: string }>;
  onStartGame: () => Promise<{ ok: boolean; error?: string }>;
  onSendChat: (text: string) => void;
  onLeaveRoom: () => void;
}

export const RoomLobbyScreen: React.FC<RoomLobbyScreenProps> = ({
  room,
  playerId,
  onUpdateSeat,
  onAddAI,
  onRemovePlayer,
  onAutoAssign,
  onUpdateRules,
  onStartGame,
  onSendChat,
  onLeaveRoom,
}) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [aiDifficulty, setAiDifficulty] = useState<AIDifficulty>('normal');
  const [aiPersonality, setAiPersonality] = useState<AIPersonality>('analytical');
  const [chatText, setChatText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isHost = room.hostId === playerId;
  const myPlayer = room.players.find((p) => p.id === playerId);

  const copyRoomCode = async () => {
    try {
      await navigator.clipboard.writeText(room.roomCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1800);
    } catch {
      // ignore clipboard error
    }
  };

  const copyInviteUrl = async () => {
    try {
      const url = `${window.location.origin}/?room=${room.roomCode}`;
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1800);
    } catch {
      // ignore clipboard error
    }
  };

  const handleStart = async () => {
    setError(null);
    const res = await onStartGame();
    if (!res.ok) {
      setError(res.error || '無法開始遊戲');
    }
  };

  const renderTeamColumn = (team: Team) => {
    const isRed = team === 'red';
    const teamPlayers = room.players.filter((p) => p.team === team);
    const spymaster = teamPlayers.find((p) => p.role === 'spymaster');
    const operatives = teamPlayers.filter((p) => p.role === 'operative');

    return (
      <div
        className={`rounded-2xl border p-4 sm:p-5 space-y-4 ${
          isRed
            ? 'border-rose-500/40 bg-gradient-to-b from-rose-950/30 to-slate-950/90'
            : 'border-sky-500/40 bg-gradient-to-b from-sky-950/30 to-slate-950/90'
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <span
              className={`w-3 h-3 rounded-full ${
                isRed ? 'bg-rose-500' : 'bg-sky-500'
              }`}
            />
            <h2
              className={`text-base font-black tracking-wider ${
                isRed ? 'text-rose-300' : 'text-sky-300'
              }`}
            >
              {isRed ? '紅方特務陣營 (RED)' : '藍方特務陣營 (BLUE)'}
            </h2>
          </div>

          <button
            type="button"
            onClick={() =>
              void onUpdateSeat({
                targetPlayerId: playerId,
                team,
                role: spymaster ? 'operative' : 'spymaster',
              })
            }
            className={`px-3 py-1 rounded-lg text-xs font-bold border transition ${
              myPlayer?.team === team
                ? 'border-amber-400/50 bg-amber-500/20 text-amber-200'
                : 'border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300'
            }`}
          >
            {myPlayer?.team === team ? '目前所在陣營' : `切換至${isRed ? '紅隊' : '藍隊'}`}
          </button>
        </div>

        {/* Spymaster Slot */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-amber-300">間諜領袖 (Spymaster) — 1 席</span>
            <div className="flex items-center gap-1.5">
              {myPlayer && !(myPlayer.team === team && myPlayer.role === 'spymaster') && (
                <button
                  type="button"
                  data-testid={`join-${team}-spymaster-btn`}
                  onClick={() =>
                    void onUpdateSeat({
                      targetPlayerId: playerId,
                      team,
                      role: 'spymaster',
                    })
                  }
                  className="text-[11px] px-2 py-0.5 rounded bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-300 transition"
                >
                  擔任領袖
                </button>
              )}
              {isHost && !spymaster && (
                <button
                  type="button"
                  data-testid={`add-ai-${team}-spymaster`}
                  onClick={() =>
                    void onAddAI(team, 'spymaster', aiDifficulty, aiPersonality)
                  }
                  className="text-[11px] px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 transition flex items-center gap-1"
                >
                  <Bot className="w-3 h-3" />
                  指派 AI 領袖
                </button>
              )}
            </div>
          </div>

          {spymaster ? (
            <div className="rounded-xl border border-amber-500/30 bg-slate-900/90 px-3.5 py-2.5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                {spymaster.isAI ? (
                  <Bot className="w-4 h-4 text-amber-400" />
                ) : (
                  <Crown className="w-4 h-4 text-amber-400" />
                )}
                <span className="font-bold text-white">{spymaster.name}</span>
                {spymaster.isAI && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-amber-300">
                    {getDifficultyLabel(spymaster.aiDifficulty || 'normal')}・
                    {getPersonalityLabel(spymaster.aiPersonality || 'analytical')}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {isHost && spymaster.id !== playerId && (
                  <button
                    type="button"
                    onClick={() => void onRemovePlayer(spymaster.id)}
                    className="text-slate-500 hover:text-rose-400 p-1"
                    title="移除此席位"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-800 px-3.5 py-2.5 text-xs text-slate-500">
              尚未指派領袖（若開啟 AI 自動補位，開局時將自動補齊）
            </div>
          )}
        </div>

        {/* Operatives Slots */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-300">
              間諜隊員 (Operatives) — {operatives.length} 人
            </span>
            <div className="flex items-center gap-1.5">
              {myPlayer && !(myPlayer.team === team && myPlayer.role === 'operative') && (
                <button
                  type="button"
                  data-testid={`join-${team}-operative-btn`}
                  onClick={() =>
                    void onUpdateSeat({
                      targetPlayerId: playerId,
                      team,
                      role: 'operative',
                    })
                  }
                  className="text-[11px] px-2 py-0.5 rounded bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-300 transition"
                >
                  擔任隊員
                </button>
              )}
              {isHost && (
                <button
                  type="button"
                  data-testid={`add-ai-${team}-operative`}
                  onClick={() =>
                    void onAddAI(team, 'operative', aiDifficulty, aiPersonality)
                  }
                  className="text-[11px] px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 transition flex items-center gap-1"
                >
                  <Bot className="w-3 h-3" />
                  + AI 隊員
                </button>
              )}
            </div>
          </div>

          {operatives.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-800 px-3.5 py-2.5 text-xs text-slate-500">
              尚無隊員（可點擊上方擔任隊員或新增 AI 隊員）
            </div>
          ) : (
            <div className="space-y-1.5">
              {operatives.map((op) => (
                <div
                  key={op.id}
                  className="rounded-xl border border-slate-800 bg-slate-900/70 px-3.5 py-2 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2">
                    {op.isAI ? (
                      <Bot className="w-3.5 h-3.5 text-sky-400" />
                    ) : (
                      <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                    )}
                    <span className="font-semibold text-slate-200">{op.name}</span>
                    {op.isAI && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                        {getDifficultyLabel(op.aiDifficulty || 'normal')}・
                        {getPersonalityLabel(op.aiPersonality || 'analytical')}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {isHost && (
                      <button
                        type="button"
                        onClick={() =>
                          void onUpdateSeat({
                            targetPlayerId: op.id,
                            team,
                            role: 'spymaster',
                          })
                        }
                        className="text-[10px] text-amber-400 hover:underline"
                      >
                        設為領袖
                      </button>
                    )}
                    {isHost && op.id !== playerId && (
                      <button
                        type="button"
                        onClick={() => void onRemovePlayer(op.id)}
                        className="text-slate-500 hover:text-rose-400 p-1"
                        title="移除此玩家"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-100 p-3 sm:p-6 flex flex-col items-center">
      <div className="w-full max-w-6xl space-y-5">
        {/* Top Bar: Room Code, Invite Link & Leave */}
        <div className="rounded-2xl border border-amber-500/30 bg-[#0b1220]/95 p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 shadow-xl">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onLeaveRoom}
              className="rounded-xl border border-slate-700 bg-slate-900 p-2 text-slate-300 hover:text-rose-300 transition"
              title="離開房間"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-widest text-slate-400">
                  房間代碼
                </span>
                <span
                  data-testid="lobby-room-code"
                  className="font-mono text-xl sm:text-2xl font-black tracking-[0.2em] text-amber-400"
                >
                  {room.roomCode}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                已加入特務：{room.players.length} / {room.rules.maxPlayers} 席位
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="copy-room-code-btn"
              onClick={() => void copyRoomCode()}
              className="rounded-xl border border-slate-700 bg-slate-900 hover:border-amber-500/50 px-3.5 py-2 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition"
            >
              {copiedCode ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-amber-400" />
              )}
              {copiedCode ? '已複製代碼' : '複製代碼'}
            </button>

            <button
              type="button"
              data-testid="copy-invite-link-btn"
              onClick={() => void copyInviteUrl()}
              className="rounded-xl border border-slate-700 bg-slate-900 hover:border-amber-500/50 px-3.5 py-2 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition"
            >
              {copiedLink ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Link2 className="w-3.5 h-3.5 text-sky-400" />
              )}
              {copiedLink ? '已複製邀請網址' : '分享邀請網址'}
            </button>

            {isHost && (
              <button
                type="button"
                data-testid="lobby-start-game-btn"
                onClick={() => void handleStart()}
                className="rounded-xl bg-amber-500 hover:bg-amber-400 px-5 py-2.5 text-xs sm:text-sm font-black text-slate-950 flex items-center gap-1.5 shadow-lg shadow-amber-500/20 transition"
              >
                <Play className="w-4 h-4 fill-current" />
                開始暗線任務
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-500/50 bg-rose-950/60 px-4 py-2.5 text-xs text-rose-200">
            {error}
          </div>
        )}

        {/* Host Controls Bar: AI Difficulty/Personality, Auto-Assign, Auto-Fill AI */}
        {isHost && (
          <div className="rounded-2xl border border-slate-800 bg-[#0a101d]/90 p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-bold text-amber-400">房主戰術配置：</span>

              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">AI 難度</span>
                <select
                  value={aiDifficulty}
                  onChange={(e) => setAiDifficulty(e.target.value as AIDifficulty)}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-slate-200"
                >
                  <option value="easy">簡單</option>
                  <option value="normal">普通</option>
                  <option value="hard">困難</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">AI 個性</span>
                <select
                  value={aiPersonality}
                  onChange={(e) => setAiPersonality(e.target.value as AIPersonality)}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-slate-200"
                >
                  <option value="analytical">分析型</option>
                  <option value="cautious">穩健型</option>
                  <option value="associative">聯想型</option>
                  <option value="intuitive">直覺型</option>
                  <option value="risky">冒險型</option>
                </select>
              </div>

              <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={room.rules.autoFillAI}
                  onChange={(e) =>
                    void onUpdateRules({ autoFillAI: e.target.checked })
                  }
                  className="accent-amber-500"
                />
                開局時 AI 自動補齊空缺席位
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={room.rules.isPublic}
                  onChange={(e) =>
                    void onUpdateRules({ isPublic: e.target.checked })
                  }
                  className="accent-amber-500"
                />
                公開房間
              </label>
            </div>

            <button
              type="button"
              data-testid="auto-assign-teams-btn"
              onClick={() => void onAutoAssign(room.rules.autoFillAI, aiDifficulty)}
              className="rounded-xl border border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/25 px-3.5 py-1.5 font-bold text-amber-300 flex items-center gap-1.5 transition"
            >
              <Shuffle className="w-3.5 h-3.5" />
              自動分配隊伍與 AI 補位
            </button>
          </div>
        )}

        {/* Red & Blue Team Columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {renderTeamColumn('red')}
          {renderTeamColumn('blue')}
        </div>

        {/* Lobby Chat Box */}
        <div className="rounded-2xl border border-slate-800 bg-[#0a101d]/90 p-4 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            行動準備室通訊頻道
          </h3>
          <div className="h-32 overflow-y-auto space-y-1.5 rounded-xl bg-slate-950/70 p-3 text-xs border border-slate-800/80">
            {room.chatMessages.map((m) => (
              <div key={m.id}>
                {!m.isSystem && (
                  <span
                    className={`font-bold mr-1.5 ${
                      m.team === 'red' ? 'text-rose-400' : 'text-sky-400'
                    }`}
                  >
                    {m.senderName}:
                  </span>
                )}
                <span className={m.isSystem ? 'text-amber-400/80' : 'text-slate-200'}>
                  {m.text}
                </span>
              </div>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!chatText.trim()) return;
              onSendChat(chatText.trim());
              setChatText('');
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              placeholder="輸入聊天訊息與隊友溝通角色分工..."
              className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-slate-100 focus:border-amber-400 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-xl bg-amber-500 hover:bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950 flex items-center gap-1 transition"
            >
              <Send className="w-3.5 h-3.5" />
              發送
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
