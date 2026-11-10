import React from 'react';
import { motion } from 'framer-motion';
import {
  BookOpen,
  Bot,
  Compass,
  History,
  Info,
  Settings,
  Users,
} from 'lucide-react';

interface HomeScreenProps {
  onSelectSinglePlayer: () => void;
  onSelectMultiplayer: () => void;
  onSelectPractice: () => void;
  onOpenHistory: () => void;
  onOpenSettings: () => void;
  onOpenRules: () => void;
  onOpenAbout: () => void;
  reducedMotion: boolean;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  onSelectSinglePlayer,
  onSelectMultiplayer,
  onSelectPractice,
  onOpenHistory,
  onOpenSettings,
  onOpenRules,
  onOpenAbout,
  reducedMotion,
}) => {
  return (
    <div
      className="min-h-screen flex flex-col justify-between bg-[#070b12] text-slate-100 relative overflow-hidden select-none"
      style={{
        backgroundImage: `radial-gradient(circle at 50% 35%, rgba(15, 23, 42, 0.55), rgba(7, 11, 18, 0.96)), url('./assets/art/bg-command-center.png')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Subtle Top Utility Bar (Compact & Tucked Away) */}
      <header className="w-full max-w-6xl mx-auto px-6 py-5 flex items-center justify-between z-10">
        <div className="flex items-center gap-2 text-[11px] font-mono tracking-[0.25em] text-amber-400/80 uppercase">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <span>DIRECTORATE OF CLASSIFIED INTELLIGENCE</span>
        </div>

        <nav className="flex items-center gap-2">
          <button
            type="button"
            data-testid="home-history-btn"
            onClick={onOpenHistory}
            className="flex items-center gap-1.5 rounded-lg border border-slate-800/90 bg-slate-950/70 px-3 py-1.5 text-xs text-slate-300 hover:border-amber-500/40 hover:text-amber-300 transition"
          >
            <History className="w-3.5 h-3.5" />
            <span>遊戲紀錄</span>
          </button>

          <button
            type="button"
            data-testid="home-settings-btn"
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 rounded-lg border border-slate-800/90 bg-slate-950/70 px-3 py-1.5 text-xs text-slate-300 hover:border-amber-500/40 hover:text-amber-300 transition"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>設定</span>
          </button>

          <button
            type="button"
            data-testid="home-rules-btn"
            onClick={onOpenRules}
            className="flex items-center gap-1.5 rounded-lg border border-slate-800/90 bg-slate-950/70 px-3 py-1.5 text-xs text-slate-300 hover:border-amber-500/40 hover:text-amber-300 transition"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>遊戲規則</span>
          </button>

          <button
            type="button"
            data-testid="home-about-btn"
            onClick={onOpenAbout}
            className="flex items-center gap-1.5 rounded-lg border border-slate-800/90 bg-slate-950/70 px-3 py-1.5 text-xs text-slate-300 hover:border-amber-500/40 hover:text-amber-300 transition"
          >
            <Info className="w-3.5 h-3.5" />
            <span>關於</span>
          </button>
        </nav>
      </header>

      {/* Centerpiece: Original Brand Emblem & Typography Logo + 3 Primary Buttons */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-8 z-10">
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center text-center max-w-xl w-full space-y-8"
        >
          {/* Generative AI Luxury Agency Crest */}
          <div className="relative">
            <div className="absolute -inset-4 rounded-full bg-amber-500/10 blur-2xl pointer-events-none" />
            <img
              src="./assets/art/agency-crest.png"
              alt="機密代碼：暗線任務 徽章"
              className="relative w-28 h-28 sm:w-36 sm:h-36 rounded-full border border-amber-500/40 shadow-2xl object-cover"
            />
          </div>

          {/* Original Minimalist Typography Mark */}
          <div className="space-y-2.5">
            <div className="text-[11px] sm:text-xs font-mono tracking-[0.38em] text-amber-400/90 uppercase">
              CODENAMES : DARKLINE PROTOCOL
            </div>
            <h1 className="text-3xl sm:text-5xl font-black tracking-[0.14em] text-white">
              機密代碼：暗線任務
            </h1>
            <div className="w-24 h-[1px] bg-gradient-to-r from-transparent via-amber-500/60 to-transparent mx-auto" />
          </div>

          {/* Three Primary Entry Buttons */}
          <div className="w-full max-w-sm space-y-3.5 pt-2">
            <button
              type="button"
              data-testid="home-single-player-btn"
              onClick={onSelectSinglePlayer}
              className="group w-full rounded-2xl border border-amber-500/50 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 px-6 py-4 text-slate-950 font-black text-base tracking-widest shadow-xl shadow-amber-500/15 hover:brightness-105 transition flex items-center justify-between"
            >
              <span className="flex items-center gap-3">
                <Bot className="w-5 h-5" />
                【單人 AI 對戰】
              </span>
              <span className="text-xs font-mono opacity-80 group-hover:translate-x-1 transition-transform">
                SOLO OPS →
              </span>
            </button>

            <button
              type="button"
              data-testid="home-multiplayer-btn"
              onClick={onSelectMultiplayer}
              className="group w-full rounded-2xl border border-slate-700/90 bg-[#0d1526]/90 hover:border-amber-400/60 hover:bg-[#111c33] px-6 py-4 text-slate-100 font-bold text-base tracking-widest shadow-lg transition flex items-center justify-between"
            >
              <span className="flex items-center gap-3">
                <Users className="w-5 h-5 text-sky-400" />
                【多人連線】
              </span>
              <span className="text-xs font-mono text-slate-400 group-hover:text-amber-300 group-hover:translate-x-1 transition-all">
                NETWORK →
              </span>
            </button>

            <button
              type="button"
              data-testid="home-practice-btn"
              onClick={onSelectPractice}
              className="group w-full rounded-2xl border border-slate-800 bg-[#0a101d]/80 hover:border-amber-400/50 hover:bg-[#0e1729] px-6 py-4 text-slate-200 font-bold text-base tracking-widest transition flex items-center justify-between"
            >
              <span className="flex items-center gap-3">
                <Compass className="w-5 h-5 text-amber-400" />
                【練習模式】
              </span>
              <span className="text-xs font-mono text-slate-500 group-hover:text-amber-300 group-hover:translate-x-1 transition-all">
                ACADEMY →
              </span>
            </button>
          </div>
        </motion.div>
      </main>

      {/* Subtle Footer */}
      <footer className="w-full max-w-6xl mx-auto px-6 py-4 flex items-center justify-between text-[11px] text-slate-500 z-10">
        <span>CLASSIFIED BOARD GAME SYSTEM</span>
        <span className="font-mono">5×5 TACTICAL GRID ・ REAL-TIME SOCKET SYNC</span>
      </footer>
    </div>
  );
};
