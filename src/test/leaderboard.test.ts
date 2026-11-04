import { describe, expect, it } from 'vitest';
import { orderTelemetryPages, readLeaderboardQuery } from '../lib/leaderboard';

describe('leaderboard URL and telemetry helpers', () => {
  it('reads search, sorting, and page size from URL parameters', () => {
    expect(readLeaderboardQuery(new URLSearchParams('q=Severance&sort=growth&show=45&chart=silo'))).toEqual({
      searchTerm: 'Severance',
      sortBy: 'growth',
      displayCount: 40,
    });
  });

  it('uses safe defaults for invalid leaderboard parameters', () => {
    expect(readLeaderboardQuery(new URLSearchParams('sort=unknown&show=-1'))).toEqual({
      searchTerm: '',
      sortBy: 'score',
      displayCount: 20,
    });
  });

  it('orders same-date telemetry by series and removes duplicate page rows', () => {
    const first = { series_id: 'b', recorded_date: '2026-11-01', daily_score: 20 };
    const pages = [
      [first, { series_id: 'a', recorded_date: '2026-11-01', daily_score: 10 }],
      [first, { series_id: 'a', recorded_date: '2026-11-02', daily_score: 11 }],
    ];
    expect(orderTelemetryPages(pages)).toEqual([
      { series_id: 'a', recorded_date: '2026-11-01', daily_score: 10 },
      first,
      { series_id: 'a', recorded_date: '2026-11-02', daily_score: 11 },
    ]);
  });
});
