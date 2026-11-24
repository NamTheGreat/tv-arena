import React, { useEffect, useState } from 'react';
import { fetchSecondarySignals, hasSecondarySignals, summarizeSecondary, SecondarySummary } from '../lib/secondarySignals';
import { formatMetricNumber } from '../lib/svgMath';

/**
 * Secondary signals sit beside the core buzz score and never feed into it. The panel renders
 * nothing when no data exists, so shows without social or IMDb coverage look unchanged.
 */
export function SecondarySignals({ seriesId }: { seriesId: string }) {
  const [summary, setSummary] = useState<SecondarySummary | null>(null);

  useEffect(() => {
    let active = true;
    setSummary(null);
    fetchSecondarySignals(seriesId)
      .then((rows) => active && setSummary(summarizeSecondary(rows)))
      .catch(() => active && setSummary(null)); // columns may not be migrated yet; hide quietly
    return () => {
      active = false;
    };
  }, [seriesId]);

  if (!summary || !hasSecondarySignals(summary)) return null;
  const { mentions, rating, ratingTrajectory } = summary;

  return (
    <section className="mb-6 rounded-2xl border border-stone-200 p-4" aria-labelledby="secondary-signals-heading">
      <h2 id="secondary-signals-heading" className="text-xs font-semibold text-stone-700">Secondary signals</h2>
      <p className="mb-3 text-[11px] text-stone-500">Shown alongside the buzz score. They do not change it.</p>
      <dl className="grid gap-3 sm:grid-cols-2">
        {mentions && (
          <div>
            <dt className="text-[11px] text-stone-500">X mentions on {mentions.date}</dt>
            <dd className="text-lg font-semibold text-arena-charcoal">{formatMetricNumber(mentions.latest)}</dd>
            {mentions.changePct !== null && mentions.previousAverage !== null && (
              <dd className="text-[11px] text-stone-600">
                {mentions.changePct >= 0 ? '+' : ''}{mentions.changePct}% vs {formatMetricNumber(mentions.previousAverage)} recent average
              </dd>
            )}
          </div>
        )}
        {rating && (
          <div>
            <dt className="text-[11px] text-stone-500">IMDb episode rating{rating.episode ? ` (${rating.episode})` : ''}</dt>
            <dd className="text-lg font-semibold text-arena-charcoal">{rating.latest.toFixed(1)}<span className="text-xs font-normal text-stone-500"> / 10</span></dd>
            <dd className="text-[11px] text-stone-600">
              {rating.votes !== null && <>{formatMetricNumber(rating.votes)} votes</>}
              {rating.previous !== null && <>{rating.votes !== null ? ' · ' : ''}previous {rating.previousEpisode ? `${rating.previousEpisode}: ` : ''}{rating.previous.toFixed(1)}</>}
            </dd>
          </div>
        )}
      </dl>
      {ratingTrajectory.length > 1 && (
        <div className="mt-3">
          <h3 className="mb-1 text-[11px] text-stone-500">Rating by episode</h3>
          <ol className="flex flex-wrap gap-2 text-[11px] text-stone-700">
            {ratingTrajectory.map((point) => (
              <li key={point.label} className="rounded-full bg-stone-100 px-2 py-0.5">{point.label} · {point.rating.toFixed(1)}</li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
