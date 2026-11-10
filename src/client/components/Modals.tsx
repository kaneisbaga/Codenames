import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  History,
  Info,
  Settings,
  Shield,
  Sparkles,
  Trash2,
  Trophy,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  AIDifficulty,
  AIPersonality,
  ClueStrictness,
  GameHistoryRecord,
  UserSettings,
} from '../../shared/types';
import { getDifficultyLabel, getPersonalityLabel } from '../../shared/semanticEngine';
import {
  clearLocalGameHistory,
  deleteLocalGameHistoryById,
  loadLocalGameHistory,
} from '../utils/localRoomEngine';

interface ModalWrapperProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
}

export const ModalWrapper: React.FC<ModalWrapperProps> = ({
  title,
  subtitle,
  icon,
  onClose,
  children,
  maxWidth = 'max-w-2xl',
}) => {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className={`relative w-full ${maxWidth} max-h-[88vh] flex flex-col rounded-2xl border border-amber-500/25 bg-[#0b111e]/95 text-slate-100 shadow-2xl shadow-black/90 overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-800/80 px-6 py-4 bg-[#080d17]">
          <div className="flex items-center gap-3">
            {icon && <div className="text-amber-400">{icon}</div>}
            <div>
              <h2 className="text-lg font-bold tracking-wider text-slate-100">
                {title}
              </h2>
              {subtitle && (
                <p className="text-xs text-slate-400 tracking-wide">{subtitle}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="關閉視窗"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto space-y-5 text-sm leading-relaxed">
          {children}
        </div>
      </div>
    </div>
  );
};

export const RulesModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  return (
    <ModalWrapper
      title="遊戲規則檔案"
      subtitle="CODENAMES PROTOCOL — 機密代碼核心行動準則"
      icon={<BookOpen className="w-5 h-5" />}
      onClose={onClose}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="font-bold text-amber-400 mb-2">1. 陣營與 25 張代號配置</h3>
          <p className="text-slate-300 text-xs leading-relaxed">
            桌面由 5×5 共 25 張機密代號卡組成，分為紅隊與藍隊兩個情報陣營。每隊設有一名「間諜領袖」（掌握完整關鍵名單）與一名以上的「間諜隊員」（僅見代號文字）。
          </p>
          <ul className="mt-3 space-y-1 text-xs text-slate-300">
            <li>• <span className="text-rose-400 font-semibold">先攻陣營特務</span>：9 張</li>
            <li>• <span className="text-sky-400 font-semibold">後攻陣營特務</span>：8 張</li>
            <li>• <span className="text-stone-300 font-semibold">中立路人（平民）</span>：7 張</li>
            <li>• <span className="text-amber-400 font-semibold">黑名單殺手</span>：1 張</li>
          </ul>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="font-bold text-amber-400 mb-2">2. 間諜領袖給線索</h3>
          <p className="text-slate-300 text-xs leading-relaxed">
            每回合由該隊領袖給出「一個詞語 + 一個數字」，例如：<span className="text-amber-300 font-mono">海洋 : 2</span>，代表桌面有 2 張己方特務代號與「海洋」語意相關。
          </p>
          <ul className="mt-3 space-y-1 text-xs text-slate-400">
            <li>• 嚴禁直接使用桌面上的代號或其包含字元。</li>
            <li>• 嚴禁以卡片位置、字數或部首進行暗示。</li>
            <li>• 可於進階規則啟用「0」或「無限 (∞)」線索。</li>
          </ul>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="font-bold text-amber-400 mb-2">3. 間諜隊員翻牌猜測</h3>
          <ul className="space-y-1.5 text-xs text-slate-300">
            <li>• <span className="text-emerald-400 font-semibold">翻中己方特務</span>：可繼續猜測，或隨時主動結束回合。</li>
            <li>• <span className="text-amber-300 font-semibold">猜測次數上限</span>：最多可猜「線索數字 + 1」張（多出的 1 張可用於追猜前幾回合未找出的代號）。</li>
            <li>• <span className="text-stone-400 font-semibold">翻中路人或敵方特務</span>：回合立即結束並交棒給另一隊。</li>
            <li>• <span className="text-rose-500 font-semibold">翻中殺手</span>：任務立即失敗，由對方陣營獲勝！</li>
          </ul>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="font-bold text-amber-400 mb-2">4. 勝負判定條件</h3>
          <ul className="space-y-1.5 text-xs text-slate-300">
            <li>• 最先翻開所有己方特務（先攻 9 名／後攻 8 名）的陣營立即獲勝。</li>
            <li>• 若對手在他們的回合不慎翻出我方最後一名特務，同樣立即判定我方獲勝。</li>
            <li>• 任何一隊誤觸唯一的「殺手」代號卡，立即判定落敗。</li>
          </ul>
        </div>
      </div>
    </ModalWrapper>
  );
};

export const ControlsGuideModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  return (
    <ModalWrapper
      title="戰術控制台操作說明"
      subtitle="INTERFACE & TACTICAL OPERATIONS"
      icon={<Info className="w-5 h-5" />}
      onClose={onClose}
    >
      <div className="space-y-4 text-xs text-slate-300">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h4 className="font-bold text-amber-400 text-sm mb-1.5">間諜領袖視角 (Spymaster)</h4>
          <p>
            領袖的 5×5 卡片邊角與色標會顯示秘密關鍵名單（紅方、藍方、路人、殺手）。可點擊上方「關鍵名單視角」切換預覽隊員眼中的純淨桌面。輪到己方給線索時，於下方控制台輸入單詞與數量並送出。
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h4 className="font-bold text-amber-400 text-sm mb-1.5">間諜隊員視角 (Operative)</h4>
          <p>
            隊員僅能看見 25 個代號文字與已翻開卡片的插畫檔案。在己方猜測階段，點擊未翻開的卡片右上角「標記」圖示可與隊友討論候選目標；點擊卡片中央則正式揭曉檔案身分。只要已猜過至少 1 張，可隨時點擊「結束回合」保全戰果。
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h4 className="font-bold text-amber-400 text-sm mb-1.5">AI 思考與推理摘要</h4>
          <p>
            遊戲右側（手機版為下方分頁）提供「AI 推理摘要」，即時顯示 AI 隊員針對公開線索計算出的候選代號信心度與語意關聯理由，同時嚴格保護未翻開卡片的秘密身分絕不外洩。
          </p>
        </div>
      </div>
    </ModalWrapper>
  );
};

export const SettingsModal: React.FC<{
  settings: UserSettings;
  onUpdate: (next: UserSettings) => void;
  onClose: () => void;
}> = ({ settings, onUpdate, onClose }) => {
  const [draft, setDraft] = useState<UserSettings>({ ...settings });

  const handleSave = () => {
    onUpdate(draft);
    onClose();
  };

  return (
    <ModalWrapper
      title="系統與戰術設定"
      subtitle="AGENCY CONFIGURATION & AI PARAMETERS"
      icon={<Settings className="w-5 h-5" />}
      onClose={onClose}
    >
      <div className="space-y-5">
        {/* Player Profile */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">
            特務身份與語言
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">預設特務代號（暱稱）</label>
              <input
                type="text"
                maxLength={18}
                value={draft.nickname}
                onChange={(e) => setDraft({ ...draft, nickname: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">介面語言</label>
              <input
                type="text"
                disabled
                value="繁體中文 (zh-Hant)"
                className="w-full rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2 text-sm text-slate-400 cursor-not-allowed"
              />
            </div>
          </div>
        </div>

        {/* AI Configuration */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">
            AI 特務決策核心
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">預設 AI 難度</label>
              <select
                value={draft.aiDifficulty}
                onChange={(e) =>
                  setDraft({ ...draft, aiDifficulty: e.target.value as AIDifficulty })
                }
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              >
                <option value="easy">簡單（直覺保守）</option>
                <option value="normal">普通（平衡聯想）</option>
                <option value="hard">困難（深層語意策略）</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">預設 AI 個性</label>
              <select
                value={draft.aiPersonality}
                onChange={(e) =>
                  setDraft({ ...draft, aiPersonality: e.target.value as AIPersonality })
                }
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              >
                <option value="cautious">穩健型（極力避險）</option>
                <option value="risky">冒險型（多目標推進）</option>
                <option value="associative">聯想型（跨類別跳躍）</option>
                <option value="analytical">分析型（最佳化信噪比）</option>
                <option value="intuitive">直覺型（具體意象優先）</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">AI 思考節奏</label>
              <select
                value={draft.aiSpeed}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    aiSpeed: e.target.value as UserSettings['aiSpeed'],
                  })
                }
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              >
                <option value="fast">快速</option>
                <option value="normal">標準</option>
                <option value="cinematic">沉浸式</option>
              </select>
            </div>
          </div>
        </div>

        {/* Game & Clue Rules */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">
            線索規則與時間限制
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">線索合法性嚴格度</label>
              <select
                value={draft.clueStrictness}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    clueStrictness: e.target.value as ClueStrictness,
                  })
                }
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              >
                <option value="standard">標準（禁止未翻開代號字元重疊）</option>
                <option value="strict">嚴格（禁止全桌面 25 張代號字元重疊）</option>
                <option value="relaxed">彈性（僅禁止完整包含代號詞彙）</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">每回合時間限制</label>
              <select
                value={draft.turnTimerSeconds}
                onChange={(e) =>
                  setDraft({ ...draft, turnTimerSeconds: Number(e.target.value) })
                }
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              >
                <option value={0}>不限時間</option>
                <option value={60}>60 秒</option>
                <option value={90}>90 秒</option>
                <option value={120}>120 秒</option>
                <option value={180}>180 秒</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.allowZeroClue}
                onChange={(e) =>
                  setDraft({ ...draft, allowZeroClue: e.target.checked })
                }
                className="accent-amber-500"
              />
              允許 0 張線索
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.allowUnlimitedClue}
                onChange={(e) =>
                  setDraft({ ...draft, allowUnlimitedClue: e.target.checked })
                }
                className="accent-amber-500"
              />
              允許無限 (∞) 猜測
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.allowProperNouns}
                onChange={(e) =>
                  setDraft({ ...draft, allowProperNouns: e.target.checked })
                }
                className="accent-amber-500"
              />
              開放多詞專有名詞
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.allowCompoundWords}
                onChange={(e) =>
                  setDraft({ ...draft, allowCompoundWords: e.target.checked })
                }
                className="accent-amber-500"
              />
              開放複合詞彈性
            </label>
          </div>
        </div>

        {/* Sound & Visual Appearance */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">
            音效、動畫與版面外觀
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-300 flex items-center gap-2">
                {draft.soundEnabled ? (
                  <Volume2 className="w-4 h-4 text-amber-400" />
                ) : (
                  <VolumeX className="w-4 h-4 text-slate-500" />
                )}
                戰術音效開關
              </span>
              <input
                type="checkbox"
                checked={draft.soundEnabled}
                onChange={(e) =>
                  setDraft({ ...draft, soundEnabled: e.target.checked })
                }
                className="accent-amber-500 w-4 h-4"
              />
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400 whitespace-nowrap">音量</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={draft.soundVolume}
                onChange={(e) =>
                  setDraft({ ...draft, soundVolume: Number(e.target.value) })
                }
                className="w-full accent-amber-500"
              />
              <span className="text-xs font-mono text-slate-300 w-9 text-right">
                {Math.round(draft.soundVolume * 100)}%
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div>
              <label className="block text-xs text-slate-400 mb-1">卡片尺寸</label>
              <select
                value={draft.cardSize}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    cardSize: e.target.value as UserSettings['cardSize'],
                  })
                }
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100"
              >
                <option value="compact">緊湊</option>
                <option value="normal">標準</option>
                <option value="large">寬敞</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">代號字體大小</label>
              <select
                value={draft.fontSize}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    fontSize: e.target.value as UserSettings['fontSize'],
                  })
                }
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100"
              >
                <option value="normal">標準</option>
                <option value="large">加大</option>
                <option value="xlarge">特大</option>
              </select>
            </div>

            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.reducedMotion}
                  onChange={(e) =>
                    setDraft({ ...draft, reducedMotion: e.target.checked })
                  }
                  className="accent-amber-500"
                />
                減少翻牌與過場動畫
              </label>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="rounded-xl bg-amber-500 px-5 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 transition"
          >
            儲存設定
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
};

export const HistoryModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [records, setRecords] = useState<GameHistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/history');
      if (!res.ok) throw new Error('fallback');
      const data = (await res.json()) as { records?: GameHistoryRecord[] };
      const serverRecords = data.records || [];
      const localRecords = loadLocalGameHistory();
      const mergedMap = new Map<string, GameHistoryRecord>();
      for (const r of [...serverRecords, ...localRecords]) {
        mergedMap.set(r.id, r);
      }
      setRecords(Array.from(mergedMap.values()));
    } catch {
      setRecords(loadLocalGameHistory());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchRecords();
  }, []);

  const handleDeleteOne = async (id: string) => {
    deleteLocalGameHistoryById(id);
    await fetch(`/api/history/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
    setRecords((prev) => prev.filter((r) => r.id !== id));
  };

  const handleClearAll = async () => {
    clearLocalGameHistory();
    await fetch('/api/history', { method: 'DELETE' }).catch(() => {});
    setRecords([]);
  };

  const totalGames = records.length;
  const totalWins = records.filter((r) => r.playerWon).length;
  const winRate = totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0;

  return (
    <ModalWrapper
      title="行動戰績與歷史檔案"
      subtitle="MISSION ARCHIVES & WIN RATE TELEMETRY"
      icon={<History className="w-5 h-5" />}
      onClose={onClose}
      maxWidth="max-w-3xl"
    >
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 text-center">
          <div className="text-xs text-slate-400">累計完成任務</div>
          <div className="text-2xl font-bold font-mono text-slate-100 mt-1">
            {totalGames}
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 text-center">
          <div className="text-xs text-slate-400">任務成功次數</div>
          <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">
            {totalWins}
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 text-center">
          <div className="text-xs text-slate-400">特務總勝率</div>
          <div className="text-2xl font-bold font-mono text-amber-400 mt-1">
            {winRate}%
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-10 text-center text-slate-400 text-xs">
          正在讀取加密戰績資料庫...
        </div>
      ) : records.length === 0 ? (
        <div className="py-10 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
          目前尚無歷史戰績紀錄，完成一場單人或多人任務後將自動歸檔。
        </div>
      ) : (
        <div className="space-y-2.5">
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-400">最近 {records.length} 筆任務紀錄</span>
            <button
              onClick={handleClearAll}
              className="flex items-center gap-1.5 text-xs text-rose-400 hover:text-rose-300 transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              清空全部紀錄
            </button>
          </div>
          <div className="divide-y divide-slate-800/80 rounded-xl border border-slate-800 bg-slate-950/60 overflow-hidden">
            {records.map((rec) => (
              <div
                key={rec.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs hover:bg-slate-900/40"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`px-2 py-0.5 rounded font-bold ${
                      rec.playerWon
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    }`}
                  >
                    {rec.playerWon ? '勝利' : '落敗'}
                  </span>
                  <div>
                    <div className="font-semibold text-slate-200">
                      {rec.mode === 'single_spymaster'
                        ? '單人 AI（擔任領袖）'
                        : rec.mode === 'single_operative'
                        ? '單人 AI（擔任隊員）'
                        : rec.mode === 'multiplayer'
                        ? `多人連線 [${rec.roomCode}]`
                        : '戰術練習'}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {new Date(rec.playedAt).toLocaleString('zh-TW')} ・ 身份：
                      {rec.playerTeam === 'red' ? '紅隊' : '藍隊'}
                      {rec.playerRole === 'spymaster' ? '領袖' : '隊員'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-slate-400">
                  <span>
                    勝方：
                    <strong
                      className={
                        rec.winnerTeam === 'red' ? 'text-rose-400' : 'text-sky-400'
                      }
                    >
                      {rec.winnerTeam === 'red' ? '紅隊' : '藍隊'}
                    </strong>
                  </span>
                  <span>翻牌：{rec.totalGuesses} 次</span>
                  <span>耗時：{rec.durationSeconds} 秒</span>
                  <span>AI：{getDifficultyLabel(rec.aiDifficulty)}</span>
                  <button
                    onClick={() => handleDeleteOne(rec.id)}
                    aria-label="刪除此筆紀錄"
                    className="text-slate-500 hover:text-rose-400 transition p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </ModalWrapper>
  );
};

export const AboutModal: React.FC<{
  healthInfo?: {
    wordCount: number;
    geminiEnabled: boolean;
    geminiModel: string;
  };
  onClose: () => void;
}> = ({ healthInfo, onClose }) => {
  return (
    <ModalWrapper
      title="關於《機密代碼：暗線任務》"
      subtitle="CODENAMES: DARKLINE PROTOCOL — AGENCY BRIEFING"
      icon={<Shield className="w-5 h-5" />}
      onClose={onClose}
    >
      <div className="space-y-4 text-xs text-slate-300">
        <p className="leading-relaxed">
          《機密代碼：暗線任務》是一款致敬經典社交推理桌遊 Codenames 的現代情報中心網頁桌遊。採用伺服器唯一權威狀態驗證、即時雙向 Socket.IO 同步，以及「Gemini 結構化推理 + 本機 860+ 繁中代號語意圖譜」雙軌 AI Agent 系統。
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
          <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-2 text-center">
            <img
              src="./assets/art/card-red-agent.png"
              alt="紅方特務檔案"
              className="w-full h-28 object-cover rounded mb-1.5"
            />
            <span className="text-[11px] text-rose-400 font-semibold">紅方特務檔案</span>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-2 text-center">
            <img
              src="./assets/art/card-blue-agent.png"
              alt="藍方特務檔案"
              className="w-full h-28 object-cover rounded mb-1.5"
            />
            <span className="text-[11px] text-sky-400 font-semibold">藍方特務檔案</span>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-2 text-center">
            <img
              src="./assets/art/card-bystander.png"
              alt="中立路人檔案"
              className="w-full h-28 object-cover rounded mb-1.5"
            />
            <span className="text-[11px] text-stone-300 font-semibold">中立路人檔案</span>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-2 text-center">
            <img
              src="./assets/art/card-assassin.png"
              alt="黑名單殺手檔案"
              className="w-full h-28 object-cover rounded mb-1.5"
            />
            <span className="text-[11px] text-amber-400 font-semibold">終局殺手檔案</span>
          </div>
        </div>

        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-amber-300 font-semibold">
            <Sparkles className="w-4 h-4" />
            <span>情報中心系統狀態</span>
          </div>
          <div className="text-slate-300 font-mono text-[11px]">
            內建詞庫：{healthInfo?.wordCount ?? 862} 組繁中代號 ｜ AI 核心：
            {healthInfo?.geminiEnabled
              ? `Gemini (${healthInfo.geminiModel}) + 本機語意圖譜`
              : '本機智慧語意圖譜引擎'}
          </div>
        </div>
      </div>
    </ModalWrapper>
  );
};
