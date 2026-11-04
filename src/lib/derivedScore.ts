export function leaderboardScore(row: { current_7d_score?: number | null }): number {
  return Number(row.current_7d_score ?? 0);
}
