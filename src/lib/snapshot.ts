import type { SeriesItem } from './supabase';

export interface ArenaSnapshot {
  generated_at: string;
  series: SeriesItem[];
}

const SNAPSHOT_MAX_AGE_MS = 36 * 60 * 60 * 1000;

function isSnapshot(value: unknown, now = Date.now()): value is ArenaSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Record<string, unknown>;
  if (typeof snapshot.generated_at !== 'string' || !Array.isArray(snapshot.series)) return false;
  const generatedAt = Date.parse(snapshot.generated_at);
  if (!Number.isFinite(generatedAt) || generatedAt > now + 5 * 60 * 1000 || now - generatedAt > SNAPSHOT_MAX_AGE_MS) return false;

  return snapshot.series.every((item) => {
    if (!item || typeof item !== 'object') return false;
    const series = item as Record<string, unknown>;
    return typeof series.id === 'string'
      && Number.isFinite(series.tmdb_id)
      && typeof series.slug === 'string'
      && typeof series.title === 'string'
      && typeof series.network === 'string'
      && typeof series.network_group === 'string'
      && typeof series.genre_group === 'string'
      && typeof series.release_years === 'string'
      && (typeof series.chart_color === 'string' || series.chart_color === null)
      && typeof series.wiki_slug === 'string'
      && typeof series.reddit_query === 'string'
      && Number.isFinite(series.buzz_score)
      && Number.isFinite(series.current_7d_score)
      && Number.isFinite(series.previous_7d_score)
      && Number.isFinite(series.rank)
      && (typeof series.delta_pct === 'number' || series.delta_pct === null)
      && (typeof series.updated_at === 'string' || series.updated_at === null)
      && Array.isArray(series.events)
      && typeof series.is_breakout === 'boolean'
      && Array.isArray(series.daily_series)
      && series.daily_series.every((score) => Number.isFinite(score))
      && Array.isArray(series.daily_dates)
      && series.daily_dates.every((date) => typeof date === 'string');
  });
}

export async function fetchArenaSnapshot(fetcher: typeof fetch = fetch, now = Date.now()): Promise<ArenaSnapshot | null> {
  try {
    const response = await fetcher('/snapshot.json', { cache: 'no-store' });
    if (!response.ok) return null;
    const snapshot: unknown = await response.json();
    return isSnapshot(snapshot, now) ? snapshot : null;
  } catch {
    return null;
  }
}
