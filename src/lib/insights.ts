import { isSupabaseConfigured, supabase } from './supabase';

export interface PlatformShareRow {
  week_start: string;
  network_group: string;
  shows: number;
  share_pct: number;
  score_share_pct: number;
  ranked_shows: number;
}

export interface GenreShareRow {
  week_start: string;
  genre_group: string;
  shows: number;
  total_daily_score: number;
  avg_score_per_show: number;
  share_pct: number;
}

export interface SignalPoint {
  series_id: string;
  slug: string;
  title: string;
  network_group: string;
  genre_group: string;
  observed_days: number;
  avg_wiki_views: number | null;
  avg_reddit_comments: number | null;
  avg_reddit_upvotes: number | null;
  avg_daily_score: number | null;
}

export type SignalKey = 'avg_wiki_views' | 'avg_reddit_comments' | 'avg_reddit_upvotes' | 'avg_daily_score';

export const SIGNAL_OPTIONS: { key: SignalKey; label: string }[] = [
  { key: 'avg_wiki_views', label: 'Wikipedia views / day' },
  { key: 'avg_reddit_comments', label: 'Reddit comments / day' },
  { key: 'avg_reddit_upvotes', label: 'Reddit upvotes / day' },
  { key: 'avg_daily_score', label: 'Buzz score / day' },
];

export interface ChartSeries {
  name: string;
  color: string;
  values: (number | null)[]; // aligned with `labels`
}

export interface PivotedChart {
  labels: string[]; // week_start, ascending
  series: ChartSeries[];
}

export const INSIGHT_PALETTE = ['#C66A3D', '#5C828C', '#C59A44', '#886F99', '#6E8761', '#A65D67'];
const OTHER_COLOR = '#8A8178';

/**
 * Pivot weekly rows into chart series. The `topN` categories by latest-week share keep their own line;
 * everything else is folded into "Other" so the chart stays readable. Weeks where a category had no rows
 * count as 0 share, because absence from the top 100 really is 0%.
 */
export function pivotShares<T extends { week_start: string }>(
  rows: T[],
  category: (r: T) => string,
  value: (r: T) => number,
  topN = 5,
): PivotedChart {
  const labels = [...new Set(rows.map((r) => r.week_start))].sort();
  if (!labels.length) return { labels, series: [] };
  const latest = labels[labels.length - 1];
  const latestByCat = new Map<string, number>();
  const totalByCat = new Map<string, number>();
  for (const r of rows) {
    const c = category(r);
    totalByCat.set(c, (totalByCat.get(c) ?? 0) + value(r));
    if (r.week_start === latest) latestByCat.set(c, value(r));
  }
  const ranked = [...totalByCat.keys()].sort(
    (a, b) => (latestByCat.get(b) ?? 0) - (latestByCat.get(a) ?? 0) || (totalByCat.get(b) ?? 0) - (totalByCat.get(a) ?? 0) || a.localeCompare(b),
  );
  const top = ranked.slice(0, topN);
  const cellValue = new Map<string, number>();
  for (const r of rows) {
    const c = top.includes(category(r)) ? category(r) : 'Other';
    const key = `${c}|${r.week_start}`;
    cellValue.set(key, (cellValue.get(key) ?? 0) + value(r));
  }
  const names = ranked.length > topN ? [...top, 'Other'] : top;
  return {
    labels,
    series: names.map((name, i) => ({
      name,
      color: name === 'Other' ? OTHER_COLOR : INSIGHT_PALETTE[i % INSIGHT_PALETTE.length],
      values: labels.map((w) => Math.round((cellValue.get(`${name}|${w}`) ?? 0) * 10) / 10),
    })),
  };
}

export interface Point {
  x: number;
  y: number;
}

export interface Regression {
  n: number;
  slope: number;
  intercept: number;
  r: number;
  r2: number;
}

/** Ordinary least squares. Returns null when a fit is meaningless (fewer than 3 points or no variance in x or y). */
export function linearRegression(points: Point[]): Regression | null {
  const n = points.length;
  if (n < 3) return null;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of points) {
    sxx += (p.x - mx) ** 2;
    syy += (p.y - my) ** 2;
    sxy += (p.x - mx) * (p.y - my);
  }
  if (sxx === 0 || syy === 0) return null;
  const slope = sxy / sxx;
  const r = sxy / Math.sqrt(sxx * syy);
  return { n, slope, intercept: my - slope * mx, r, r2: r * r };
}

export function describeStrength(r2: number): string {
  if (r2 >= 0.64) return 'strong';
  if (r2 >= 0.25) return 'moderate';
  if (r2 >= 0.04) return 'weak';
  return 'negligible';
}

export interface ScatterData {
  points: (Point & { title: string; slug: string })[];
  regression: Regression | null;
  logScale: boolean;
}

/** Shows missing either signal are skipped (never treated as 0). Log scale uses ln(1 + value). */
export function buildScatter(rows: SignalPoint[], xKey: SignalKey, yKey: SignalKey, logScale: boolean): ScatterData {
  const t = (v: number) => (logScale ? Math.log1p(v) : v);
  const points = rows.flatMap((r) => {
    const x = r[xKey];
    const y = r[yKey];
    if (x === null || y === null || x === undefined || y === undefined || x < 0 || y < 0) return [];
    return [{ x: t(Number(x)), y: t(Number(y)), title: r.title, slug: r.slug }];
  });
  return { points, regression: linearRegression(points), logScale };
}

function client() {
  if (!isSupabaseConfigured || !supabase) throw new Error('Insights need a live database connection.');
  return supabase;
}

const asNumber = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export async function fetchPlatformShares(): Promise<PlatformShareRow[]> {
  const { data, error } = await client()
    .from('insights_platform_share_weekly')
    .select('week_start, network_group, shows, share_pct, score_share_pct, ranked_shows')
    .order('week_start', { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as PlatformShareRow[]).map((r) => ({
    ...r,
    shows: Number(r.shows),
    share_pct: Number(r.share_pct),
    score_share_pct: Number(r.score_share_pct),
    ranked_shows: Number(r.ranked_shows),
  }));
}

export async function fetchGenreShares(): Promise<GenreShareRow[]> {
  const { data, error } = await client()
    .from('insights_genre_share_weekly')
    .select('week_start, genre_group, shows, total_daily_score, avg_score_per_show, share_pct')
    .order('week_start', { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as GenreShareRow[]).map((r) => ({
    ...r,
    shows: Number(r.shows),
    total_daily_score: Number(r.total_daily_score),
    avg_score_per_show: Number(r.avg_score_per_show),
    share_pct: Number(r.share_pct),
  }));
}

export async function fetchSignalPoints(): Promise<SignalPoint[]> {
  const { data, error } = await client()
    .from('insights_signal_points')
    .select('series_id, slug, title, network_group, genre_group, observed_days, avg_wiki_views, avg_reddit_comments, avg_reddit_upvotes, avg_daily_score')
    .limit(500);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as SignalPoint[]).map((r) => ({
    ...r,
    avg_wiki_views: asNumber(r.avg_wiki_views),
    avg_reddit_comments: asNumber(r.avg_reddit_comments),
    avg_reddit_upvotes: asNumber(r.avg_reddit_upvotes),
    avg_daily_score: asNumber(r.avg_daily_score),
  }));
}
