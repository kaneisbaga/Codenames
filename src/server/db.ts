import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { GameHistoryRecord, UserSettings } from '../shared/types';

let dbInstance: DatabaseSync | null = null;

export function getDb(customPath?: string): DatabaseSync {
  if (dbInstance && !customPath) {
    return dbInstance;
  }

  const dbPath =
    customPath ||
    process.env.DB_PATH ||
    path.resolve(process.cwd(), 'data', 'darkline.sqlite');

  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS rooms (
      room_code TEXT PRIMARY KEY,
      state_json TEXT NOT NULL,
      is_public INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'lobby',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS game_history (
      id TEXT PRIMARY KEY,
      room_code TEXT NOT NULL,
      played_at TEXT NOT NULL,
      mode TEXT NOT NULL,
      winner_team TEXT NOT NULL,
      win_reason TEXT NOT NULL,
      player_name TEXT NOT NULL,
      player_team TEXT NOT NULL,
      player_role TEXT NOT NULL,
      player_won INTEGER NOT NULL,
      duration_seconds INTEGER NOT NULL,
      total_guesses INTEGER NOT NULL,
      ai_difficulty TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_profiles (
      player_id TEXT PRIMARY KEY,
      nickname TEXT NOT NULL,
      settings_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  if (!customPath) {
    dbInstance = db;
  }
  return db;
}

export function saveRoomSnapshot<T extends {
  roomCode: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  rules: { isPublic: boolean };
}>(room: T, db: DatabaseSync = getDb()): void {
  const stmt = db.prepare(`
    INSERT INTO rooms (room_code, state_json, is_public, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(room_code) DO UPDATE SET
      state_json = excluded.state_json,
      is_public = excluded.is_public,
      status = excluded.status,
      updated_at = excluded.updated_at
  `);
  stmt.run(
    room.roomCode,
    JSON.stringify(room),
    room.rules.isPublic ? 1 : 0,
    room.status,
    room.createdAt,
    room.updatedAt
  );
}

export function deleteRoomSnapshot(roomCode: string, db: DatabaseSync = getDb()): void {
  const stmt = db.prepare(`DELETE FROM rooms WHERE room_code = ?`);
  stmt.run(roomCode);
}

export function loadActiveRoomSnapshots<T>(
  expiryMs: number = Number(process.env.ROOM_EXPIRY_MS) || 86400000,
  db: DatabaseSync = getDb()
): T[] {
  cleanupExpiredRooms(expiryMs, db);
  const stmt = db.prepare(`SELECT state_json FROM rooms ORDER BY updated_at DESC`);
  const rows = stmt.all() as Array<{ state_json: string }>;
  const results: T[] = [];
  for (const row of rows) {
    try {
      results.push(JSON.parse(row.state_json) as T);
    } catch {
      // Ignore malformed rows
    }
  }
  return results;
}

export function cleanupExpiredRooms(
  expiryMs: number = Number(process.env.ROOM_EXPIRY_MS) || 86400000,
  db: DatabaseSync = getDb()
): number {
  const cutoff = Date.now() - expiryMs;
  const stmt = db.prepare(`DELETE FROM rooms WHERE updated_at < ?`);
  const res = stmt.run(cutoff);
  return Number(res.changes ?? 0);
}

export function insertGameHistory(
  record: GameHistoryRecord,
  db: DatabaseSync = getDb()
): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO game_history (
      id, room_code, played_at, mode, winner_team, win_reason,
      player_name, player_team, player_role, player_won,
      duration_seconds, total_guesses, ai_difficulty
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    record.id,
    record.roomCode,
    record.playedAt,
    record.mode,
    record.winnerTeam,
    record.winReason,
    record.playerName,
    record.playerTeam,
    record.playerRole,
    record.playerWon ? 1 : 0,
    record.durationSeconds,
    record.totalGuesses,
    record.aiDifficulty
  );
}

export function listGameHistory(
  limit = 100,
  db: DatabaseSync = getDb()
): GameHistoryRecord[] {
  const stmt = db.prepare(
    `SELECT * FROM game_history ORDER BY played_at DESC LIMIT ?`
  );
  const rows = stmt.all(limit) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: String(r.id),
    roomCode: String(r.room_code),
    playedAt: String(r.played_at),
    mode: r.mode as GameHistoryRecord['mode'],
    winnerTeam: r.winner_team as GameHistoryRecord['winnerTeam'],
    winReason: r.win_reason as GameHistoryRecord['winReason'],
    playerName: String(r.player_name),
    playerTeam: r.player_team as GameHistoryRecord['playerTeam'],
    playerRole: r.player_role as GameHistoryRecord['playerRole'],
    playerWon: Boolean(r.player_won),
    durationSeconds: Number(r.duration_seconds),
    totalGuesses: Number(r.total_guesses),
    aiDifficulty: r.ai_difficulty as GameHistoryRecord['aiDifficulty'],
  }));
}

export function deleteGameHistoryById(
  id: string,
  db: DatabaseSync = getDb()
): void {
  const stmt = db.prepare(`DELETE FROM game_history WHERE id = ?`);
  stmt.run(id);
}

export function clearAllGameHistory(db: DatabaseSync = getDb()): void {
  db.exec(`DELETE FROM game_history`);
}

export function saveUserProfile(
  playerId: string,
  nickname: string,
  settings: Partial<UserSettings>,
  db: DatabaseSync = getDb()
): void {
  const stmt = db.prepare(`
    INSERT INTO user_profiles (player_id, nickname, settings_json, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(player_id) DO UPDATE SET
      nickname = excluded.nickname,
      settings_json = excluded.settings_json,
      updated_at = excluded.updated_at
  `);
  stmt.run(playerId, nickname, JSON.stringify(settings), Date.now());
}

export function getUserProfile(
  playerId: string,
  db: DatabaseSync = getDb()
): { nickname: string; settings: Partial<UserSettings> } | null {
  const stmt = db.prepare(
    `SELECT nickname, settings_json FROM user_profiles WHERE player_id = ?`
  );
  const row = stmt.get(playerId) as
    | { nickname: string; settings_json: string }
    | undefined;
  if (!row) return null;
  try {
    return {
      nickname: row.nickname,
      settings: JSON.parse(row.settings_json) as Partial<UserSettings>,
    };
  } catch {
    return { nickname: row.nickname, settings: {} };
  }
}
