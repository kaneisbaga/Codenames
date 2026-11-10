import React from 'react';
import { motion } from 'framer-motion';
import { Bookmark, Crosshair, ShieldAlert, UserCheck, Users } from 'lucide-react';
import {
  CardType,
  ClientBoardCard,
  Team,
  UserSettings,
} from '../../shared/types';

interface BoardGridProps {
  board: ClientBoardCard[];
  viewerIsSpymaster: boolean;
  showSpymasterKey: boolean;
  canGuess: boolean;
  canMark: boolean;
  reducedMotion: boolean;
  cardSize: UserSettings['cardSize'];
  fontSize: UserSettings['fontSize'];
  onCardClick: (index: number) => void;
  onToggleMark: (index: number, e: React.MouseEvent) => void;
}

const CARD_ART_MAP: Record<CardType, string> = {
  red: './assets/art/card-red-agent.png',
  blue: './assets/art/card-blue-agent.png',
  bystander: './assets/art/card-bystander.png',
  assassin: './assets/art/card-assassin.png',
};

const FACTION_LABEL_MAP: Record<CardType, string> = {
  red: '紅方特務',
  blue: '藍方特務',
  bystander: '中立路人',
  assassin: '終局殺手',
};

export const BoardGrid: React.FC<BoardGridProps> = ({
  board,
  viewerIsSpymaster,
  showSpymasterKey,
  canGuess,
  canMark,
  reducedMotion,
  cardSize,
  fontSize,
  onCardClick,
  onToggleMark,
}) => {
  const heightClass =
    cardSize === 'compact'
      ? 'h-16 sm:h-20 md:h-24'
      : cardSize === 'large'
      ? 'h-20 sm:h-28 md:h-32'
      : 'h-[4.4rem] sm:h-24 md:h-28';

  const getWordFontSizeClass = (word: string) => {
    const len = word.length;
    if (fontSize === 'xlarge') {
      return len >= 4
        ? 'text-xs sm:text-base md:text-xl'
        : len === 3
        ? 'text-sm sm:text-lg md:text-2xl'
        : 'text-base sm:text-xl md:text-2xl';
    }
    if (fontSize === 'large') {
      return len >= 4
        ? 'text-[11px] sm:text-sm md:text-lg'
        : len === 3
        ? 'text-xs sm:text-base md:text-xl'
        : 'text-sm sm:text-lg md:text-xl';
    }
    return len >= 4
      ? 'text-[11px] sm:text-sm md:text-base'
      : len === 3
      ? 'text-xs sm:text-base md:text-lg'
      : 'text-xs sm:text-base md:text-xl';
  };

  const getSpymasterUnrevealedStyle = (type?: CardType) => {
    if (!viewerIsSpymaster || !showSpymasterKey || !type) {
      return 'border-slate-700/80 bg-gradient-to-b from-[#111a2e] to-[#0b1220] hover:border-amber-400/60';
    }
    switch (type) {
      case 'red':
        return 'border-rose-500/80 bg-gradient-to-b from-rose-950/80 via-[#1a0f18] to-[#110a10] shadow-[inset_0_0_18px_rgba(244,63,94,0.18)]';
      case 'blue':
        return 'border-sky-500/80 bg-gradient-to-b from-sky-950/80 via-[#0e192d] to-[#09101d] shadow-[inset_0_0_18px_rgba(56,189,248,0.18)]';
      case 'bystander':
        return 'border-stone-500/50 bg-gradient-to-b from-stone-900/60 to-[#0e1218]';
      case 'assassin':
        return 'border-amber-400 bg-gradient-to-b from-zinc-950 via-red-950/60 to-black ring-1 ring-amber-400/50 shadow-[inset_0_0_22px_rgba(245,158,11,0.28)]';
    }
  };

  const getRevealedCardStyle = (type?: CardType) => {
    switch (type) {
      case 'red':
        return 'border-rose-500 bg-rose-950/90 shadow-lg shadow-rose-950/50';
      case 'blue':
        return 'border-sky-500 bg-sky-950/90 shadow-lg shadow-sky-950/50';
      case 'bystander':
        return 'border-stone-500/70 bg-stone-900/90';
      case 'assassin':
        return 'border-amber-500 bg-black ring-2 ring-rose-600/80 shadow-xl shadow-rose-950/80';
      default:
        return 'border-slate-700 bg-slate-900';
    }
  };

  return (
    <div
      data-testid="codenames-board-grid"
      className="grid grid-cols-5 gap-1.5 sm:gap-2.5 md:gap-3 w-full max-w-5xl mx-auto select-none"
    >
      {board.map((card) => {
        const isRevealed = card.revealed;
        const serialNum = String(card.index + 1).padStart(2, '0');
        const showSecretBadge =
          !isRevealed && viewerIsSpymaster && showSpymasterKey && card.type;

        return (
          <motion.div
            key={`${card.index}-${isRevealed ? 'rev' : 'unrev'}`}
            data-testid={`board-card-${card.index}`}
            data-word={card.word}
            data-revealed={isRevealed ? 'true' : 'false'}
            initial={
              isRevealed && !reducedMotion
                ? { rotateY: 85, scale: 0.96, opacity: 0.6 }
                : false
            }
            animate={{ rotateY: 0, scale: 1, opacity: 1 }}
            whileHover={
              !isRevealed && canGuess && !reducedMotion ? { y: -2, scale: 1.015 } : {}
            }
            transition={{ duration: reducedMotion ? 0 : 0.32, ease: 'easeOut' }}
            onClick={() => {
              if (!isRevealed && canGuess) {
                onCardClick(card.index);
              }
            }}
            className={`relative rounded-lg sm:rounded-xl border transition-colors ${heightClass} ${
              isRevealed
                ? getRevealedCardStyle(card.type)
                : getSpymasterUnrevealedStyle(card.type)
            } ${
              !isRevealed && canGuess
                ? 'cursor-pointer hover:shadow-md hover:shadow-amber-500/10'
                : 'cursor-default'
            } overflow-hidden`}
          >
            {!isRevealed ? (
              /* UNREVEALED DOSSIER CARD FACE */
              <div className="relative w-full h-full flex flex-col justify-between p-1.5 sm:p-2.5">
                {/* Top Meta Row: Serial Code + Spymaster Indicator / Operative Mark Button */}
                <div className="flex items-center justify-between gap-1 z-10">
                  <span className="text-[9px] sm:text-[10px] font-mono tracking-wider text-slate-500">
                    #{serialNum}
                  </span>

                  <div className="flex items-center gap-1">
                    {showSecretBadge && (
                      <span
                        data-testid={`spymaster-badge-${card.index}`}
                        className={`px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-bold tracking-tight flex items-center gap-0.5 ${
                          card.type === 'red'
                            ? 'bg-rose-500/25 text-rose-300 border border-rose-500/40'
                            : card.type === 'blue'
                            ? 'bg-sky-500/25 text-sky-300 border border-sky-500/40'
                            : card.type === 'assassin'
                            ? 'bg-amber-500/30 text-amber-200 border border-amber-400'
                            : 'bg-stone-500/20 text-stone-300 border border-stone-500/30'
                        }`}
                      >
                        {card.type === 'assassin' && (
                          <ShieldAlert className="w-2.5 h-2.5 text-amber-300" />
                        )}
                        <span className="hidden sm:inline">
                          {FACTION_LABEL_MAP[card.type!]}
                        </span>
                        <span className="sm:hidden">
                          {card.type === 'red'
                            ? '紅'
                            : card.type === 'blue'
                            ? '藍'
                            : card.type === 'assassin'
                            ? '殺'
                            : '路'}
                        </span>
                      </span>
                    )}

                    {canMark && (
                      <button
                        type="button"
                        onClick={(e) => onToggleMark(card.index, e)}
                        title="標記為候選代號"
                        className={`p-0.5 sm:p-1 rounded transition ${
                          card.marks.length > 0
                            ? 'bg-amber-500/30 text-amber-300'
                            : 'text-slate-500 hover:text-amber-300 hover:bg-slate-800/70'
                        }`}
                      >
                        <Bookmark className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Center Codename Typography */}
                <div className="flex-1 flex items-center justify-center text-center px-0.5">
                  <span
                    className={`font-bold tracking-wide leading-tight break-keep ${getWordFontSizeClass(
                      card.word
                    )} ${
                      showSecretBadge && card.type === 'red'
                        ? 'text-rose-100'
                        : showSecretBadge && card.type === 'blue'
                        ? 'text-sky-100'
                        : showSecretBadge && card.type === 'assassin'
                        ? 'text-amber-300'
                        : 'text-slate-100'
                    }`}
                  >
                    {card.word}
                  </span>
                </div>

                {/* Bottom Subtle Dossier Line & Candidate Marks */}
                <div className="flex items-center justify-between text-[9px] text-slate-500 min-h-[12px]">
                  <span className="hidden md:inline text-[9px] text-slate-500/80 truncate">
                    {card.category}
                  </span>
                  {card.marks.length > 0 && (
                    <div className="flex items-center gap-0.5 text-amber-400 font-semibold truncate ml-auto">
                      <Crosshair className="w-2.5 h-2.5 shrink-0" />
                      <span className="truncate max-w-[60px] sm:max-w-[90px]">
                        {card.marks.join(', ')}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* REVEALED CARD FACE WITH BESPOKE GENERATIVE AI DOSSIER ARTWORK */
              <div className="relative w-full h-full flex flex-col justify-end overflow-hidden">
                {card.type && (
                  <img
                    src={CARD_ART_MAP[card.type]}
                    alt={FACTION_LABEL_MAP[card.type]}
                    className="absolute inset-0 w-full h-full object-cover object-top opacity-90"
                  />
                )}
                <div
                  className={`absolute inset-0 bg-gradient-to-t ${
                    card.type === 'red'
                      ? 'from-rose-950/95 via-rose-950/35 to-transparent'
                      : card.type === 'blue'
                      ? 'from-sky-950/95 via-sky-950/35 to-transparent'
                      : card.type === 'assassin'
                      ? 'from-black/95 via-red-950/50 to-transparent'
                      : 'from-stone-950/95 via-stone-900/40 to-transparent'
                  }`}
                />

                {/* Top Faction Pill */}
                <div className="relative z-10 p-1 sm:p-2 mb-auto flex justify-between items-center">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[8px] sm:text-[10px] font-bold tracking-wider uppercase ${
                      card.type === 'red'
                        ? 'bg-rose-600/90 text-white'
                        : card.type === 'blue'
                        ? 'bg-sky-600/90 text-white'
                        : card.type === 'assassin'
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-stone-700/90 text-stone-200'
                    }`}
                  >
                    {card.type ? FACTION_LABEL_MAP[card.type] : '已揭曉'}
                  </span>
                </div>

                {/* Bottom Glassmorphic Codename Nameplate */}
                <div className="relative z-10 px-1.5 py-1 sm:px-2.5 sm:py-1.5 bg-black/65 backdrop-blur-xs border-t border-white/10 flex items-center justify-between">
                  <span className="font-bold text-[11px] sm:text-sm text-white truncate">
                    {card.word}
                  </span>
                  {card.type === 'red' || card.type === 'blue' ? (
                    <UserCheck className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-white/80 shrink-0 hidden sm:inline" />
                  ) : card.type === 'assassin' ? (
                    <ShieldAlert className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-400 shrink-0 hidden sm:inline" />
                  ) : (
                    <Users className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-stone-300 shrink-0 hidden sm:inline" />
                  )}
                </div>
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
};
