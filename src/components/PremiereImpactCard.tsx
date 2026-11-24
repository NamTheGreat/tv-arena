import React, { useEffect, useState } from 'react';
import { formatMetricNumber } from '../lib/svgMath';
import { buildPremiereReport, fetchPremiereImpact, PremiereReport } from '../lib/premiereImpact';

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; report: PremiereReport };

export function PremiereImpactCard({ seriesId }: { seriesId: string }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    fetchPremiereImpact(seriesId)
      .then((rows) => { if (!cancelled) setState({ status: 'ready', report: buildPremiereReport(rows) }); })
      .catch(() => { if (!cancelled) setState({ status: 'error' }); });
    return () => { cancelled = true; };
  }, [seriesId]);

  // Quietly hide when there is nothing to show or the view is unavailable: the rest of the page is unaffected.
  if (state.status === 'loading' || state.status === 'error') return null;
  if (!state.report.entries.length) return null;
  const { entries, averageMultiplier } = state.report;

  return (
    <section className="mb-6" aria-label="Premiere impact" data-testid="premiere-impact">
      <h2 className="mb-1 text-xs font-semibold text-stone-700">Premiere Impact</h2>
      <p className="mb-2 text-[11px] text-stone-600">
        Average daily score in the 7 days before each season premiere vs the first 7 days after it.
        {averageMultiplier !== null && entries.length > 1 && <> Average premiere bump: <strong>{averageMultiplier}×</strong>.</>}
      </p>
      <ul className="space-y-2">
        {entries.map((e) => (
          <li key={e.event_id} className="rounded-xl border border-stone-200 px-3 py-2 text-xs text-stone-700" data-testid="premiere-row">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">{e.label} <span className="text-stone-600">({e.event_date})</span></span>
              <span className="font-semibold" data-testid="premiere-multiplier">
                {e.multiplier !== null ? `${e.multiplier}×` : 'No baseline'}
                {e.isBest && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-900">Biggest premiere</span>}
              </span>
            </div>
            <div className="mt-1 text-[11px] text-stone-600">
              {formatMetricNumber(Math.round(e.pre_avg))} → {formatMetricNumber(Math.round(e.post_avg))} per day
              {' '}({e.delta >= 0 ? '+' : '−'}{formatMetricNumber(Math.round(Math.abs(e.delta)))})
              {e.vsPrevious !== null && <> · {e.vsPrevious >= 1 ? `${e.vsPrevious}× the previous premiere's bump` : `${e.vsPrevious}× the previous premiere's bump (smaller)`}</>}
              {e.partial && <> · still in progress ({e.post_days} of 7 days)</>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
