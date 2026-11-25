import { isSupabaseConfigured, supabase } from './supabase';

export interface SecondaryObservation {
  recorded_date: string;
  social_mentions: number | null;
  imdb_rating: number | null;
  imdb_votes: number | null;
  imdb_episode: string | null;
}

export interface SecondarySummary {
  mentions: { latest: number; date: string; previousAverage: number | null; changePct: number | null } | null;
  rating: { latest: number; date: string; episode: string | null; votes: number | null; previous: number | null; previousEpisode: string | null } | null;
  ratingTrajectory: { label: string; rating: number }[];
}

export const SECONDARY_WINDOW_DAYS = 30;

/** Rows arrive newest first. Only days that observed a signal count; gaps are never treated as zero. */
export function summarizeSecondary(rows: SecondaryObservation[]): SecondarySummary {
  const byDate = [...rows].sort((a, b) => b.recorded_date.localeCompare(a.recorded_date));

  const mentionRows = byDate.filter((r) => r.social_mentions !== null);
  let mentions: SecondarySummary['mentions'] = null;
  if (mentionRows.length) {
    const [latest, ...rest] = mentionRows;
    const window = rest.slice(0, 7);
    const avg = window.length ? window.reduce((sum, r) => sum + (r.social_mentions ?? 0), 0) / window.length : null;
    mentions = {
      latest: latest.social_mentions as number,
      date: latest.recorded_date,
      previousAverage: avg === null ? null : Math.round(avg),
      changePct: avg && avg > 0 ? Math.round((((latest.social_mentions as number) - avg) / avg) * 100) : null,
    };
  }

  const ratingRows = byDate.filter((r) => r.imdb_rating !== null);
  let rating: SecondarySummary['rating'] = null;
  // One point per distinct episode (newest observation of it), oldest first, for the trajectory.
  const seen = new Set<string>();
  const perEpisode: SecondaryObservation[] = [];
  for (const row of ratingRows) {
    const key = row.imdb_episode ?? row.recorded_date;
    if (seen.has(key)) continue;
    seen.add(key);
    perEpisode.push(row);
  }
  if (perEpisode.length) {
    const [latest, previous] = perEpisode;
    rating = {
      latest: Number(latest.imdb_rating),
      date: latest.recorded_date,
      episode: latest.imdb_episode,
      votes: latest.imdb_votes,
      previous: previous ? Number(previous.imdb_rating) : null,
      previousEpisode: previous?.imdb_episode ?? null,
    };
  }
  return {
    mentions,
    rating,
    ratingTrajectory: [...perEpisode].reverse().map((r) => ({ label: r.imdb_episode ?? r.recorded_date, rating: Number(r.imdb_rating) })),
  };
}

export function hasSecondarySignals(summary: SecondarySummary): boolean {
  return summary.mentions !== null || summary.rating !== null;
}

export async function fetchSecondarySignals(seriesId: string, today: Date = new Date()): Promise<SecondaryObservation[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const since = new Date(today.getTime() - SECONDARY_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('series_daily_telemetry')
    .select('recorded_date, social_mentions, imdb_rating, imdb_votes, imdb_episode')
    .eq('series_id', seriesId)
    .gte('recorded_date', since)
    .or('social_mentions.not.is.null,imdb_rating.not.is.null')
    .order('recorded_date', { ascending: false })
    .limit(SECONDARY_WINDOW_DAYS);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as SecondaryObservation[];
}
