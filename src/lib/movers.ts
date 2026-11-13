import { SeriesItem } from './supabase';

export function getMovers(seriesList: SeriesItem[]) {
  const withChange = seriesList.filter((show) => Number.isFinite(show.delta_pct));
  return {
    risers: withChange.filter((show) => (show.delta_pct || 0) > 0)
      .sort((a, b) => (b.delta_pct || 0) - (a.delta_pct || 0)).slice(0, 10),
    fallers: withChange.filter((show) => (show.delta_pct || 0) < 0)
      .sort((a, b) => (a.delta_pct || 0) - (b.delta_pct || 0)).slice(0, 10),
    breakouts: seriesList.filter((show) => show.is_breakout)
      .sort((a, b) => (b.delta_pct || 0) - (a.delta_pct || 0)).slice(0, 10),
  };
}

export function getNextMoverWeekStart(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay();
  const daysUntilNextMonday = ((8 - (day === 0 ? 7 : day)) % 7) || 7;
  d.setUTCDate(d.getUTCDate() + daysUntilNextMonday);
  return d.toISOString().slice(0, 10);
}
