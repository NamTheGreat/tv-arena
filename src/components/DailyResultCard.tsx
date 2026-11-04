import React from 'react';
import { StoredDailyResult } from '../lib/dailyChallenge';

interface DailyResultCardProps {
  result: StoredDailyResult;
  isAuthenticated: boolean;
  isSubmitting: boolean;
  submissionError: string | null;
  onRetry: () => void;
  onOpenAuth?: () => void;
}

export function DailyResultCard({
  result,
  isAuthenticated,
  isSubmitting,
  submissionError,
  onRetry,
  onOpenAuth,
}: DailyResultCardProps) {
  const status = result.verified
    ? 'Verified and saved to your account.'
    : isAuthenticated
      ? 'Your score has not been verified yet.'
      : 'Saved on this device only.';

  return (
    <section className="w-full max-w-xl mx-auto py-12 px-6 text-center bg-white/80 backdrop-blur rounded-[28px] border border-stone-200/80 shadow-soft-card my-6">
      <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-700 mx-auto flex items-center justify-center font-serif text-xl mb-4 border border-emerald-200/60">✓</div>
      <h2 className="font-serif text-2xl text-stone-900 font-semibold mb-2">Today's Challenge Complete</h2>
      <p className="text-sm text-stone-600 mb-2">Score: {result.score}/10</p>
      <p className="text-xs text-stone-500 mb-5">{status}</p>
      {result.correctness.length > 0 && (
        <div className="flex justify-center gap-1.5 mb-6" aria-label="Daily challenge result">
          {result.correctness.map((correct, index) => (
            <span key={`${result.date}-${index}`} aria-label={correct ? 'Correct' : 'Incorrect'}>
              {correct ? '🟩' : '🟥'}
            </span>
          ))}
        </div>
      )}
      {isSubmitting && <p role="status" className="text-xs text-stone-500">Verifying your score…</p>}
      {submissionError && (
        <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          <p>{submissionError}</p>
          <button type="button" onClick={onRetry} disabled={isSubmitting} className="mt-2 font-semibold underline disabled:opacity-50">
            Retry saving score
          </button>
        </div>
      )}
      {!isAuthenticated && onOpenAuth && (
        <div className="mt-4 text-sm text-stone-600">
          <p>Sign in to save your score to the leaderboard.</p>
          <button type="button" onClick={onOpenAuth} className="mt-2 font-semibold text-arena-terracotta underline">
            Sign in
          </button>
        </div>
      )}
      <p className="text-xs text-stone-400 mt-6">Come back tomorrow for a new challenge.</p>
    </section>
  );
}
