import { isSupabaseConfigured, supabase } from './supabase';

export interface PremiereImpactRow {
  event_id: number;
  series_id: string;
  event_date: string;
  label: string;
  premiere_number: number;
  pre_days: number;
  post_days: number;
  pre_avg: number;
  post_avg: number;
  delta: number;
  multiplier: number | null;
}

export interface PremiereEntry extends PremiereImpactRow {
  /** Multiplier relative to the previous analysed premiere (this / previous), null when unknown. */
  vsPrevious: number | null;
  isBest: boolean;
  /** True when the post window has fewer than 7 observed days. */
  partial: boolean;
}

export interface PremiereReport {
  entries: PremiereEntry[];
  /** Average multiplier across premieres that have one, null with none. */
  averageMultiplier: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Pure comparison of a show's premieres. Rows may arrive in any order; they are sorted by date.
 * The best premiere is the one with the highest multiplier (ties: the latest), only when 2+ have one.
 */
export function buildPremiereReport(rows: PremiereImpactRow[]): PremiereReport {
  const sorted = [...rows].sort((a, b) => a.event_date.localeCompare(b.event_date) || a.event_id - b.event_id);
  const withMultiplier = sorted.filter((r) => r.multiplier !== null);
  const best = withMultiplier.length >= 2
    ? withMultiplier.reduce((acc, r) => (r.multiplier! >= acc.multiplier! ? r : acc))
    : null;

  const entries = sorted.map((row, i): PremiereEntry => {
    const prev = i > 0 ? sorted[i - 1] : null;
    const vsPrevious = row.multiplier !== null && prev && prev.multiplier !== null && prev.multiplier > 0
      ? round2(row.multiplier / prev.multiplier)
      : null;
    return { ...row, vsPrevious, isBest: best?.event_id === row.event_id, partial: row.post_days < 7 };
  });

  const averageMultiplier = withMultiplier.length
    ? round2(withMultiplier.reduce((sum, r) => sum + r.multiplier!, 0) / withMultiplier.length)
    : null;
  return { entries, averageMultiplier };
}

export async function fetchPremiereImpact(seriesId: string): Promise<PremiereImpactRow[]> {
  if (!isSupabaseConfigured || !supabase) throw new Error('Premiere impact needs a live database connection.');
  const { data, error } = await supabase
    .from('series_premiere_impact')
    .select('event_id, series_id, event_date, label, premiere_number, pre_days, post_days, pre_avg, post_avg, delta, multiplier')
    .eq('series_id', seriesId)
    .order('event_date', { ascending: true })
    .limit(50);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as PremiereImpactRow[]).map((r) => ({
    ...r,
    event_id: Number(r.event_id),
    premiere_number: Number(r.premiere_number),
    pre_days: Number(r.pre_days),
    post_days: Number(r.post_days),
    pre_avg: Number(r.pre_avg),
    post_avg: Number(r.post_avg),
    delta: Number(r.delta),
    multiplier: r.multiplier === null ? null : Number(r.multiplier),
  }));
}
