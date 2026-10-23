// ponytail: zero-dependency clean game rules modal matching TV Arena's warm minimalist aesthetic
import React from 'react';

interface LearnToPlayModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LearnToPlayModal({ isOpen, onClose }: LearnToPlayModalProps) {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-[#231e1a]/25 backdrop-blur-[6px] transition-opacity animate-in fade-in"
      onClick={onClose}
    >
      {/* Main Floating 'How to Play' Modal Component */}
      <main
        className="relative z-20 w-full max-w-[560px] bg-white rounded-[28px] border border-[#eae0d5] shadow-[0_20px_45px_-10px_rgba(70,50,40,0.12),0_0_1px_rgba(0,0,0,0.08)] p-6 sm:p-8 text-left transition-all duration-200 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Bar: Close Action */}
        <div className="flex items-center gap-4 mb-3 justify-end">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#65584f] hover:text-[#231e1a] hover:bg-[#faf4ef] transition-colors cursor-pointer border border-transparent hover:border-[#eee4db]"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Editorial Header Section */}
        <header className="mb-6">
          <h1 className="font-serif text-[30px] sm:text-[32px] font-normal text-[#231e1a] leading-tight tracking-tight mt-1">
            Learn to Play TV Arena
          </h1>
          <p className="font-sans text-[#65584f] text-[13.5px] sm:text-[14px] leading-relaxed mt-2">
            Test your television knowledge by predicting which show generated greater 7-day audience engagement.
          </p>
        </header>

        {/* Rule Cards Container */}
        <div className="flex flex-col gap-3 mb-6">
          {/* Card 1: Higher or Lower */}
          <article className="p-3.5 sm:p-4 rounded-2xl bg-[#faf6f2] border border-[#eee4db] transition-colors hover:border-[#e3d5c8]">
            <div className="flex items-start gap-3.5">
              <span className="flex items-center justify-center w-7 h-7 rounded-full bg-[#faede6] text-[#c66a3d] font-serif font-semibold text-[13px] border border-[#f0d5c5] shrink-0">
                1
              </span>
              <div className="flex-1 min-w-0">
                <h2 className="text-[14px] font-semibold text-[#231e1a] mb-1">
                  Higher or Lower?
                </h2>
                <p className="text-[12.5px] text-[#65584f] leading-snug">
                  Compare the <strong className="font-medium text-[#231e1a]">Challenger</strong> on the right against the known <strong className="font-medium text-[#231e1a]">Benchmark</strong> on the left. Guess whether the challenger has a{' '}
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 mx-0.5 rounded-md bg-[#faede6] border border-[#f0d5c5] text-[#c66a3d] font-bold text-[11px]">
                    ▲ Higher
                  </span>{' '}
                  or{' '}
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 mx-0.5 rounded-md bg-[#eaf2ea] border border-[#d2e4d2] text-[#386641] font-bold text-[11px]">
                    ▼ Lower
                  </span>{' '}
                  7-day engagement index.
                </p>
              </div>
            </div>
          </article>

          {/* Card 2: Two Game Modes */}
          <article className="p-3.5 sm:p-4 rounded-2xl bg-[#faf6f2] border border-[#eee4db] transition-colors hover:border-[#e3d5c8]">
            <div className="flex items-start gap-3.5">
              <span className="flex items-center justify-center w-7 h-7 rounded-full bg-[#faede6] text-[#c66a3d] font-serif font-semibold text-[13px] border border-[#f0d5c5] shrink-0">
                2
              </span>
              <div className="flex-1 min-w-0">
                <h2 className="text-[14px] font-semibold text-[#231e1a] mb-2">
                  Two Distinct Game Modes
                </h2>
                <div className="flex flex-col gap-2">
                  <div className="text-[12.5px] text-[#65584f] leading-snug">
                    <span className="font-semibold text-[#231e1a]">Endless Streak:</span> Sudden death. Each correct guess adds to your streak. One wrong guess concludes the run. Confetti bursts every 5-streak milestone!
                  </div>
                  <div className="text-[12.5px] text-[#65584f] leading-snug">
                    <span className="font-semibold text-[#231e1a]">Daily Run 🎯:</span> A daily 10-match seeded challenge refreshed every day at midnight UTC. All players worldwide face the exact same pairings.
                  </div>
                </div>
              </div>
            </div>
          </article>

          {/* Card 3: 2x Nailbiter Multipliers */}
          <article className="p-3.5 sm:p-4 rounded-2xl bg-[#faf6f2] border border-[#eee4db] transition-colors hover:border-[#e3d5c8]">
            <div className="flex items-start gap-3.5">
              <span className="flex items-center justify-center w-7 h-7 rounded-full bg-[#fdf5e8] text-[#c07a1b] font-medium text-[14px] border border-[#f5e3be] shrink-0">
                ⚡
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                  <h2 className="text-[14px] font-semibold text-[#231e1a]">
                    2x Nailbiter Multipliers
                  </h2>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#fff6e6] border border-[#f9dfad] text-[#b36b00] text-[10.5px] font-bold tracking-wide">
                    ⚡ 2x Nailbiter
                  </span>
                </div>
                <p className="text-[12.5px] text-[#65584f] leading-snug">
                  When two contenders have engagement scores within an <strong className="font-medium text-[#231e1a]">8% margin</strong>, a pulsing{' '}
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-[#fdf2df] text-[#a46404] font-semibold text-[11px] border border-[#f4dec0]">
                    ⚡ 2x Nailbiter
                  </span>{' '}
                  badge appears—awarding double points (+2 pts) on a correct guess!
                </p>
              </div>
            </div>
          </article>

          {/* Card 4: Themed Category Decks */}
          <article className="p-3.5 sm:p-4 rounded-2xl bg-[#faf6f2] border border-[#eee4db] transition-colors hover:border-[#e3d5c8]">
            <div className="flex items-start gap-3.5">
              <span className="flex items-center justify-center w-7 h-7 rounded-full bg-[#faede6] text-[#c66a3d] font-serif font-semibold text-[13px] border border-[#f0d5c5] shrink-0">
                3
              </span>
              <div className="flex-1 min-w-0">
                <h2 className="text-[14px] font-semibold text-[#231e1a] mb-1">
                  Themed Category Decks
                </h2>
                <p className="text-[12.5px] text-[#65584f] leading-snug mb-2.5">
                  Use the top-right category filters to test your knowledge across All shows, Streaming Originals, Classics, or Sci-Fi.
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="px-2.5 py-1 rounded-md bg-[#c66a3d] text-white text-[11px] font-semibold shadow-xs">
                    All Shows
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-white hover:bg-[#faede6] text-[#65584f] hover:text-[#231e1a] border border-[#eee4db] text-[11px] font-medium transition-colors">
                    Streaming Originals
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-white hover:bg-[#faede6] text-[#65584f] hover:text-[#231e1a] border border-[#eee4db] text-[11px] font-medium transition-colors">
                    Classics
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-white hover:bg-[#faede6] text-[#65584f] hover:text-[#231e1a] border border-[#eee4db] text-[11px] font-medium transition-colors">
                    Sci-Fi
                  </span>
                </div>
              </div>
            </div>
          </article>
        </div>

        {/* Modal Footer Section */}
        <footer className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
          <p className="text-[11.5px] text-[#8c7e75] tracking-tight text-center sm:text-left">
            Powered by genuine Wikipedia &amp; TMDB telemetry
          </p>
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-[#c66a3d] hover:bg-[#b25b30] text-white text-[13.5px] font-semibold tracking-wide shadow-md shadow-[#c66a3d]/25 hover:shadow-lg transition-all duration-150 active:scale-[0.98] cursor-pointer"
          >
            <span>Let's Play</span>
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </footer>
      </main>
    </div>
  );
}
