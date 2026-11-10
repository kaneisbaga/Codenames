import React, { useEffect, useMemo, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import {
  Bot,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  Cpu,
  Eye,
  EyeOff,
  Flag,
  HelpCircle,
  Info,
  LogOut,
  MessageSquare,
  RotateCcw,
  Send,
  Settings,
  ShieldAlert,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react';
import {
  ClientRoomState,
  ClueCount,
  UserSettings,
} from '../../shared/types';
import { validateClue } from '../../shared/rulesEngine';
import { getDifficultyLabel, getPersonalityLabel } from '../../shared/semanticEngine';
import { soundEngine } from '../utils/sound';
import { BoardGrid } from './BoardGrid';

interface GameScreenProps {
  room: ClientRoomState;
  playerId: string;
  settings: UserSettings;
  onSubmitClue: (word: string, count: ClueCount) => Promise<{ ok: boolean; error?: string }>;
  onMakeGuess: (cardIndex: number) => Promise<{ ok: boolean; error?: string }>;
  onToggleMark: (cardIndex: number) => void;
  onEndTurn: () => Promise<{ ok: boolean; error?: string }>;
  onRestartGame: () => Promise<{ ok: boolean; error?: string }>;
  onSendChat: (text: string) => void;
  onRequestAIAssist: () => void;
  onLeaveRoom: () => void;
  onOpenRules: () => void;
  onOpenGuide: () => void;
  onOpenSettings: () => void;
}

export const GameScreen: React.FC<GameScreenProps> = ({
  room,
  playerId,
  settings,
  onSubmitClue,
  onMakeGuess,
  onToggleMark,
  onEndTurn,
  onRestartGame,
  onSendChat,
  onRequestAIAssist,
  onLeaveRoom,
  onOpenRules,
  onOpenGuide,
  onOpenSettings,
}) => {
  const [clueWord, setClueWord] = useState('');
  const [clueCount, setClueCount] = useState<ClueCount>(2);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showSpymasterKey, setShowSpymasterKey] = useState(true);
  const [activeSideTab, setActiveSideTab] = useState<'ai' | 'log' | 'chat'>('ai');
  const [chatInput, setChatInput] = useState('');

  const prevGuessCountRef = useRef(room.guessHistory.length);
  const prevTurnRef = useRef(room.turnNumber);
  const prevStatusRef = useRef(room.status);

  const myPlayer = useMemo(
    () => room.players.find((p) => p.id === playerId),
    [room.players, playerId]
  );

  const isHost = room.hostId === playerId;
  const isMyTeamTurn = myPlayer?.team === room.currentTurnTeam;
  const canGiveClue =
    room.status === 'playing' &&
    room.turnPhase === 'giving_clue' &&
    isMyTeamTurn &&
    myPlayer?.role === 'spymaster';

  const canGuess =
    room.status === 'playing' &&
    room.turnPhase === 'guessing' &&
    isMyTeamTurn &&
    myPlayer?.role === 'operative';

  const canMark =
    room.status === 'playing' && myPlayer?.role === 'operative';

  // Sound & confetti triggers on state changes
  useEffect(() => {
    if (room.guessHistory.length > prevGuessCountRef.current) {
      const latest = room.guessHistory[room.guessHistory.length - 1];
      if (latest) {
        if (latest.outcome === 'correct') {
          soundEngine.playCorrectReveal();
        } else {
          soundEngine.playWrongReveal();
        }
      }
    }
    prevGuessCountRef.current = room.guessHistory.length;
  }, [room.guessHistory]);

  useEffect(() => {
    if (room.turnNumber !== prevTurnRef.current) {
      soundEngine.playTurnSwitch();
      prevTurnRef.current = room.turnNumber;
    }
  }, [room.turnNumber]);

  useEffect(() => {
    if (prevStatusRef.current !== 'finished' && room.status === 'finished') {
      const playerWon = myPlayer ? myPlayer.team === room.winnerTeam : true;
      if (playerWon) {
        soundEngine.playVictory();
        if (!settings.reducedMotion) {
          void confetti({
            particleCount: 70,
            spread: 65,
            origin: { y: 0.6 },
          });
        }
      } else {
        soundEngine.playDefeat();
      }
    }
    prevStatusRef.current = room.status;
  }, [room.status, room.winnerTeam, myPlayer, settings.reducedMotion]);

  // Live client-side clue validation preview
  const liveClueValidation = useMemo(() => {
    if (!clueWord.trim()) return null;
    return validateClue(clueWord, clueCount, room.board, room.rules);
  }, [clueWord, clueCount, room.board, room.rules]);

  const handleClueSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canGiveClue || submitting) return;
    setActionError(null);

    const check = validateClue(clueWord, clueCount, room.board, room.rules);
    if (!check.valid) {
      setActionError(check.reason || '線索不符合規則');
      return;
    }

    setSubmitting(true);
    try {
      const res = await onSubmitClue(check.normalizedWord, clueCount);
      if (!res.ok) {
        setActionError(res.error || '提交線索失敗');
      } else {
        soundEngine.playClueSubmitted();
        setClueWord('');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleCardGuess = async (cardIndex: number) => {
    if (!canGuess || submitting) return;
    setActionError(null);
    soundEngine.playSelect();
    setSubmitting(true);
    try {
      const res = await onMakeGuess(cardIndex);
      if (!res.ok) {
        setActionError(res.error || '翻牌失敗');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleEndTurnClick = async () => {
    if (!canGuess || submitting) return;
    setActionError(null);
    setSubmitting(true);
    try {
      const res = await onEndTurn();
      if (!res.ok) {
        setActionError(res.error || '結束回合失敗');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    onSendChat(chatInput.trim());
    setChatInput('');
  };

  const remainingGuessesDisplay = useMemo(() => {
    if (room.maxGuessesThisTurn === 'unlimited') return '∞';
    return Math.max(0, room.maxGuessesThisTurn - room.guessesMadeThisTurn);
  }, [room.maxGuessesThisTurn, room.guessesMadeThisTurn]);

  const countOptions: ClueCount[] = useMemo(() => {
    const opts: ClueCount[] = [];
    if (room.rules.allowZeroClue) opts.push(0);
    for (let i = 1; i <= 9; i++) opts.push(i);
    if (room.rules.allowUnlimitedClue) opts.push('unlimited');
    return opts;
  }, [room.rules.allowZeroClue, room.rules.allowUnlimitedClue]);

  return (
    <div
      className="min-h-screen flex flex-col bg-[#070b12] text-slate-100 relative overflow-x-hidden"
      style={{
        backgroundImage: `radial-gradient(circle at 50% 20%, rgba(15, 23, 42, 0.72), rgba(7, 11, 18, 0.96)), url('./assets/art/bg-command-center.png')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* TOP TACTICAL STATUS BAR */}
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-[#080d17]/90 backdrop-blur-md px-2.5 sm:px-6 py-2.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          {/* Left: Brand & Room Code + Remaining Agent Counters */}
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-2">
              <img
                src="./assets/art/agency-crest.png"
                alt="Crest"
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-amber-500/40 object-cover"
              />
              <div className="hidden md:block">
                <div className="text-xs font-bold tracking-widest text-slate-100">
                  機密代碼：暗線任務
                </div>
                <div className="text-[10px] font-mono text-amber-400/90">
                  ROOM #{room.roomCode}
                </div>
              </div>
            </div>

            {/* Red & Blue Remaining Agents Scoreboard */}
            <div className="flex items-center gap-1.5 sm:gap-2 bg-slate-950/90 border border-slate-800 rounded-xl p-1">
              <div
                data-testid="red-remaining-counter"
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                  room.currentTurnTeam === 'red' && room.status === 'playing'
                    ? 'bg-rose-600 text-white shadow-sm shadow-rose-600/50'
                    : 'bg-rose-950/50 text-rose-300 border border-rose-500/30'
                }`}
              >
                <span>紅隊</span>
                <span className="font-mono text-sm sm:text-base">
                  {room.redRemaining}
                </span>
              </div>

              <span className="text-slate-600 font-mono text-xs">:</span>

              <div
                data-testid="blue-remaining-counter"
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                  room.currentTurnTeam === 'blue' && room.status === 'playing'
                    ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/50'
                    : 'bg-sky-950/50 text-sky-300 border border-sky-500/30'
                }`}
              >
                <span>藍隊</span>
                <span className="font-mono text-sm sm:text-base">
                  {room.blueRemaining}
                </span>
              </div>
            </div>
          </div>

          {/* Center: Turn & Phase Indicator */}
          <div className="flex items-center gap-2">
            {room.status === 'playing' ? (
              <div
                data-testid="turn-phase-indicator"
                className={`px-3 py-1 rounded-full border text-xs font-bold tracking-wide flex items-center gap-2 ${
                  room.currentTurnTeam === 'red'
                    ? 'border-rose-500/50 bg-rose-500/15 text-rose-200'
                    : 'border-sky-500/50 bg-sky-500/15 text-sky-200'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full animate-pulse ${
                    room.currentTurnTeam === 'red' ? 'bg-rose-400' : 'bg-sky-400'
                  }`}
                />
                <span>
                  第 {room.turnNumber} 回合 ・{' '}
                  {room.currentTurnTeam === 'red' ? '紅隊' : '藍隊'}
                  {room.turnPhase === 'giving_clue' ? '領袖給線索' : '隊員猜測'}
                </span>
              </div>
            ) : (
              <div className="px-3 py-1 rounded-full border border-amber-500/50 bg-amber-500/15 text-amber-200 text-xs font-bold flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5 text-amber-400" />
                <span>
                  任務結束 ・ {room.winnerTeam === 'red' ? '紅隊獲勝' : '藍隊獲勝'}
                </span>
              </div>
            )}

            {/* Player Role Pill */}
            {myPlayer && (
              <span
                data-testid="viewer-role-badge"
                className={`hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                  myPlayer.team === 'red'
                    ? 'border-rose-500/30 bg-rose-950/40 text-rose-300'
                    : 'border-sky-500/30 bg-sky-950/40 text-sky-300'
                }`}
              >
                {myPlayer.team === 'red' ? '紅方' : '藍方'}・
                {myPlayer.role === 'spymaster' ? '間諜領袖' : '間諜隊員'}
              </span>
            )}
          </div>

          {/* Right: Spymaster Key Toggle + Hidden Info Modal Buttons */}
          <div className="flex items-center gap-1.5">
            {room.viewerIsSpymaster && room.status === 'playing' && (
              <button
                type="button"
                data-testid="toggle-spymaster-key-btn"
                onClick={() => setShowSpymasterKey((v) => !v)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition ${
                  showSpymasterKey
                    ? 'border-amber-500/50 bg-amber-500/15 text-amber-300'
                    : 'border-slate-700 bg-slate-900 text-slate-400'
                }`}
                title="切換顯示或隱藏秘密關鍵名單顏色"
              >
                {showSpymasterKey ? (
                  <Eye className="w-3.5 h-3.5" />
                ) : (
                  <EyeOff className="w-3.5 h-3.5" />
                )}
                <span className="hidden lg:inline">關鍵名單</span>
              </button>
            )}

            <button
              type="button"
              data-testid="open-rules-btn"
              onClick={onOpenRules}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-800 bg-slate-900/80 text-xs text-slate-300 hover:border-amber-500/40 hover:text-amber-300 transition"
              title="規則說明"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">? 規則</span>
            </button>

            <button
              type="button"
              data-testid="open-guide-btn"
              onClick={onOpenGuide}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-800 bg-slate-900/80 text-xs text-slate-300 hover:border-amber-500/40 hover:text-amber-300 transition"
              title="操作說明"
            >
              <Info className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">i 操作說明</span>
            </button>

            <button
              type="button"
              data-testid="open-settings-btn"
              onClick={onOpenSettings}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-800 bg-slate-900/80 text-xs text-slate-300 hover:border-amber-500/40 hover:text-amber-300 transition"
              title="設定"
            >
              <Settings className="w-3.5 h-3.5" />
              <span className="hidden md:inline">設定</span>
            </button>

            {isHost && (
              <button
                type="button"
                data-testid="restart-game-btn"
                onClick={() => void onRestartGame()}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-800 bg-slate-900/80 text-xs text-slate-300 hover:border-amber-500/40 hover:text-amber-300 transition"
                title="重新開始新局"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">新局</span>
              </button>
            )}

            <button
              type="button"
              data-testid="leave-room-btn"
              onClick={onLeaveRoom}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-800 bg-slate-900/80 text-xs text-rose-400 hover:bg-rose-950/40 hover:border-rose-500/40 transition"
              title="離開房間返回首頁"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT: 5x5 BOARD + SIDE/BOTTOM TACTICAL CONSOLE */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-2 sm:px-6 py-3 sm:py-5 grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left/Center Column (8 cols on lg): Active Clue Banner + 5x5 Board + Role Action Console */}
        <div className="lg:col-span-8 flex flex-col gap-3">
          {/* AI Thinking Status Bar OR Active Clue Display Bar */}
          {room.aiThinking.active ? (
            <div
              data-testid="ai-thinking-banner"
              className="rounded-xl border border-amber-500/40 bg-[#0d1526]/95 px-4 py-2.5 flex items-center justify-between gap-3 shadow-lg"
            >
              <div className="flex items-center gap-2.5">
                <Cpu className="w-4 h-4 text-amber-400 animate-spin" />
                <span className="text-xs font-bold text-amber-300">
                  {room.aiThinking.actorName}
                </span>
                <span className="text-xs text-slate-300">
                  {room.aiThinking.stageText || '「正在分析線索……」'}
                </span>
              </div>
              <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400/80">
                AI TELEMETRY
              </span>
            </div>
          ) : room.currentClue && room.status === 'playing' ? (
            <div
              data-testid="active-clue-banner"
              className={`rounded-xl border px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 shadow-md ${
                room.currentClue.team === 'red'
                  ? 'border-rose-500/40 bg-rose-950/30'
                  : 'border-sky-500/40 bg-sky-950/30'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400">當前線索</span>
                <div className="flex items-center gap-2">
                  <span
                    data-testid="current-clue-word"
                    className="text-base sm:text-xl font-black tracking-wider text-amber-300"
                  >
                    {room.currentClue.word}
                  </span>
                  <span className="text-slate-500">:</span>
                  <span
                    data-testid="current-clue-count"
                    className="px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-400/40 text-amber-200 font-mono font-bold text-sm sm:text-base"
                  >
                    {room.currentClue.count === 'unlimited'
                      ? '∞'
                      : room.currentClue.count}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs">
                <span className="text-slate-300">
                  剩餘可猜：
                  <strong
                    data-testid="remaining-guesses-count"
                    className="font-mono text-amber-300 ml-1"
                  >
                    {remainingGuessesDisplay}
                  </strong>
                </span>

                {canGuess && (
                  <button
                    type="button"
                    data-testid="end-turn-btn"
                    onClick={() => void handleEndTurnClick()}
                    disabled={submitting}
                    className="rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 px-3 py-1.5 text-xs font-bold text-slate-100 transition flex items-center gap-1"
                  >
                    <Flag className="w-3.5 h-3.5 text-amber-400" />
                    結束回合
                  </button>
                )}
              </div>
            </div>
          ) : null}

          {/* Finished Game Outcome Banner */}
          {room.status === 'finished' && room.winnerTeam && (
            <div
              data-testid="game-finished-banner"
              className={`rounded-2xl border p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 shadow-xl ${
                room.winnerTeam === 'red'
                  ? 'border-rose-500/60 bg-gradient-to-r from-rose-950/80 via-[#140d18] to-[#0b111e]'
                  : 'border-sky-500/60 bg-gradient-to-r from-sky-950/80 via-[#0d1626] to-[#0b111e]'
              }`}
            >
              <div className="flex items-center gap-3.5">
                <div
                  className={`p-3 rounded-xl ${
                    room.winnerTeam === 'red'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      : 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                  }`}
                >
                  <Trophy className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-black tracking-wide text-white">
                    {room.winnerTeam === 'red' ? '紅方特務陣營獲勝！' : '藍方特務陣營獲勝！'}
                  </h2>
                  <p className="text-xs text-slate-300 mt-0.5">
                    {room.winReason === 'assassin_revealed'
                      ? '對手誤觸「終局殺手」代號，行動立即終止。'
                      : room.winReason === 'opponent_revealed_last_agent'
                      ? '對手翻出了最後一張特務代號。'
                      : '成功找出所有己方特務代號！'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                {isHost && (
                  <button
                    type="button"
                    data-testid="play-again-btn"
                    onClick={() => void onRestartGame()}
                    className="rounded-xl bg-amber-500 hover:bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950 transition flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    再戰一局
                  </button>
                )}
                <button
                  type="button"
                  onClick={onLeaveRoom}
                  className="rounded-xl border border-slate-700 bg-slate-900/80 hover:bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 transition"
                >
                  返回首頁
                </button>
              </div>
            </div>
          )}

          {/* THE 5x5 CODENAMES BOARD */}
          <BoardGrid
            board={room.board}
            viewerIsSpymaster={room.viewerIsSpymaster}
            showSpymasterKey={showSpymasterKey}
            canGuess={canGuess}
            canMark={canMark}
            reducedMotion={settings.reducedMotion}
            cardSize={settings.cardSize}
            fontSize={settings.fontSize}
            onCardClick={(idx) => void handleCardGuess(idx)}
            onToggleMark={(idx, e) => {
              e.stopPropagation();
              onToggleMark(idx);
            }}
          />

          {/* Error Alert */}
          {actionError && (
            <div
              data-testid="game-action-error"
              className="rounded-xl border border-rose-500/50 bg-rose-950/60 px-4 py-2 text-xs text-rose-200 flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{actionError}</span>
              </div>
              <button
                type="button"
                onClick={() => setActionError(null)}
                className="text-rose-300 hover:text-white text-xs font-bold"
              >
                關閉
              </button>
            </div>
          )}

          {/* SPYMASTER INPUT CONSOLE (visible when viewer is Spymaster during giving_clue phase) */}
          {canGiveClue && (
            <form
              data-testid="spymaster-clue-form"
              onSubmit={(e) => void handleClueSubmit(e)}
              className="rounded-2xl border border-amber-500/30 bg-[#0b1220]/95 p-3.5 sm:p-4 shadow-xl space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-bold">
                    領袖指令台
                  </span>
                  <span className="text-xs text-slate-400">
                    己方剩餘特務：
                    <strong className="text-slate-100 font-mono ml-1">
                      {myPlayer?.team === 'red' ? room.redRemaining : room.blueRemaining}
                    </strong>
                  </span>
                </div>

                {liveClueValidation && (
                  <span
                    className={`text-[11px] font-medium ${
                      liveClueValidation.valid ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {liveClueValidation.valid
                      ? `✓ 線索「${liveClueValidation.normalizedWord}」符合規則`
                      : `✕ ${liveClueValidation.reason}`}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                <input
                  type="text"
                  data-testid="clue-word-input"
                  value={clueWord}
                  onChange={(e) => {
                    setClueWord(e.target.value);
                    setActionError(null);
                  }}
                  placeholder="輸入一個線索詞語（如：海洋、皇室、太空）"
                  maxLength={10}
                  className="flex-1 min-w-[160px] rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                />

                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-slate-400 whitespace-nowrap">數量</label>
                  <select
                    data-testid="clue-count-select"
                    value={String(clueCount)}
                    onChange={(e) => {
                      const val = e.target.value;
                      setClueCount(val === 'unlimited' ? 'unlimited' : Number(val));
                    }}
                    className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm font-mono font-bold text-amber-300 focus:border-amber-400 focus:outline-none"
                  >
                    {countOptions.map((opt) => (
                      <option key={String(opt)} value={String(opt)}>
                        {opt === 'unlimited' ? '∞ (無限)' : `${opt} 張`}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="submit"
                  data-testid="submit-clue-btn"
                  disabled={submitting || !clueWord.trim()}
                  className="rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 px-5 py-2.5 text-xs sm:text-sm font-bold text-slate-950 transition flex items-center gap-1.5 shrink-0"
                >
                  <Send className="w-4 h-4" />
                  送出線索
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Right Column (4 cols on lg): AI Reasoning Log / Action History / Multiplayer Chat */}
        <aside className="lg:col-span-4 rounded-2xl border border-slate-800/90 bg-[#0a101d]/95 shadow-xl overflow-hidden flex flex-col h-[420px] lg:h-[580px]">
          {/* Tab Switcher */}
          <div className="grid grid-cols-3 border-b border-slate-800 bg-[#070b14] text-xs font-bold">
            <button
              type="button"
              data-testid="tab-ai-reasoning"
              onClick={() => setActiveSideTab('ai')}
              className={`py-3 flex items-center justify-center gap-1.5 border-b-2 transition ${
                activeSideTab === 'ai'
                  ? 'border-amber-400 text-amber-300 bg-amber-500/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <BrainCircuit className="w-3.5 h-3.5" />
              <span>AI 推理摘要</span>
            </button>

            <button
              type="button"
              data-testid="tab-game-log"
              onClick={() => setActiveSideTab('log')}
              className={`py-3 flex items-center justify-center gap-1.5 border-b-2 transition ${
                activeSideTab === 'log'
                  ? 'border-amber-400 text-amber-300 bg-amber-500/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>情報紀錄</span>
            </button>

            <button
              type="button"
              data-testid="tab-room-chat"
              onClick={() => setActiveSideTab('chat')}
              className={`py-3 flex items-center justify-center gap-1.5 border-b-2 transition ${
                activeSideTab === 'chat'
                  ? 'border-amber-400 text-amber-300 bg-amber-500/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>特務頻道 ({room.players.length})</span>
            </button>
          </div>

          {/* Tab 1: AI Thought Process Summary */}
          {activeSideTab === 'ai' && (
            <div className="flex-1 overflow-y-auto p-3.5 space-y-3 text-xs">
              <div className="flex items-center justify-between text-[11px] text-slate-400 pb-1 border-b border-slate-800/70">
                <span>AI 推理過程與信心評估（嚴格隔離未翻開機密）</span>
                {room.status === 'playing' && isMyTeamTurn && (
                  <button
                    type="button"
                    onClick={onRequestAIAssist}
                    className="text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1"
                    title="請求戰術 AI 分析目前桌面"
                  >
                    <Bot className="w-3.5 h-3.5" />
                    AI 顧問分析
                  </button>
                )}
              </div>

              {room.aiThoughtLogs.length === 0 ? (
                <div className="py-12 text-center text-slate-500">
                  尚無 AI 推理紀錄。當 AI 領袖或 AI 隊員行動時，此處將即時呈現其語意評估摘要。
                </div>
              ) : (
                room.aiThoughtLogs.map((log) => (
                  <div
                    key={log.id}
                    data-testid="ai-thought-log-item"
                    className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            log.team === 'red' ? 'bg-rose-400' : 'bg-sky-400'
                          }`}
                        />
                        <span className="font-bold text-slate-200">
                          {log.actorName}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                          {log.role === 'spymaster' ? '領袖' : '隊員'}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-500">
                        第 {log.turnNumber} 回合 ・{' '}
                        {log.provider === 'gemini' ? 'Gemini' : '本機圖譜'}
                      </span>
                    </div>

                    <p className="text-slate-300 leading-relaxed">{log.summary}</p>

                    {log.candidateScores && log.candidateScores.length > 0 && (
                      <div className="space-y-1 pt-1 border-t border-slate-800/70">
                        <div className="text-[10px] text-slate-400 font-semibold">
                          候選代號語意評分：
                        </div>
                        {log.candidateScores.map((cand, idx) => (
                          <div
                            key={`${cand.word}-${idx}`}
                            className="flex items-center justify-between text-[11px] bg-slate-950/60 rounded px-2 py-1"
                          >
                            <span className="font-semibold text-amber-300">
                              {cand.word}
                            </span>
                            <span className="text-slate-400 truncate max-w-[160px] mx-2">
                              {cand.reason}
                            </span>
                            <span className="font-mono text-emerald-400">
                              {Math.round(cand.score * 100)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* Tab 2: Clue & Guess Chronological Log */}
          {activeSideTab === 'log' && (
            <div className="flex-1 overflow-y-auto p-3.5 space-y-3 text-xs">
              {room.clueHistory.length === 0 ? (
                <div className="py-12 text-center text-slate-500">
                  尚無出牌與翻牌紀錄。
                </div>
              ) : (
                [...room.clueHistory].reverse().map((clue) => {
                  const turnGuesses = room.guessHistory.filter(
                    (g) => g.turnNumber === clue.turnNumber
                  );
                  return (
                    <div
                      key={clue.id}
                      className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`font-bold ${
                            clue.team === 'red' ? 'text-rose-400' : 'text-sky-400'
                          }`}
                        >
                          第 {clue.turnNumber} 回合 ・{' '}
                          {clue.team === 'red' ? '紅隊' : '藍隊'}線索
                        </span>
                        <span className="font-mono font-bold text-amber-300 text-sm">
                          {clue.word} :{' '}
                          {clue.count === 'unlimited' ? '∞' : clue.count}
                        </span>
                      </div>

                      {clue.secretReasoning && (
                        <div className="text-[11px] text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1.5">
                          {clue.secretReasoning}
                        </div>
                      )}

                      {turnGuesses.length > 0 && (
                        <div className="space-y-1 pt-1">
                          {turnGuesses.map((g) => (
                            <div
                              key={g.id}
                              className="flex items-center justify-between text-[11px] bg-slate-950/60 rounded px-2.5 py-1"
                            >
                              <span className="text-slate-300">
                                {g.playerName} 翻開「
                                <strong className="text-white">{g.word}</strong>」
                              </span>
                              <span
                                className={`font-bold ${
                                  g.outcome === 'correct'
                                    ? 'text-emerald-400'
                                    : g.outcome === 'assassin'
                                    ? 'text-amber-400'
                                    : 'text-rose-400'
                                }`}
                              >
                                {g.outcome === 'correct'
                                  ? '✓ 己方特務'
                                  : g.outcome === 'bystander'
                                  ? '• 中立路人'
                                  : g.outcome === 'enemy'
                                  ? '✕ 敵方特務'
                                  : '☠ 終局殺手'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Tab 3: Players & Real-Time Chat */}
          {activeSideTab === 'chat' && (
            <div className="flex-1 flex flex-col overflow-hidden text-xs">
              {/* Compact Roster */}
              <div className="p-2.5 border-b border-slate-800 bg-slate-950/50 flex flex-wrap gap-1.5">
                {room.players.map((p) => (
                  <span
                    key={p.id}
                    className={`px-2 py-0.5 rounded-md border text-[10px] flex items-center gap-1 ${
                      p.team === 'red'
                        ? 'border-rose-500/30 bg-rose-950/40 text-rose-200'
                        : 'border-sky-500/30 bg-sky-950/40 text-sky-200'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        p.isConnected ? 'bg-emerald-400' : 'bg-slate-500'
                      }`}
                    />
                    <span>{p.name}</span>
                    <span className="opacity-70">
                      ({p.role === 'spymaster' ? '領袖' : '隊員'})
                    </span>
                  </span>
                ))}
              </div>

              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {room.chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={
                      msg.isSystem
                        ? 'text-[11px] text-amber-400/80 bg-amber-500/5 border border-amber-500/15 rounded px-2.5 py-1'
                        : 'text-xs'
                    }
                  >
                    {!msg.isSystem && (
                      <span
                        className={`font-bold mr-1.5 ${
                          msg.team === 'red'
                            ? 'text-rose-400'
                            : msg.team === 'blue'
                            ? 'text-sky-400'
                            : 'text-slate-300'
                        }`}
                      >
                        {msg.senderName}:
                      </span>
                    )}
                    <span className="text-slate-200">{msg.text}</span>
                  </div>
                ))}
              </div>

              {/* Chat Input */}
              <form
                onSubmit={handleSendChatSubmit}
                className="p-2.5 border-t border-slate-800 bg-slate-950 flex items-center gap-2"
              >
                <input
                  type="text"
                  data-testid="chat-input"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="傳送戰術訊息..."
                  maxLength={200}
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 focus:border-amber-400 focus:outline-none"
                />
                <button
                  type="submit"
                  data-testid="chat-send-btn"
                  className="rounded-lg bg-amber-500 hover:bg-amber-400 px-3 py-1.5 text-xs font-bold text-slate-950 transition"
                >
                  傳送
                </button>
              </form>
            </div>
          )}
        </aside>
      </main>
    </div>
  );
};
