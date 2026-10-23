import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface MethodologyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ScoreWeights {
  wiki_weight: number;
  comment_weight: number;
  upvote_weight: number;
}

const DEFAULT_WEIGHTS: ScoreWeights = {
  wiki_weight: 10,
  comment_weight: 150,
  upvote_weight: 25,
};

export function MethodologyModal({ isOpen, onClose }: MethodologyModalProps) {
  const [weights, setWeights] = useState<ScoreWeights>(DEFAULT_WEIGHTS);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !supabase) return;

    async function fetchWeights() {
      if (!supabase) return;
      const client = supabase;
      setLoading(true);
      try {
        const { data, error } = await client
          .from('score_weights')
          .select('wiki_weight, comment_weight, upvote_weight')
          .eq('id', 1)
          .single();

        if (!error && data) {
          setWeights({
            wiki_weight: Number(data.wiki_weight),
            comment_weight: Number(data.comment_weight),
            upvote_weight: Number(data.upvote_weight),
          });
        }
      } catch {
        // Fallback to defaults
      } finally {
        setLoading(false);
      }
    }

    fetchWeights();
  }, [isOpen]);

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

        <p className="text-xs sm:text-sm text-stone-600 leading-relaxed mb-4">
          TV Arena calculates show rankings and head-to-head comparisons directly in SQL using empirical daily telemetry signals and weights stored in <code className="bg-stone-100 px-1 py-0.5 rounded text-stone-700 font-mono text-xs">score_weights</code>.
        </p>

        {/* Dynamic Formula Pill */}
        <div className="bg-[#FAF6F2] border border-[#EEE4DB] rounded-2xl p-3 sm:p-4 mb-4">
          <div className="text-[10px] uppercase font-bold tracking-wider text-arena-muted mb-1">
            Authoritative SQL Formula {loading && '(fetching...)'}
          </div>
          <div className="font-mono text-[11px] sm:text-xs text-stone-800 break-words leading-relaxed">
            daily_score = (<span className="text-arena-terracotta font-semibold">wiki_views</span> × {weights.wiki_weight}) + (<span className="text-arena-terracotta font-semibold">reddit_comments</span> × {weights.comment_weight}) + (<span className="text-arena-terracotta font-semibold">reddit_upvotes</span> × {weights.upvote_weight})
          </div>
        </div>

        <div className="space-y-3 text-xs sm:text-sm text-stone-700">
          <div className="bg-white border border-arena-border/80 rounded-2xl p-3.5 space-y-1">
            <h3 className="font-semibold text-stone-900 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-arena-border/50 text-arena-terracotta text-xs flex items-center justify-center font-bold">
                  1
                </span>
                <span>Wikipedia Telemetry</span>
              </span>
              <span className="text-xs font-mono font-bold text-arena-terracotta">
                {weights.wiki_weight}x
              </span>
            </h3>
            <p className="text-stone-500 text-xs pl-7 leading-relaxed">
              Daily Wikipedia article pageviews measure proactive audience curiosity and episodic recap lookups.
            </p>
          </div>

          <div className="bg-white border border-arena-border/80 rounded-2xl p-3.5 space-y-1">
            <h3 className="font-semibold text-stone-900 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-arena-border/50 text-arena-terracotta text-xs flex items-center justify-center font-bold">
                  2
                </span>
                <span>Reddit Discussion Velocity</span>
              </span>
              <span className="text-xs font-mono font-bold text-arena-terracotta">
                {weights.comment_weight}x
              </span>
            </h3>
            <p className="text-stone-500 text-xs pl-7 leading-relaxed">
              Aggregated community commentary volume across dedicated subreddit discussion threads.
            </p>
          </div>

          <div className="bg-white border border-arena-border/80 rounded-2xl p-3.5 space-y-1">
            <h3 className="font-semibold text-stone-900 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-arena-border/50 text-arena-terracotta text-xs flex items-center justify-center font-bold">
                  3
                </span>
                <span>Reddit Upvote Sentiment</span>
              </span>
              <span className="text-xs font-mono font-bold text-arena-terracotta">
                {weights.upvote_weight}x
              </span>
            </h3>
            <p className="text-stone-500 text-xs pl-7 leading-relaxed">
              Upvote momentum measuring audience enthusiasm and organic word-of-mouth endorsement.
            </p>
          </div>
        </div>

        <div className="mt-5 pt-3 border-t border-arena-border/80 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-full bg-arena-terracotta hover:bg-arena-terracottaHover text-white text-xs font-semibold uppercase tracking-wider transition-colors shadow-sm cursor-pointer"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
}
