import { UserSettings } from '../../shared/types';

const PLAYER_ID_KEY = 'darkline_player_id_v1';
const SETTINGS_KEY = 'darkline_user_settings_v1';

export const DEFAULT_USER_SETTINGS: UserSettings = {
  nickname: '特務・零號',
  aiDifficulty: 'normal',
  aiPersonality: 'analytical',
  aiSpeed: 'normal',
  turnTimerSeconds: 0,
  allowZeroClue: true,
  allowUnlimitedClue: true,
  allowProperNouns: false,
  allowCompoundWords: false,
  clueStrictness: 'standard',
  soundEnabled: true,
  soundVolume: 0.65,
  reducedMotion: false,
  themeMode: 'dark',
  cardSize: 'normal',
  fontSize: 'normal',
};

export function getOrCreatePlayerId(): string {
  try {
    const existing = localStorage.getItem(PLAYER_ID_KEY);
    if (existing && existing.length >= 6) {
      return existing;
    }
    const generated = `agent-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
    localStorage.setItem(PLAYER_ID_KEY, generated);
    return generated;
  } catch {
    return `agent-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function loadUserSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_USER_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<UserSettings>;
    return {
      ...DEFAULT_USER_SETTINGS,
      ...parsed,
    };
  } catch {
    return { ...DEFAULT_USER_SETTINGS };
  }
}

export function saveUserSettings(settings: UserSettings, playerId: string): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore storage errors
  }

  void fetch('/api/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      playerId,
      nickname: settings.nickname,
      settings,
    }),
  }).catch(() => {});
}
