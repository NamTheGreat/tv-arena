import React from 'react';

interface MethodologyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MethodologyModal({ isOpen, onClose }: MethodologyModalProps) {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-arena-surface border border-arena-border rounded-3xl p-6 sm:p-8 shadow-soft-card flex flex-col relative text-left"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-arena-muted hover:text-arena-charcoal text-xl leading-none transition-colors"
          aria-label="Close modal"
        >
          ×
        </button>

        <div className="flex items-center gap-2 mb-3">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[11px] font-semibold tracking-wider text-arena-terracotta uppercase">
            Platform Intelligence Framework
          </span>
        </div>

        <h2 className="text-2xl font-serif font-bold text-stone-900 tracking-tight mb-2">
          7-Day Engagement Index Methodology
        </h2>

        <p className="text-xs sm:text-sm text-stone-600 leading-relaxed mb-6">
          TV Arena ranks and compares television shows by synthesizing multi-dimensional viewer engagement signals into an empirical 7-day rolling score.
        </p>

        <div className="space-y-4 text-xs sm:text-sm text-stone-700">
          <div className="bg-white border border-arena-border/80 rounded-2xl p-4 space-y-1.5">
            <h3 className="font-semibold text-stone-900 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-arena-border/50 text-arena-terracotta text-xs flex items-center justify-center font-bold">
                1
              </span>
              <span>Organic Audience Curiosity (Wikimedia Telemetry)</span>
            </h3>
            <p className="text-stone-500 text-xs pl-7 leading-relaxed">
              Daily Wikipedia article pageviews measure proactive audience interest, episode recap lookups, and organic search momentum across regions.
            </p>
          </div>

          <div className="bg-white border border-arena-border/80 rounded-2xl p-4 space-y-1.5">
            <h3 className="font-semibold text-stone-900 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-arena-border/50 text-arena-terracotta text-xs flex items-center justify-center font-bold">
                2
              </span>
              <span>Global Streaming Velocity (TMDB Trend Analytics)</span>
            </h3>
            <p className="text-stone-500 text-xs pl-7 leading-relaxed">
              Global catalog popularity and watch interest indices capture streaming availability, weekly release buzz, and user ratings.
            </p>
          </div>

          <div className="bg-white border border-arena-border/80 rounded-2xl p-4 space-y-1.5">
            <h3 className="font-semibold text-stone-900 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-arena-border/50 text-arena-terracotta text-xs flex items-center justify-center font-bold">
                3
              </span>
              <span>Supabase Telemetry Pipeline</span>
            </h3>
            <p className="text-stone-500 text-xs pl-7 leading-relaxed">
              Daily telemetry rows are continuously persisted and queried without synthesized or mocked data, ensuring transparent Head-to-Head and Leaderboard statistics.
            </p>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-arena-border/80 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-full bg-arena-terracotta hover:bg-arena-terracotta-dark text-white text-xs font-semibold uppercase tracking-wider transition-colors shadow-sm"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
}
