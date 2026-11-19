import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchUserDailyHistory, DailyHistoryEntry, DailyHistoryPage } from '../lib/dailyHistory';
import { DailyResultCard } from './DailyResultCard';
import { getDailyChallengeNumber, type StoredDailyResult } from '../lib/dailyChallenge';

interface DailyHistoryViewProps {
  user: any;
  onOpenAuth?: () => void;
}

export function DailyHistoryView({ user, onOpenAuth }: DailyHistoryViewProps) {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [historyData, setHistoryData] = useState<DailyHistoryPage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedResult, setSelectedResult] = useState<StoredDailyResult | null>(null);

  useEffect(() => {
    document.title = 'Daily Challenge History — TV Arena';
  }, []);

  const loadHistory = async (targetPage: number) => {
    if (!user?.id) return;
    setIsLoading(true);
    setError(null);
    const { data, error: fetchErr } = await fetchUserDailyHistory(user.id, targetPage, 10);
    if (fetchErr) {
      setError(fetchErr);
    } else {
      setHistoryData(data);
      setPage(targetPage);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    if (user?.id) {
      loadHistory(page);
    } else {
      setHistoryData(null);
    }
  }, [user?.id]);

  // Anonymous user state
  if (!user) {
    return (
      <main className="w-full max-w-xl mx-auto bg-white/90 backdrop-blur-xl rounded-[28px] sm:rounded-[32px] p-6 sm:p-10 shadow-card border border-[#EFEAE2]/90 text-center my-8">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-brand-terracotta/10 text-brand-terracotta flex items-center justify-center">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h2 className="font-serif text-2xl font-semibold text-arena-charcoal mb-2">
          Daily Challenge History
        </h2>
        <p className="text-xs sm:text-sm text-arena-muted mb-6 max-w-md mx-auto">
          Sign in to view your private daily run history, track your verified scores over time, and inspect your streak progression.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            type="button"
            onClick={onOpenAuth}
            className="w-full sm:w-auto px-6 py-2.5 rounded-full bg-arena-terracotta hover:bg-arena-terracottaHover text-white text-xs font-semibold shadow-pill transition-all cursor-pointer"
          >
            Sign In to View History
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="w-full sm:w-auto px-5 py-2.5 rounded-full bg-white hover:bg-stone-50 border border-stone-200 text-stone-700 text-xs font-semibold transition-all cursor-pointer"
          >
            Return to Leaderboard
          </button>
        </div>
      </main>
    );
  }

  const entries = historyData?.entries || [];
  const totalCount = historyData?.totalCount || 0;
  const totalPages = historyData?.totalPages || 1;
  const bestStreak = historyData?.bestStreak ?? 0;

  return (
    <main className="w-full max-w-3xl mx-auto bg-white/95 backdrop-blur-xl rounded-[28px] sm:rounded-[32px] p-6 sm:p-10 shadow-card border border-[#EFEAE2]/90 my-4 text-left">
      {/* Top Breadcrumb */}
      <div className="flex items-center justify-between pb-4 border-b border-stone-100 mb-6">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-arena-muted hover:text-arena-charcoal transition-colors cursor-pointer"
        >
          <span>← Back to Leaderboard</span>
        </button>
        <span className="text-[10.5px] uppercase font-semibold tracking-wider text-arena-faint">
          Private History
        </span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-serif text-3xl font-medium text-arena-charcoal">
            Daily Challenge History
          </h1>
          <p className="text-xs text-arena-muted mt-1">
            Your verified daily challenge scores, streak progression, and shareable results.
          </p>
        </div>

        {totalCount > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-stone-700 bg-stone-100 px-3 py-1 rounded-full border border-stone-200">
              {totalCount} Completed
            </span>
            {bestStreak > 0 && (
              <span className="text-[11px] font-semibold text-brand-terracotta bg-[#FCF0EA] px-3 py-1 rounded-full border border-[#F2DCD0]">
                Best Streak: {bestStreak}d
              </span>
            )}
          </div>
        )}
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="py-12 text-center" role="status">
          <p className="text-xs text-stone-500 animate-pulse">Loading challenge history…</p>
        </div>
      )}

      {/* Error State */}
      {error && !isLoading && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between mb-6" role="alert">
          <span>Failed to load history: {error}</span>
          <button
            type="button"
            onClick={() => loadHistory(page)}
            className="underline font-semibold ml-2 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && entries.length === 0 && (
        <div className="py-12 text-center border border-dashed border-stone-200 rounded-2xl bg-stone-50/50 my-4">
          <p className="text-xs sm:text-sm text-arena-muted mb-4">
            No daily challenges completed yet. Play today's Daily Run to record your first score!
          </p>
          <button
            type="button"
            onClick={() => navigate('/guess/daily')}
            className="px-5 py-2.5 rounded-full bg-arena-terracotta hover:bg-arena-terracottaHover text-white text-xs font-semibold shadow-pill transition-all cursor-pointer"
          >
            Play Daily Run
          </button>
        </div>
      )}

      {/* History Entries List */}
      {!isLoading && !error && entries.length > 0 && (
        <div className="space-y-3 mb-6">
          {entries.map((entry) => (
            <div
              key={entry.date}
              className="p-4 rounded-2xl bg-[#FAF6F2] border border-[#EEE4DB] flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-brand-terracotta/40 transition-colors"
            >
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-sm text-arena-charcoal">
                    Daily Run #{entry.dailyNumber}
                  </span>
                  <span className="text-stone-300">·</span>
                  <span className="text-xs text-stone-500">{entry.date}</span>
                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    Streak: {entry.streak}d
                  </span>
                </div>

                {/* Correctness dots */}
                <div className="flex items-center gap-1.5 mt-2" aria-label={`Score: ${entry.score} out of 10`}>
                  {entry.correctness.map((isCorrect, idx) => (
                    <span
                      key={idx}
                      className={`w-2.5 h-2.5 rounded-full ${
                        isCorrect ? 'bg-emerald-600' : 'bg-rose-500'
                      }`}
                      title={`Round ${idx + 1}: ${isCorrect ? 'Correct' : 'Incorrect'}`}
                    />
                  ))}
                  <span className="text-xs font-semibold text-stone-700 ml-2">
                    {entry.score} / 10
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedResult({
                      date: entry.date,
                      score: entry.score,
                      correctness: entry.correctness,
                      completedAt: entry.completedAt,
                      verified: true,
                    });
                  }}
                  className="px-3.5 py-1.5 rounded-full bg-white hover:bg-stone-50 border border-stone-200 text-stone-700 text-xs font-semibold shadow-sm transition-all cursor-pointer"
                >
                  Share Card
                </button>
              </div>
            </div>
          ))}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-stone-100 text-xs text-stone-600">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => loadHistory(page - 1)}
                className="px-3.5 py-1.5 rounded-full bg-white hover:bg-stone-50 disabled:opacity-40 border border-stone-200 font-medium transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                ← Previous
              </button>
              <span className="font-medium text-stone-500">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => loadHistory(page + 1)}
                className="px-3.5 py-1.5 rounded-full bg-white hover:bg-stone-50 disabled:opacity-40 border border-stone-200 font-medium transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                Next →
              </button>
            </div>
          )}
        </div>
      )}

      {/* Selected Share Card Modal */}
      {selectedResult && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => setSelectedResult(null)}
        >
          <div
            className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-stone-200 relative text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-stone-100 mb-4">
              <span className="text-xs font-semibold text-stone-700">
                Daily Run #{getDailyChallengeNumber(selectedResult.date)} Result
              </span>
              <button
                type="button"
                onClick={() => setSelectedResult(null)}
                className="text-stone-400 hover:text-stone-700 text-sm font-bold cursor-pointer"
                aria-label="Close share card"
              >
                ✕
              </button>
            </div>

            <DailyResultCard
              result={selectedResult}
              isAuthenticated={true}
              isSubmitting={false}
              submissionError={null}
              onRetry={() => {}}
            />
          </div>
        </div>
      )}
    </main>
  );
}
