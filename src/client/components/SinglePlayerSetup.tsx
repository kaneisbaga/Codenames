import React, { useState } from 'react';
import {
  ArrowLeft,
  Bot,
  BrainCircuit,
  Crosshair,
  Eye,
  Play,
  Shield,
  Sparkles,
} from 'lucide-react';
import {
  AIDifficulty,
  AIPersonality,
  PlayerRole,
  Team,
} from '../../shared/types';

interface SinglePlayerSetupProps {
  defaultDifficulty: AIDifficulty;
  defaultPersonality: AIPersonality;
  onStartSinglePlayer: (params: {
    role: PlayerRole;
    team: Team;
    aiDifficulty: AIDifficulty;
    aiPersonality: AIPersonality;
  }) => Promise<void>;
  onBack: () => void;
}

export const SinglePlayerSetup: React.FC<SinglePlayerSetupProps> = ({
  defaultDifficulty,
  defaultPersonality,
  onStartSinglePlayer,
  onBack,
}) => {
  const [role, setRole] = useState<PlayerRole>('operative');
  const [team, setTeam] = useState<Team>('red');
  const [difficulty, setDifficulty] = useState<AIDifficulty>(defaultDifficulty);
  const [personality, setPersonality] = useState<AIPersonality>(defaultPersonality);
  const [starting, setStarting] = useState(false);

  const handleLaunch = async () => {
    if (starting) return;
    setStarting(true);
    try {
      await onStartSinglePlayer({
        role,
        team,
        aiDifficulty: difficulty,
        aiPersonality: personality,
      });
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-3xl rounded-2xl border border-amber-500/30 bg-[#0b1220]/95 p-6 sm:p-8 shadow-2xl space-y-6">
        <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
          <button
            type="button"
            onClick={onBack}
            className="rounded-xl border border-slate-700 bg-slate-900 p-2 text-slate-300 hover:text-amber-300 transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-lg sm:text-xl font-black tracking-wider text-white">
              單人 AI 特務對戰配置
            </h1>
            <p className="text-xs text-slate-400">
              選擇你的行動職位與陣營，AI 將自動擔任隊友與敵方陣營完整進行對局
            </p>
          </div>
        </div>

        {/* Step 1: Select Role */}
        <div className="space-y-2.5">
          <label className="block text-xs font-bold uppercase tracking-wider text-amber-400">
            1. 選擇你的行動職位
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <button
              type="button"
              data-testid="select-role-operative"
              onClick={() => setRole('operative')}
              className={`text-left rounded-xl border p-4 transition space-y-2 ${
                role === 'operative'
                  ? 'border-amber-400 bg-amber-500/15 shadow-lg shadow-amber-500/10'
                  : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-white flex items-center gap-2">
                  <Crosshair className="w-4 h-4 text-amber-400" />
                  玩法 A：擔任間諜隊員 (Operative)
                </span>
                {role === 'operative' && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500 text-slate-950 font-bold">
                    已選取
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                由 AI 擔任你的間諜領袖並提供線索與數字；你負責從 25 張代號中推理並翻開己方特務。
              </p>
            </button>

            <button
              type="button"
              data-testid="select-role-spymaster"
              onClick={() => setRole('spymaster')}
              className={`text-left rounded-xl border p-4 transition space-y-2 ${
                role === 'spymaster'
                  ? 'border-amber-400 bg-amber-500/15 shadow-lg shadow-amber-500/10'
                  : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-white flex items-center gap-2">
                  <Eye className="w-4 h-4 text-amber-400" />
                  玩法 B：擔任間諜領袖 (Spymaster)
                </span>
                {role === 'spymaster' && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500 text-slate-950 font-bold">
                    已選取
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                你掌握完整秘密關鍵名單並輸入線索與數量；由 AI 隊員根據你的線索進行語意推理與翻牌，並可觀看 AI 思考摘要。
              </p>
            </button>
          </div>
        </div>

        {/* Step 2: Select Team */}
        <div className="space-y-2.5">
          <label className="block text-xs font-bold uppercase tracking-wider text-amber-400">
            2. 選擇所屬情報陣營
          </label>
          <div className="grid grid-cols-2 gap-3.5">
            <button
              type="button"
              data-testid="select-team-red"
              onClick={() => setTeam('red')}
              className={`rounded-xl border p-3.5 flex items-center justify-between transition ${
                team === 'red'
                  ? 'border-rose-500 bg-rose-950/60 text-rose-100'
                  : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-full bg-rose-500" />
                <span className="font-bold text-sm">紅方特務陣營 (RED)</span>
              </div>
              <span className="text-xs opacity-80">先攻 9 名特務</span>
            </button>

            <button
              type="button"
              data-testid="select-team-blue"
              onClick={() => setTeam('blue')}
              className={`rounded-xl border p-3.5 flex items-center justify-between transition ${
                team === 'blue'
                  ? 'border-sky-500 bg-sky-950/60 text-sky-100'
                  : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-full bg-sky-500" />
                <span className="font-bold text-sm">藍方特務陣營 (BLUE)</span>
              </div>
              <span className="text-xs opacity-80">先攻 9 名特務</span>
            </button>
          </div>
        </div>

        {/* Step 3: Select AI Difficulty & Personality */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-amber-400">
              3. AI 推理難度
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'easy', label: '簡單', desc: '直覺保守' },
                  { id: 'normal', label: '普通', desc: '多詞聯想' },
                  { id: 'hard', label: '困難', desc: '深層策略' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`select-difficulty-${item.id}`}
                  onClick={() => setDifficulty(item.id)}
                  className={`rounded-xl border p-2.5 text-center transition ${
                    difficulty === item.id
                      ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                      : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="font-bold text-xs">{item.label}</div>
                  <div className="text-[10px] opacity-75 mt-0.5">{item.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-amber-400">
              4. AI 決策個性
            </label>
            <select
              data-testid="select-ai-personality"
              value={personality}
              onChange={(e) => setPersonality(e.target.value as AIPersonality)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-xs font-semibold text-slate-100 focus:border-amber-400 focus:outline-none"
            >
              <option value="analytical">分析型 — 精算敵我信噪比，追求最高勝率</option>
              <option value="cautious">穩健型 — 極力迴避殺手與敵方風險，見好就收</option>
              <option value="associative">聯想型 — 擅長跨類別概念連結與抽象推理</option>
              <option value="intuitive">直覺型 — 偏好鮮明具體的生活與自然意象</option>
              <option value="risky">冒險型 — 積極嘗試大數量線索與 N+1 額外追猜</option>
            </select>
          </div>
        </div>

        <div className="pt-2 flex justify-end gap-3">
          <button
            type="button"
            onClick={onBack}
            className="rounded-xl border border-slate-700 px-5 py-3 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition"
          >
            返回首頁
          </button>
          <button
            type="button"
            data-testid="launch-single-player-btn"
            onClick={() => void handleLaunch()}
            disabled={starting}
            className="rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 px-7 py-3 text-sm font-black text-slate-950 flex items-center gap-2 shadow-lg shadow-amber-500/20 transition"
          >
            <Play className="w-4 h-4 fill-current" />
            {starting ? '正在建立加密戰局...' : '立即展開單人任務'}
          </button>
        </div>
      </div>
    </div>
  );
};
