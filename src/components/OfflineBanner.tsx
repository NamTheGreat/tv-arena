import React from 'react';

interface OfflineBannerProps {
  isOnline: boolean;
  snapshotTime?: string | null;
  onRetry?: () => void;
}

export function OfflineBanner({ isOnline, snapshotTime, onRetry }: OfflineBannerProps) {
  if (isOnline) return null;

  const formattedTime = snapshotTime
    ? new Date(snapshotTime).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full bg-amber-500/15 border-b border-amber-500/30 text-amber-950 px-4 py-2.5 text-xs font-sans transition-all"
      data-testid="offline-banner"
    >
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-600 animate-pulse" />
          <span className="font-semibold uppercase tracking-wider text-[11px] text-amber-900">
            Offline Mode
          </span>
          <span className="text-amber-800">
            {formattedTime
              ? `Displaying cached snapshot from ${formattedTime}.`
              : 'Displaying offline cached data.'}
          </span>
          <span className="hidden md:inline text-amber-800/80">
            Score submissions, watchlist edits, and live updates are disabled while disconnected.
          </span>
        </div>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="px-3 py-1 bg-amber-900/10 hover:bg-amber-900/20 active:bg-amber-900/30 text-amber-950 font-medium rounded-full text-[11px] transition-colors cursor-pointer border border-amber-900/20"
          >
            Check Connection
          </button>
        )}
      </div>
    </div>
  );
}
