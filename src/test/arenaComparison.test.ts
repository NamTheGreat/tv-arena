import { describe, expect, it } from 'vitest';
import { buildComparisonPath, compareLast30Days } from '../lib/arenaComparison';
import { SeriesItem } from '../lib/supabase';

function series(slug: string, dates: string[], values: number[]): SeriesItem {
  return {
    id: slug,
    tmdb_id: 1,
    slug,
    title: slug,
    network: 'Network',
    network_group: 'Other',
    genre_group: 'Drama',
    release_years: '2020–present',
    chart_color: '#c66a3d',
    wiki_slug: slug,
    reddit_query: slug,
    buzz_score: 0,
    delta_pct: null,
    updated_at: null,
    daily_series: values,
    daily_dates: dates,
  };
}

describe('compareLast30Days', () => {
  it('aligns by date and counts leads only where both shows have data', () => {
    const result = compareLast30Days(
      series('left', ['2026-01-01', '2026-01-02'], [10, 5]),
      series('right', ['2026-01-01', '2026-01-02', '2026-01-03'], [5, 7, 20])
    );

    expect(result.days).toHaveLength(30);
    expect(result.days[29]).toMatchObject({ date: '2026-01-03', left: null, right: 20 });
    expect(result.leftLeads).toBe(1);
    expect(result.rightLeads).toBe(1);
    expect(result.comparableDays).toBe(2);
  });

  it('starts a new path after missing dates instead of drawing through gaps', () => {
    const result = compareLast30Days(
      series('left', ['2026-01-01', '2026-01-03'], [10, 8]),
      series('right', ['2026-01-01', '2026-01-03'], [5, 9])
    );
    const path = buildComparisonPath(result.days, 'left', 10);

    expect(path.match(/M/g)).toHaveLength(2);
    expect(path.match(/L/g)).toBeNull();
  });
});
