import React, { useState } from 'react';

interface GameOverModalProps {
  isOpen: boolean;
  streak: number;
  bestStreak: number;
  knownTitle: string;
  challengerTitle: string;
  knownScore?: number;
  challengerScore?: number;
  guessHistory?: boolean[];
  onPlayAgain: () => void;
  onClose: () => void;
  onViewLeaderboard?: () => void;
}

export function GameOverModal({
  isOpen,
  streak,
  bestStreak,
  knownTitle,
  challengerTitle,
  knownScore,
  challengerScore,
  guessHistory = [],
  onPlayAgain,
  onClose,
  onViewLeaderboard,
}: GameOverModalProps) {
  const [copied, setCopied] = useState(false);
  const [showFormula, setShowFormula] = useState(false);

  if (!isOpen) return null;

  // Calculate actual missed margin if telemetry scores are provided
  const diff =
    typeof knownScore === 'number' && typeof challengerScore === 'number'
      ? Math.abs(challengerScore - knownScore)
      : null;

  // Generate Wordle-style emoji grid preview
  const emojiGrid =
    guessHistory && guessHistory.length > 0
      ? guessHistory.map((g) => (g ? '🟩' : '🟥')).join('')
      : '🟥';

  const shareText = `TV Arena 📺🔥\nStreak: ${streak} pts!\nFell on ${knownTitle} vs ${challengerTitle}\n${emojiGrid}\nhttps://tv-arena.pages.dev`;

  const handleShare = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // fallback
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-[#2b2320]/20 backdrop-blur-[6px] transition-opacity"
      onClick={onClose}
    >
      {/* Standalone Game Over Modal Card Component */}
      <main
        className="relative z-10 w-full max-w-[420px] bg-white rounded-[28px] border border-arena-border/90 shadow-modal overflow-hidden p-8 sm:p-9 text-center transition-all duration-300 animate-in fade-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Close Action */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          className="absolute top-6 right-6 w-8 h-8 rounded-full flex items-center justify-center text-arena-faint hover:text-arena-ink hover:bg-arena-subtle transition-colors focus:outline-none focus:ring-2 focus:ring-arena-terracotta/30"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Title in Editorial Serif */}
        <h1 className="font-serif text-[32px] leading-tight font-medium tracking-tight text-arena-ink mb-2">
          Run Ended
        </h1>

        {/* Fall context statement */}
        <p className="text-[13.5px] text-arena-muted font-normal leading-relaxed mb-7 max-w-[290px] mx-auto">
          Fell on <span className="font-medium text-arena-ink">{knownTitle}</span> vs{' '}
          <span className="font-medium text-arena-ink">{challengerTitle}</span>
        </p>

        {/* Stats Matrix Card */}
        <div className="grid grid-cols-2 gap-3 p-2 bg-[#fcfaf7] rounded-2xl border border-arena-border/70 mb-7">
          {/* Final Streak Stat */}
          <div className="bg-white rounded-xl py-4 px-3 border border-arena-border/50 shadow-pill flex flex-col items-center">
            <span className="text-[10.5px] font-semibold uppercase tracking-wider text-arena-faint mb-1">
              Final Streak
            </span>
            <div className="flex items-baseline gap-1">
              <span className="font-serif text-3xl font-semibold text-arena-ink">{streak}</span>
              <span className="text-xs text-arena-faint">pts</span>
            </div>
          </div>

          {/* All-Time Best Stat */}
          <div className="bg-white rounded-xl py-4 px-3 border border-arena-border/50 shadow-pill flex flex-col items-center relative overflow-hidden">
            <span className="text-[10.5px] font-semibold uppercase tracking-wider text-arena-faint mb-1">
              All-Time Best
            </span>
            <div className="flex items-baseline gap-1">
              <span className="font-serif text-3xl font-semibold text-arena-terracotta">
                {bestStreak}
              </span>
              <span className="text-xs text-arena-terracotta/70 font-medium">pts</span>
            </div>
          </div>
        </div>

        {/* Mini Progress / Run Summary Indicator */}
        <div className="flex items-center justify-center mb-7">
          <span className="text-[12px] text-arena-muted font-medium">
            {diff !== null
              ? `Missed by ${diff.toLocaleString()} viewership index`
              : 'Telemetry variance decided the match'}
          </span>
        </div>

        {/* Action Group: Primary Terracotta Play Again + Clean Share Result */}
        <div className="space-y-2.5">
          {/* Primary Action */}
          <button
            type="button"
            onClick={onPlayAgain}
            className="w-full py-3.5 px-6 rounded-xl bg-arena-terracotta hover:bg-arena-terracottaHover text-white font-medium text-[14.5px] shadow-sm transition-all duration-150 transform active:scale-[0.99] flex items-center justify-center gap-2 group cursor-pointer"
          >
            <svg
              className="w-4 h-4 text-white/90 group-hover:rotate-180 transition-transform duration-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Play Again
          </button>

          {/* Secondary Action */}
          <button
            type="button"
            onClick={handleShare}
            className="w-full py-3.5 px-6 rounded-xl bg-arena-subtle hover:bg-[#f3eae0] border border-arena-border text-arena-ink font-medium text-[14.5px] transition-all duration-150 active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer"
          >
            {copied ? (
              <span className="text-emerald-700 font-semibold flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Copied to Clipboard!
              </span>
            ) : (
              <>
                <svg
                  className="w-4 h-4 text-arena-muted"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                  />
                </svg>
                Share Result
              </>
            )}
          </button>
        </div>

        {/* Understated Footer Links */}
        <div className="mt-6 pt-5 border-t border-arena-border/50 flex flex-col items-center gap-2 text-[12px] text-arena-faint">
          <div className="flex items-center justify-center gap-4">
            {onViewLeaderboard ? (
              <button
                type="button"
                onClick={onViewLeaderboard}
                className="hover:text-arena-terracotta transition-colors cursor-pointer"
              >
                View Leaderboard
              </button>
            ) : (
              <span className="text-arena-faint">TV Arena Trivia</span>
            )}
            <span>&middot;</span>
            <button
              type="button"
              onClick={() => setShowFormula((prev) => !prev)}
              className="hover:text-arena-terracotta transition-colors cursor-pointer"
            >
              How streak is computed
            </button>
          </div>

          {showFormula && (
            <p className="text-[11px] text-arena-muted bg-[#fcfaf7] p-2 rounded-lg border border-arena-border/60 max-w-xs mt-1 animate-in fade-in">
              Each correct Higher/Lower guess adds 1 pt to your streak. A single miss concludes the run.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
