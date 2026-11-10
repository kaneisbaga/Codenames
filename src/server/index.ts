import 'dotenv/config';
import express from 'express';
import { exec } from 'node:child_process';
import fs from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Server, Socket } from 'socket.io';
import {
  AIDifficulty,
  AIPersonality,
  ClueCount,
  GameMode,
  PlayerRole,
  RoomRulesConfig,
  ServerBoardCard,
  Team,
  UserSettings,
} from '../shared/types';
import { WORD_DICTIONARY } from '../shared/words';
import { validateClue } from '../shared/rulesEngine';
import {
  generateLocalSpymasterClue,
  scoreWordAgainstClue,
} from '../shared/semanticEngine';
import { getConfiguredGeminiModel, isGeminiConfigured } from './aiProvider';
import {
  clearAllGameHistory,
  deleteGameHistoryById,
  getUserProfile,
  listGameHistory,
  saveUserProfile,
} from './db';
import { RoomManager, ServerRoomState } from './roomManager';

interface SocketData {
  playerId?: string;
  roomCode?: string;
}

export async function createAppServer(options?: {
  port?: number;
  enableVite?: boolean;
  persistToDb?: boolean;
  stepDelayMultiplier?: number;
}) {
  const app = express();
  app.use(express.json());

  const httpServer = createServer(app);
  const io = new Server<Record<string, any>, Record<string, any>, Record<string, any>, SocketData>(
    httpServer,
    {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    }
  );

  const broadcastRoomState = (room: ServerRoomState) => {
    const adapterRoom = io.sockets.adapter.rooms.get(room.roomCode);
    if (!adapterRoom) return;

    for (const socketId of adapterRoom) {
      const clientSocket = io.sockets.sockets.get(socketId);
      if (!clientSocket) continue;
      const viewerId = clientSocket.data.playerId || '';
      const sanitized = roomManager.sanitizeRoomForViewer(room, viewerId);
      clientSocket.emit('room:state', sanitized);
    }
  };

  const roomManager = new RoomManager({
    onRoomUpdated: broadcastRoomState,
    persistToDb: options?.persistToDb ?? true,
    stepDelayMultiplier: options?.stepDelayMultiplier ?? 1,
  });

  // Periodic expired room cleanup
  const cleanupInterval = setInterval(() => {
    roomManager.runExpiryCleanup();
  }, 15 * 60 * 1000);
  cleanupInterval.unref();

  // ==========================================================
  // REST API Routes
  // ==========================================================
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      wordCount: WORD_DICTIONARY.length,
      geminiEnabled: isGeminiConfigured(),
      geminiModel: getConfiguredGeminiModel(),
    });
  });

  app.get('/api/rooms', (_req, res) => {
    res.json({
      rooms: roomManager.listPublicRooms(),
    });
  });

  app.get('/api/history', (_req, res) => {
    const records = listGameHistory(100);
    res.json({ records });
  });

  app.delete('/api/history/:id', (req, res) => {
    deleteGameHistoryById(req.params.id);
    res.json({ ok: true });
  });

  app.delete('/api/history', (_req, res) => {
    clearAllGameHistory();
    res.json({ ok: true });
  });

  app.get('/api/profile/:playerId', (req, res) => {
    const profile = getUserProfile(req.params.playerId);
    res.json({ profile });
  });

  app.post('/api/profile', (req, res) => {
    const { playerId, nickname, settings } = req.body as {
      playerId?: string;
      nickname?: string;
      settings?: Partial<UserSettings>;
    };
    if (!playerId) {
      res.status(400).json({ error: '缺少 playerId' });
      return;
    }
    saveUserProfile(playerId, nickname || '暗線特務', settings || {});
    res.json({ ok: true });
  });

  // Practice mode helper: evaluate a custom clue on a practice board
  app.post('/api/practice/evaluate-clue', (req, res) => {
    const { word, count, board, team } = req.body as {
      word: string;
      count: ClueCount;
      board: ServerBoardCard[];
      team: Team;
    };

    const validation = validateClue(word || '', count ?? 1, board || []);
    if (!validation.valid) {
      res.json({
        valid: false,
        reason: validation.reason,
      });
      return;
    }

    const scoredBoard = (board || [])
      .filter((c) => !c.revealed)
      .map((c) => {
        const detail = scoreWordAgainstClue(validation.normalizedWord, c.word);
        return {
          word: c.word,
          type: c.type,
          score: detail.score,
          reason: detail.reason,
        };
      })
      .sort((a, b) => b.score - a.score);

    const recommended = generateLocalSpymasterClue(
      board || [],
      team || 'red',
      'hard',
      'analytical',
      {
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
        isPublic: false,
      }
    );

    res.json({
      valid: true,
      normalizedWord: validation.normalizedWord,
      scoredBoard: scoredBoard.slice(0, 8),
      aiRecommendation: recommended,
    });
  });

  // ==========================================================
  // Socket.IO Real-time Event Handlers
  // ==========================================================
  const joinSocketToRoom = (
    socket: Socket<Record<string, any>, Record<string, any>, Record<string, any>, SocketData>,
    roomCode: string,
    playerId: string
  ) => {
    if (socket.data.roomCode && socket.data.roomCode !== roomCode) {
      socket.leave(socket.data.roomCode);
    }
    socket.data.playerId = playerId;
    socket.data.roomCode = roomCode;
    socket.join(roomCode);
  };

  io.on('connection', (socket) => {
    socket.on(
      'room:create',
      (
        payload: {
          playerId: string;
          playerName: string;
          mode: GameMode;
          team?: Team;
          role?: PlayerRole;
          aiDifficulty?: AIDifficulty;
          aiPersonality?: AIPersonality;
          rules?: Partial<RoomRulesConfig>;
          autoStart?: boolean;
        },
        ack?: (res: any) => void
      ) => {
        try {
          const room = roomManager.createRoom({
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
          joinSocketToRoom(socket, room.roomCode, payload.playerId);
          const sanitized = roomManager.sanitizeRoomForViewer(room, payload.playerId);
          socket.emit('room:state', sanitized);
          ack?.({ ok: true, state: sanitized });
        } catch (err: any) {
          ack?.({ ok: false, error: err?.message || '建立房間失敗' });
        }
      }
    );

    socket.on(
      'room:join',
      (
        payload: {
          roomCode: string;
          playerId: string;
          playerName: string;
        },
        ack?: (res: any) => void
      ) => {
        try {
          const room = roomManager.joinRoom(payload);
          joinSocketToRoom(socket, room.roomCode, payload.playerId);
          broadcastRoomState(room);
          const sanitized = roomManager.sanitizeRoomForViewer(room, payload.playerId);
          ack?.({ ok: true, state: sanitized });
        } catch (err: any) {
          ack?.({ ok: false, error: err?.message || '加入房間失敗' });
        }
      }
    );

    socket.on(
      'room:leave',
      (payload: { roomCode: string; playerId: string }, ack?: (res: any) => void) => {
        try {
          socket.leave(payload.roomCode.toUpperCase());
          socket.data.roomCode = undefined;
          roomManager.leaveRoom(payload.roomCode, payload.playerId);
          ack?.({ ok: true });
        } catch (err: any) {
          ack?.({ ok: false, error: err?.message || '離開房間失敗' });
        }
      }
    );

    socket.on(
      'room:updateSeat',
      (
        payload: {
          roomCode: string;
          requesterId: string;
          targetPlayerId: string;
          team?: Team;
          role?: PlayerRole;
          isReady?: boolean;
          aiDifficulty?: AIDifficulty;
          aiPersonality?: AIPersonality;
        },
        ack?: (res: any) => void
      ) => {
        try {
          const room = roomManager.updateSeat(payload);
          const sanitized = roomManager.sanitizeRoomForViewer(room, payload.requesterId);
          ack?.({ ok: true, state: sanitized });
        } catch (err: any) {
          ack?.({ ok: false, error: err?.message || '更新席位失敗' });
        }
      }
    );

    socket.on(
      'room:addAI',
      (
        payload: {
          roomCode: string;
          requesterId: string;
          team: Team;
          role: PlayerRole;
          difficulty?: AIDifficulty;
          personality?: AIPersonality;
        },
        ack?: (res: any) => void
      ) => {
        try {
          const room = roomManager.addAIPlayer(payload);
          const sanitized = roomManager.sanitizeRoomForViewer(room, payload.requesterId);
          ack?.({ ok: true, state: sanitized });
        } catch (err: any) {
          ack?.({ ok: false, error: err?.message || '新增 AI 失敗' });
        }
      }
    );

    socket.on(
      'room:removePlayer',
      (
        payload: {
          roomCode: string;
          requesterId: string;
          targetPlayerId: string;
        },
        ack?: (res: any) => void
      ) => {
        try {
          const room = roomManager.removePlayer(payload);
          const sanitized = roomManager.sanitizeRoomForViewer(room, payload.requesterId);
          ack?.({ ok: true, state: sanitized });
        } catch (err: any) {
          ack?.({ ok: false, error: err?.message || '移除玩家失敗' });
        }
      }
    );

    socket.on(
      'room:autoAssign',
      (
        payload: {
          roomCode: string;
          requesterId: string;
          fillWithAI?: boolean;
          aiDifficulty?: AIDifficulty;
        },
        ack?: (res: any) => void
      ) => {
        try {
          const room = roomManager.autoAssignTeams(payload);
          const sanitized = roomManager.sanitizeRoomForViewer(room, payload.requesterId);
          ack?.({ ok: true, state: sanitized });
        } catch (err: any) {
          ack?.({ ok: false, error: err?.message || '自動分配失敗' });
        }
      }
    );

    socket.on(
      'room:updateRules',
      (
        payload: {
          roomCode: string;
          requesterId: string;
          rules: Partial<RoomRulesConfig>;
        },
        ack?: (res: any) => void
      ) => {
        try {
          const room = roomManager.updateRoomRules(payload);
          const sanitized = roomManager.sanitizeRoomForViewer(room, payload.requesterId);
          ack?.({ ok: true, state: sanitized });
        } catch (err: any) {
          ack?.({ ok: false, error: err?.message || '更新規則失敗' });
        }
      }
    );

    socket.on(
      'game:start',
      (
        payload: {
          roomCode: string;
          requesterId: string;
          startingTeam?: Team;
        },
        ack?: (res: any) => void
      ) => {
        try {
          const room = roomManager.startGame(
            payload.roomCode,
            payload.requesterId,
            payload.startingTeam
          );
          const sanitized = roomManager.sanitizeRoomForViewer(room, payload.requesterId);
          ack?.({ ok: true, state: sanitized });
        } catch (err: any) {
          ack?.({ ok: false, error: err?.message || '啟動遊戲失敗' });
        }
      }
    );

    socket.on(
      'game:submitClue',
      (
        payload: {
          roomCode: string;
          playerId: string;
          word: string;
          count: ClueCount;
        },
        ack?: (res: any) => void
      ) => {
        try {
          const room = roomManager.submitClue(payload);
          const sanitized = roomManager.sanitizeRoomForViewer(room, payload.playerId);
          ack?.({ ok: true, state: sanitized });
        } catch (err: any) {
          ack?.({ ok: false, error: err?.message || '提交線索失敗' });
        }
      }
    );

    socket.on(
      'game:makeGuess',
      (
        payload: {
          roomCode: string;
          playerId: string;
          cardIndex: number;
        },
        ack?: (res: any) => void
      ) => {
        try {
          const room = roomManager.makeGuess(payload);
          const sanitized = roomManager.sanitizeRoomForViewer(room, payload.playerId);
          ack?.({ ok: true, state: sanitized });
        } catch (err: any) {
          ack?.({ ok: false, error: err?.message || '翻牌失敗' });
        }
      }
    );

    socket.on(
      'game:toggleMark',
      (
        payload: {
          roomCode: string;
          playerId: string;
          cardIndex: number;
        },
        ack?: (res: any) => void
      ) => {
        try {
          const room = roomManager.toggleCardMark(payload);
          const sanitized = roomManager.sanitizeRoomForViewer(room, payload.playerId);
          ack?.({ ok: true, state: sanitized });
        } catch (err: any) {
          ack?.({ ok: false, error: err?.message || '標記失敗' });
        }
      }
    );

    socket.on(
      'game:endTurn',
      (
        payload: {
          roomCode: string;
          playerId: string;
        },
        ack?: (res: any) => void
      ) => {
        try {
          const room = roomManager.endTurn(payload);
          const sanitized = roomManager.sanitizeRoomForViewer(room, payload.playerId);
          ack?.({ ok: true, state: sanitized });
        } catch (err: any) {
          ack?.({ ok: false, error: err?.message || '結束回合失敗' });
        }
      }
    );

    socket.on(
      'game:aiAssist',
      async (
        payload: {
          roomCode: string;
          requesterId: string;
        },
        ack?: (res: any) => void
      ) => {
        try {
          const room = await roomManager.triggerAIAssist(payload);
          const sanitized = roomManager.sanitizeRoomForViewer(room, payload.requesterId);
          ack?.({ ok: true, state: sanitized });
        } catch (err: any) {
          ack?.({ ok: false, error: err?.message || 'AI 輔助失敗' });
        }
      }
    );

    socket.on(
      'chat:send',
      (
        payload: {
          roomCode: string;
          senderId: string;
          text: string;
        },
        ack?: (res: any) => void
      ) => {
        try {
          const room = roomManager.addChatMessage(payload);
          const sanitized = roomManager.sanitizeRoomForViewer(room, payload.senderId);
          ack?.({ ok: true, state: sanitized });
        } catch (err: any) {
          ack?.({ ok: false, error: err?.message || '傳送訊息失敗' });
        }
      }
    );

    socket.on('disconnect', () => {
      if (socket.data.roomCode && socket.data.playerId) {
        roomManager.markPlayerDisconnected(socket.data.roomCode, socket.data.playerId);
      }
    });
  });

  // ==========================================================
  // Frontend Asset Serving (Vite Dev Middleware or Prod Static)
  // ==========================================================
  const enableVite = options?.enableVite ?? true;
  if (enableVite) {
    const clientDist = path.resolve(process.cwd(), 'dist', 'client');
    const prodIndexHtml = path.join(clientDist, 'index.html');
    const useProdStatic =
      process.env.NODE_ENV === 'production' && fs.existsSync(prodIndexHtml);

    if (!useProdStatic) {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } else {
      app.use(express.static(clientDist));
      app.get('*', (_req, res) => {
        res.sendFile(prodIndexHtml);
      });
    }
  }

  return { app, httpServer, io, roomManager };
}

function getLanAddresses(port: number): string[] {
  const nets = os.networkInterfaces();
  const urls: string[] = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        urls.push(`http://${net.address}:${port}`);
      }
    }
  }
  return urls;
}

function openBrowserIfRequested(port: number): void {
  if (process.env.AUTO_OPEN_BROWSER !== '1') return;
  const url = `http://localhost:${port}`;
  if (process.platform === 'win32') {
    exec(`start "" "${url}"`);
  } else if (process.platform === 'darwin') {
    exec(`open "${url}"`);
  } else {
    exec(`xdg-open "${url}"`);
  }
}

// Start server if invoked directly
const isMainModule = Boolean(
  process.argv[1]?.replace(/\\/g, '/').endsWith('src/server/index.ts')
);

if (isMainModule) {
  const port = Number(process.env.PORT) || 3000;
  createAppServer({ port })
    .then(({ httpServer }) => {
      httpServer.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          console.log(
            `\n[情報中心] 連接埠 ${port} 已有伺服器正在運行，正在為您開啟 http://localhost:${port} ...\n`
          );
          openBrowserIfRequested(port);
        } else {
          console.error('[錯誤] 伺服器啟動失敗：', err.message);
        }
      });

      httpServer.listen(port, '0.0.0.0', () => {
        const lanUrls = getLanAddresses(port);
        console.log('\n========================================================');
        console.log('  機密代碼：暗線任務 | CODENAMES: DARKLINE PROTOCOL');
        console.log('========================================================');
        console.log(`  ▶ 本機連線網址 (Local):   http://localhost:${port}`);
        for (const url of lanUrls) {
          console.log(`  ▶ 區網多人連線 (Network): ${url}`);
        }
        console.log(
          `  ▶ AI 引擎狀態:            ${
            isGeminiConfigured()
              ? `Gemini API (${getConfiguredGeminiModel()}) + 本機語意圖譜雙軌備援`
              : '內建本機語意圖譜智慧 AI (860+ 繁中代號詞庫)'
          }`
        );
        console.log('========================================================\n');
        openBrowserIfRequested(port);
      });
    })
    .catch((err) => {
      console.error('[錯誤] 伺服器初始化失敗：', err);
      process.exit(1);
    });
}
