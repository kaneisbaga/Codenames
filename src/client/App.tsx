import React, { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  AIDifficulty,
  AIPersonality,
  ClientRoomState,
  ClueCount,
  PlayerRole,
  RoomRulesConfig,
  Team,
  UserSettings,
} from '../shared/types';
import {
  getOrCreatePlayerId,
  loadUserSettings,
  saveUserSettings,
} from './utils/session';
import { localRoomEngine } from './utils/localRoomEngine';
import { soundEngine } from './utils/sound';
import { HomeScreen } from './components/HomeScreen';
import { SinglePlayerSetup } from './components/SinglePlayerSetup';
import {
  MultiplayerEntryScreen,
  RoomLobbyScreen,
} from './components/MultiplayerLobby';
import { PracticeModeScreen } from './components/PracticeMode';
import { GameScreen } from './components/GameScreen';
import {
  AboutModal,
  ControlsGuideModal,
  HistoryModal,
  RulesModal,
  SettingsModal,
} from './components/Modals';

type ScreenView = 'home' | 'single_setup' | 'multiplayer_entry' | 'practice' | 'room';
type ActiveModal = 'rules' | 'guide' | 'settings' | 'history' | 'about' | null;

export const App: React.FC = () => {
  const [playerId] = useState<string>(() => getOrCreatePlayerId());
  const [settings, setSettings] = useState<UserSettings>(() => loadUserSettings());
  const [screen, setScreen] = useState<ScreenView>('home');
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [roomState, setRoomState] = useState<ClientRoomState | null>(null);
  const [healthInfo, setHealthInfo] = useState<{
    wordCount: number;
    geminiEnabled: boolean;
    geminiModel: string;
  }>({
    wordCount: 862,
    geminiEnabled: false,
    geminiModel: 'gemini-2.5-flash',
  });

  const socketRef = useRef<Socket | null>(null);
  const useLocalEngineRef = useRef<boolean>(false);
  const activeRoomCodeRef = useRef<string | null>(
    typeof window !== 'undefined'
      ? sessionStorage.getItem('darkline_active_room_v1')
      : null
  );

  const setActiveRoomCode = (code: string | null) => {
    activeRoomCodeRef.current = code;
    try {
      if (code) {
        sessionStorage.setItem('darkline_active_room_v1', code);
      } else {
        sessionStorage.removeItem('darkline_active_room_v1');
      }
    } catch {
      // ignore storage errors
    }
  };

  // Sync sound engine whenever settings change
  useEffect(() => {
    soundEngine.configure(settings.soundEnabled, settings.soundVolume);
  }, [settings.soundEnabled, settings.soundVolume]);

  // Subscribe to built-in Browser Room Engine (for GitHub Pages / static web mode)
  useEffect(() => {
    return localRoomEngine.subscribe(playerId, (nextState: ClientRoomState) => {
      if (useLocalEngineRef.current || !socketRef.current?.connected) {
        setRoomState(nextState);
        setActiveRoomCode(nextState.roomCode);
        setScreen('room');
      }
    });
  }, [playerId]);

  const emitWithAck = useCallback(
    async <T = any>(event: string, payload: Record<string, unknown>): Promise<T> => {
      const socket = socketRef.current;
      if (socket && socket.connected && !useLocalEngineRef.current) {
        return new Promise((resolve) => {
          let settled = false;
          const timer = setTimeout(() => {
            if (!settled) {
              settled = true;
              useLocalEngineRef.current = true;
              void localRoomEngine.handleEvent(event, payload).then(resolve);
            }
          }, 2500);
          socket.emit(event, payload, (response: T) => {
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              resolve(response);
            }
          });
        });
      }

      useLocalEngineRef.current = true;
      return (await localRoomEngine.handleEvent(event, payload)) as T;
    },
    []
  );

  // Initialize Socket.IO connection (or fallback to static browser engine on GitHub Pages) & handle invite URL (?room=XXXXXX)
  useEffect(() => {
    const isStaticHost =
      typeof window !== 'undefined' &&
      (window.location.hostname.endsWith('.github.io') ||
        window.location.protocol === 'file:');

    const tryAutoRejoinLocal = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const inviteCode = urlParams.get('room')?.trim().toUpperCase();
      const targetCode = activeRoomCodeRef.current || inviteCode;
      if (!targetCode) return;

      const res = await localRoomEngine.handleEvent('room:join', {
        roomCode: targetCode,
        playerId,
        playerName: settings.nickname,
      });
      if (res?.ok && res.state) {
        setRoomState(res.state);
        setActiveRoomCode(res.state.roomCode);
        setScreen('room');
        if (inviteCode) {
          window.history.replaceState({}, '', window.location.pathname);
        }
      } else {
        setActiveRoomCode(null);
      }
    };

    if (isStaticHost) {
      useLocalEngineRef.current = true;
      void tryAutoRejoinLocal();
      return;
    }

    const socket = io({
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 2,
      timeout: 2000,
    });
    socketRef.current = socket;

    void fetch('/api/health')
      .then((r) => {
        if (!r.ok) throw new Error('no-backend');
        return r.json();
      })
      .then((data) => {
        if (data?.wordCount) {
          setHealthInfo(data);
          useLocalEngineRef.current = false;
        } else {
          throw new Error('invalid-health');
        }
      })
      .catch(() => {
        useLocalEngineRef.current = true;
        socket.disconnect();
        void tryAutoRejoinLocal();
      });

    socket.on('room:state', (nextState: ClientRoomState) => {
      useLocalEngineRef.current = false;
      setRoomState(nextState);
      setActiveRoomCode(nextState.roomCode);
      setScreen('room');
    });

    socket.on('connect', () => {
      useLocalEngineRef.current = false;
      const urlParams = new URLSearchParams(window.location.search);
      const inviteCode = urlParams.get('room')?.trim().toUpperCase();
      const targetCode = activeRoomCodeRef.current || inviteCode;

      if (targetCode) {
        socket.emit(
          'room:join',
          {
            roomCode: targetCode,
            playerId,
            playerName: settings.nickname,
          },
          (res: { ok: boolean; state?: ClientRoomState }) => {
            if (res?.ok && res.state) {
              setRoomState(res.state);
              setActiveRoomCode(res.state.roomCode);
              setScreen('room');
              if (inviteCode) {
                window.history.replaceState({}, '', window.location.pathname);
              }
            } else {
              setActiveRoomCode(null);
            }
          }
        );
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [playerId]);

  const handleUpdateSettings = (next: UserSettings) => {
    setSettings(next);
    saveUserSettings(next, playerId);
  };

  const buildRulesFromSettings = (isPublic: boolean): Partial<RoomRulesConfig> => ({
    allowZeroClue: settings.allowZeroClue,
    allowUnlimitedClue: settings.allowUnlimitedClue,
    allowProperNouns: settings.allowProperNouns,
    allowCompoundWords: settings.allowCompoundWords,
    clueStrictness: settings.clueStrictness,
    turnTimerSeconds: settings.turnTimerSeconds,
    aiSpeed: settings.aiSpeed,
    isPublic,
  });

  const handleStartSinglePlayer = async (params: {
    role: PlayerRole;
    team: Team;
    aiDifficulty: AIDifficulty;
    aiPersonality: AIPersonality;
  }) => {
    const mode =
      params.role === 'spymaster' ? 'single_spymaster' : 'single_operative';
    const res = await emitWithAck<{
      ok: boolean;
      state?: ClientRoomState;
      error?: string;
    }>('room:create', {
      playerId,
      playerName: settings.nickname,
      mode,
      team: params.team,
      role: params.role,
      aiDifficulty: params.aiDifficulty,
      aiPersonality: params.aiPersonality,
      rules: buildRulesFromSettings(false),
      autoStart: true,
    });

    if (res.ok && res.state) {
      setRoomState(res.state);
      setActiveRoomCode(res.state.roomCode);
      setScreen('room');
    }
  };

  const handleCreateMultiplayerRoom = async (isPublic: boolean) => {
    const res = await emitWithAck<{
      ok: boolean;
      state?: ClientRoomState;
      error?: string;
    }>('room:create', {
      playerId,
      playerName: settings.nickname,
      mode: 'multiplayer',
      team: 'red',
      role: 'spymaster',
      aiDifficulty: settings.aiDifficulty,
      aiPersonality: settings.aiPersonality,
      rules: buildRulesFromSettings(isPublic),
      autoStart: false,
    });

    if (res.ok && res.state) {
      setRoomState(res.state);
      setActiveRoomCode(res.state.roomCode);
      setScreen('room');
      return { ok: true };
    }
    return { ok: false, error: res.error };
  };

  const handleJoinMultiplayerRoom = async (code: string) => {
    const res = await emitWithAck<{
      ok: boolean;
      state?: ClientRoomState;
      error?: string;
    }>('room:join', {
      roomCode: code,
      playerId,
      playerName: settings.nickname,
    });

    if (res.ok && res.state) {
      setRoomState(res.state);
      setActiveRoomCode(res.state.roomCode);
      setScreen('room');
      return { ok: true };
    }
    return { ok: false, error: res.error };
  };

  const handleLeaveRoom = async () => {
    if (roomState) {
      await emitWithAck('room:leave', {
        roomCode: roomState.roomCode,
        playerId,
      });
    }
    setActiveRoomCode(null);
    setRoomState(null);
    setScreen('home');
  };

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-100 font-sans">
      {screen === 'home' && (
        <HomeScreen
          onSelectSinglePlayer={() => setScreen('single_setup')}
          onSelectMultiplayer={() => setScreen('multiplayer_entry')}
          onSelectPractice={() => setScreen('practice')}
          onOpenHistory={() => setActiveModal('history')}
          onOpenSettings={() => setActiveModal('settings')}
          onOpenRules={() => setActiveModal('rules')}
          onOpenAbout={() => setActiveModal('about')}
          reducedMotion={settings.reducedMotion}
        />
      )}

      {screen === 'single_setup' && (
        <SinglePlayerSetup
          defaultDifficulty={settings.aiDifficulty}
          defaultPersonality={settings.aiPersonality}
          onStartSinglePlayer={handleStartSinglePlayer}
          onBack={() => setScreen('home')}
        />
      )}

      {screen === 'multiplayer_entry' && (
        <MultiplayerEntryScreen
          nickname={settings.nickname}
          onNicknameChange={(nickname) =>
            handleUpdateSettings({ ...settings, nickname })
          }
          onCreateRoom={handleCreateMultiplayerRoom}
          onJoinRoom={handleJoinMultiplayerRoom}
          onBackHome={() => setScreen('home')}
        />
      )}

      {screen === 'practice' && (
        <PracticeModeScreen
          settings={settings}
          onStartLivePracticeGame={(role) => {
            void handleStartSinglePlayer({
              role,
              team: 'red',
              aiDifficulty: 'easy',
              aiPersonality: 'analytical',
            });
          }}
          onBackHome={() => setScreen('home')}
        />
      )}

      {screen === 'room' && roomState && (
        <>
          {roomState.status === 'lobby' ? (
            <RoomLobbyScreen
              room={roomState}
              playerId={playerId}
              onUpdateSeat={(params) =>
                emitWithAck('room:updateSeat', {
                  roomCode: roomState.roomCode,
                  requesterId: playerId,
                  ...params,
                })
              }
              onAddAI={(team, role, difficulty, personality) =>
                emitWithAck('room:addAI', {
                  roomCode: roomState.roomCode,
                  requesterId: playerId,
                  team,
                  role,
                  difficulty,
                  personality,
                })
              }
              onRemovePlayer={(targetPlayerId) =>
                emitWithAck('room:removePlayer', {
                  roomCode: roomState.roomCode,
                  requesterId: playerId,
                  targetPlayerId,
                })
              }
              onAutoAssign={(fillWithAI, aiDifficulty) =>
                emitWithAck('room:autoAssign', {
                  roomCode: roomState.roomCode,
                  requesterId: playerId,
                  fillWithAI,
                  aiDifficulty,
                })
              }
              onUpdateRules={(rules) =>
                emitWithAck('room:updateRules', {
                  roomCode: roomState.roomCode,
                  requesterId: playerId,
                  rules,
                })
              }
              onStartGame={() =>
                emitWithAck('game:start', {
                  roomCode: roomState.roomCode,
                  requesterId: playerId,
                })
              }
              onSendChat={(text) => {
                void emitWithAck('chat:send', {
                  roomCode: roomState.roomCode,
                  senderId: playerId,
                  text,
                });
              }}
              onLeaveRoom={() => void handleLeaveRoom()}
            />
          ) : (
            <GameScreen
              room={roomState}
              playerId={playerId}
              settings={settings}
              onSubmitClue={(word: string, count: ClueCount) =>
                emitWithAck('game:submitClue', {
                  roomCode: roomState.roomCode,
                  playerId,
                  word,
                  count,
                })
              }
              onMakeGuess={(cardIndex: number) =>
                emitWithAck('game:makeGuess', {
                  roomCode: roomState.roomCode,
                  playerId,
                  cardIndex,
                })
              }
              onToggleMark={(cardIndex: number) => {
                void emitWithAck('game:toggleMark', {
                  roomCode: roomState.roomCode,
                  playerId,
                  cardIndex,
                });
              }}
              onEndTurn={() =>
                emitWithAck('game:endTurn', {
                  roomCode: roomState.roomCode,
                  playerId,
                })
              }
              onRestartGame={() =>
                emitWithAck('game:start', {
                  roomCode: roomState.roomCode,
                  requesterId: playerId,
                })
              }
              onSendChat={(text: string) => {
                void emitWithAck('chat:send', {
                  roomCode: roomState.roomCode,
                  senderId: playerId,
                  text,
                });
              }}
              onRequestAIAssist={() => {
                void emitWithAck('game:aiAssist', {
                  roomCode: roomState.roomCode,
                  requesterId: playerId,
                });
              }}
              onLeaveRoom={() => void handleLeaveRoom()}
              onOpenRules={() => setActiveModal('rules')}
              onOpenGuide={() => setActiveModal('guide')}
              onOpenSettings={() => setActiveModal('settings')}
            />
          )}
        </>
      )}

      {/* Tucked-away Modals */}
      {activeModal === 'rules' && (
        <RulesModal onClose={() => setActiveModal(null)} />
      )}
      {activeModal === 'guide' && (
        <ControlsGuideModal onClose={() => setActiveModal(null)} />
      )}
      {activeModal === 'settings' && (
        <SettingsModal
          settings={settings}
          onUpdate={handleUpdateSettings}
          onClose={() => setActiveModal(null)}
        />
      )}
      {activeModal === 'history' && (
        <HistoryModal onClose={() => setActiveModal(null)} />
      )}
      {activeModal === 'about' && (
        <AboutModal
          healthInfo={healthInfo}
          onClose={() => setActiveModal(null)}
        />
      )}
    </div>
  );
};
