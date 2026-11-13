import React, { useState } from 'react';
import { correctnessGrid, createDailyScoreShare, getDailyChallengeNumber, StoredDailyResult } from '../lib/dailyChallenge';

interface DailyResultCardProps {
  result: StoredDailyResult;
  isAuthenticated: boolean;
  isSubmitting: boolean;
  submissionError: string | null;
  onRetry: () => void;
  onOpenAuth?: () => void;
  onClearSavedResult?: () => void;
}

export function DailyResultCard({
  result,
  isAuthenticated,
  isSubmitting,
  submissionError,
  onRetry,
  onOpenAuth,
  onClearSavedResult,
}: DailyResultCardProps) {
  const [shareStatus, setShareStatus] = useState('');
  const hasNoAnswers = !result.answers?.length;
  const status = result.verified
    ? 'Verified and saved to your account.'
    : hasNoAnswers
      ? 'Saved on this device only.'
      : isAuthenticated
        ? 'Your score has not been verified yet.'
        : 'Saved on this device only.';
  const shareResult = async () => {
    try {
      let score: number;
      let correctness: boolean[];
      let shareUrl: string;
      const dailyNumber = getDailyChallengeNumber(result.date);

      if (isAuthenticated) {
        const serverResult = await createDailyScoreShare(result.date);
        if (!serverResult) throw new Error('This result has not been verified by the server yet.');
        score = serverResult.score;
        correctness = serverResult.correctness;
        shareUrl = `${window.location.origin}/daily/${getDailyChallengeNumber(serverResult.date)}?s=${encodeURIComponent(serverResult.token)}`;
      } else {
        const grid = correctnessGrid(result.correctness);
        if (!grid) throw new Error('A complete 10-round result is required to share.');
        correctness = [...grid].map((bit) => bit === '1');
        score = [...grid].filter((bit) => bit === '1').length;
        shareUrl = `${window.location.origin}/daily/${dailyNumber}?g=${grid}`;
      }

      if (!navigator.clipboard) throw new Error('Clipboard access is unavailable.');
      const gridText = correctness.map((correct) => correct ? '🟩' : '🟥').join('');
      await navigator.clipboard.writeText(`TV Arena Daily Run #${dailyNumber}\nScore: ${score}/10\n${gridText}\n${shareUrl}`);
      setShareStatus('Copied result to clipboard.');
    } catch (error) {
      setShareStatus(error instanceof Error ? error.message : 'Could not copy the result. Check clipboard permissions and try again.');
    }
  };

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
      <button type="button" onClick={() => void shareResult()} className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50">
        Share Result
      </button>
      {shareStatus && <p role={shareStatus.startsWith('Could not') ? 'alert' : 'status'} className="mt-2 text-xs text-stone-500">{shareStatus}</p>}
      {isSubmitting && <p role="status" className="text-xs text-stone-500">Verifying your score…</p>}
      {hasNoAnswers && !result.verified && onClearSavedResult && (
        <div className="mt-4">
          <p className="text-xs text-stone-500 mb-2">
            This saved result has no answers and cannot be submitted to the leaderboard.
          </p>
          <button
            type="button"
            onClick={onClearSavedResult}
            className="rounded-xl border border-stone-300 px-4 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-50 hover:text-stone-900 transition-colors cursor-pointer"
          >
            Clear saved result
          </button>
        </div>
      )}
      {!hasNoAnswers && submissionError && (
        <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          <p>{submissionError}</p>
          <button type="button" onClick={onRetry} disabled={isSubmitting} className="mt-2 font-semibold underline disabled:opacity-50">
            Retry saving score
          </button>
        </div>
      )}
      {!isAuthenticated && onOpenAuth && !hasNoAnswers && result.answers?.length === result.correctness.length && result.answers.length > 0 && (
        <div className="mt-4 text-sm text-stone-600">
          <p>Sign in to save your score to the leaderboard.</p>
          <button type="button" onClick={onOpenAuth} className="mt-2 font-semibold text-arena-terracotta underline">
            Sign in
          </button>
        </div>
      )}
      {!isAuthenticated && !result.answers?.length && (
        <p className="mt-4 text-xs text-stone-500">This saved result cannot be transferred to a leaderboard account.</p>
      )}
      <p className="text-xs text-stone-400 mt-6">Come back tomorrow for a new challenge.</p>
    </section>
  );
}
