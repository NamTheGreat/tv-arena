import { isSupabaseConfigured, supabase } from './supabase';

export interface HallOfFameRow {
  category: string;
  place: number;
  record_rank: number;
  series_id: string;
  slug: string;
  title: string;
  chart_color: string | null;
  value: number;
  start_date: string;
  end_date: string;
}

export type HallOfFameCategoryKey =
  | 'record_day'
  | 'top3_days'
  | 'number_one_streak'
  | 'number_one_weeks'
  | 'breakout_events';

export interface HallOfFameCategory {
  key: HallOfFameCategoryKey;
  title: string;
  description: string;
  unit: (value: number) => string;
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

export const HALL_OF_FAME_CATEGORIES: HallOfFameCategory[] = [
  {
    key: 'record_day',
    title: 'Biggest single day',
    description: 'Highest daily score ever recorded.',
    unit: (n) => `${n.toLocaleString('en-US')} pts`,
  },
  {
    key: 'number_one_streak',
    title: 'Longest #1 streak',
    description: 'Most consecutive days at #1 (days with at least 4 shows ranked).',
    unit: (n) => plural(n, 'day', 'days'),
  },
  {
    key: 'number_one_weeks',
    title: 'Most weeks at #1',
    description: 'Consecutive complete Monday to Sunday weeks with the top weekly score.',
    unit: (n) => plural(n, 'week', 'weeks'),
  },
  {
    key: 'top3_days',
    title: 'Most days in the top 3',
    description: 'Total days finishing in the daily top 3.',
    unit: (n) => plural(n, 'day', 'days'),
  },
  {
    key: 'breakout_events',
    title: 'Most breakout days',
    description: 'Distinct days with a detected breakout signal.',
    unit: (n) => plural(n, 'day', 'days'),
  },
];

export function formatRecordDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatRecordPeriod(start: string, end: string): string {
  return start === end ? formatRecordDate(start) : `${formatRecordDate(start)} to ${formatRecordDate(end)}`;
}

/** Ties share record_rank; only show the "T-" prefix when someone else holds the same rank. */
export function formatPlace(row: HallOfFameRow, rows: HallOfFameRow[]): string {
  const tied = rows.filter((r) => r.record_rank === row.record_rank).length > 1;
  return tied ? `T-${row.record_rank}` : String(row.record_rank);
}

export function groupHallOfFame(rows: HallOfFameRow[]): Map<string, HallOfFameRow[]> {
  const grouped = new Map<string, HallOfFameRow[]>();
  for (const row of rows) {
    const list = grouped.get(row.category) ?? [];
    list.push(row);
    grouped.set(row.category, list);
  }
  for (const list of grouped.values()) list.sort((a, b) => a.place - b.place);
  return grouped;
}

export async function fetchHallOfFame(): Promise<HallOfFameRow[]> {
  if (!isSupabaseConfigured || !supabase) throw new Error('Database is not configured.');
  const { data, error } = await supabase
    .from('series_hall_of_fame')
    .select('category, place, record_rank, series_id, slug, title, chart_color, value, start_date, end_date')
    .order('category', { ascending: true })
    .order('place', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as HallOfFameRow[];
}
