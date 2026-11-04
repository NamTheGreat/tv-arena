export type LeaderboardSort = 'score' | 'growth' | 'new';

export interface TelemetryScoreRow {
  series_id: string;
  recorded_date: string;
  daily_score: number | null;
}

export function readLeaderboardQuery(params: URLSearchParams): {
  searchTerm: string;
  sortBy: LeaderboardSort;
  displayCount: number;
} {
  const requestedSort = params.get('sort');
  const requestedCount = Number(params.get('show'));
  return {
    searchTerm: params.get('q') ?? '',
    sortBy: requestedSort === 'growth' || requestedSort === 'new' ? requestedSort : 'score',
    displayCount: Number.isFinite(requestedCount) && requestedCount >= 20
      ? Math.min(200, Math.floor(requestedCount / 20) * 20)
      : 20,
  };
}

export function orderTelemetryPages(pages: TelemetryScoreRow[][]): TelemetryScoreRow[] {
  const unique = new Map<string, TelemetryScoreRow>();
  for (const row of pages.flat()) {
    unique.set(`${row.series_id}:${row.recorded_date}`, row);
  }
  return [...unique.values()].sort((a, b) =>
    a.recorded_date.localeCompare(b.recorded_date) || a.series_id.localeCompare(b.series_id)
  );
}
