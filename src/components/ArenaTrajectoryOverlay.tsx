import { buildComparisonPath, compareLast30Days } from '../lib/arenaComparison';
import { SeriesItem } from '../lib/supabase';

export function ArenaTrajectoryOverlay({ leftShow, rightShow }: { leftShow: SeriesItem; rightShow: SeriesItem }) {
  const comparison = compareLast30Days(leftShow, rightShow);
  const values = comparison.days.flatMap((day) => [day.left, day.right]).filter((value): value is number => value !== null);
  const maxValue = Math.max(...values, 1);

  return (
    <section className="mt-6 border-t border-arena-border/60 pt-5" aria-label="30 day head-to-head history">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-arena-charcoal">30-Day Head-to-Head</h3>
        <span className="text-[10px] text-arena-muted">Shared telemetry dates only</span>
      </div>
      {comparison.comparableDays === 0 ? (
        <p className="rounded-xl bg-arena-cream px-4 py-3 text-xs text-arena-muted">No shared daily history is available for these shows yet.</p>
      ) : (
        <>
          <svg
            role="img"
            aria-label={`${leftShow.title} led on ${comparison.leftLeads} of 30 days; ${rightShow.title} led on ${comparison.rightLeads} of 30 days; ${comparison.comparableDays} days had data for both`}
            className="h-28 w-full"
            viewBox="0 0 800 110"
            preserveAspectRatio="none"
          >
            {[15, 52.5, 90].map((y) => <line key={y} x1="20" x2="780" y1={y} y2={y} stroke="#eae0d5" strokeDasharray="3 4" />)}
            <path d={buildComparisonPath(comparison.days, 'left', maxValue)} fill="none" stroke={leftShow.chart_color || '#C66A3D'} strokeWidth="2.5" />
            <path d={buildComparisonPath(comparison.days, 'right', maxValue)} fill="none" stroke={rightShow.chart_color || '#5C828C'} strokeWidth="2.5" />
          </svg>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-arena-muted">
            <span><i className="mr-1 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: leftShow.chart_color || '#C66A3D' }} />{leftShow.title} led on {comparison.leftLeads} of 30 days</span>
            <span><i className="mr-1 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: rightShow.chart_color || '#5C828C' }} />{rightShow.title} led on {comparison.rightLeads} of 30 days</span>
          </div>
          <p className="mt-1 text-[10px] text-arena-muted">{comparison.comparableDays} days had recorded values for both shows; ties and missing dates do not count as leads.</p>
        </>
      )}
    </section>
  );
}
