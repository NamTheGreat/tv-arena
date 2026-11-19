import { ChartRange } from '../components/trajectoryChartTypes';
import { SvgPoint } from './svgMath';

export interface RankableSeries {
  id: string;
  title: string;
  daily_dates?: string[];
  daily_series: number[];
}

/**
 * Derives daily leaderboard ranks deterministically across a set of series.
 * Follows the SQL series_leaderboard / series_recent_telemetry invariant:
 * ORDER BY daily_score DESC, title ASC.
 *
 * Missing dates are NOT fabricated: each show receives rank entries
 * corresponding 1:1 with its existing daily_dates/daily_series entries.
 */
export function deriveHistoricalRanks<T extends RankableSeries>(
  shows: T[]
): Map<string, number[]> {
  const ranksByShowId = new Map<string, number[]>();
  for (const show of shows) {
    ranksByShowId.set(show.id, []);
  }

  // Group show observations by recorded_date
  // date -> array of { id, title, score, indexInShow }
  const dateBuckets = new Map<
    string,
    Array<{ id: string; title: string; score: number; index: number }>
  >();

  for (const show of shows) {
    const dates = show.daily_dates || [];
    const series = show.daily_series || [];
    const len = Math.min(dates.length, series.length);

    for (let i = 0; i < len; i++) {
      const date = dates[i];
      const score = Number(series[i] ?? 0);
      const list = dateBuckets.get(date) || [];
      list.push({ id: show.id, title: show.title, score, index: i });
      dateBuckets.set(date, list);
    }
  }

  // Pre-allocate arrays matching the show's date length
  const resultMap = new Map<string, number[]>();
  for (const show of shows) {
    const len = Math.min((show.daily_dates || []).length, (show.daily_series || []).length);
    resultMap.set(show.id, new Array(len).fill(0));
  }

  // Sort each date bucket deterministically: score DESC, title ASC
  for (const [, entries] of dateBuckets.entries()) {
    entries.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.title.localeCompare(b.title);
    });

    // Assign rank starting at 1
    entries.forEach((entry, rankIdx) => {
      const rank = rankIdx + 1;
      const showRanks = resultMap.get(entry.id);
      if (showRanks && entry.index < showRanks.length) {
        showRanks[entry.index] = rank;
      }
    });
  }

  return resultMap;
}

/**
 * Samples daily ranks into up to 7 buckets across the requested time range.
 * For aggregated buckets, calculates the average rank rounded to integer.
 */
export function sampleDailyRanks(
  dailyRanks: number[],
  range: ChartRange
): number[] {
  const days =
    range === '7D'
      ? 7
      : range === '30D'
      ? 30
      : range === '90D'
      ? 90
      : Math.max(7, dailyRanks.length);

  const window = dailyRanks.slice(-days);
  if (window.length <= 7) {
    return window;
  }

  const bucketSize = window.length / 7;
  const sampled: number[] = [];
  for (let b = 0; b < 7; b++) {
    const start = Math.floor(b * bucketSize);
    const end = Math.min(window.length, Math.floor((b + 1) * bucketSize));
    const slice = window.slice(start, Math.max(start + 1, end));
    if (slice.length === 0) continue;
    const avg = Math.round(slice.reduce((acc, v) => acc + v, 0) / slice.length);
    sampled.push(avg);
  }
  return sampled;
}

/**
 * Computes a clean maximum rank scale and 5 Y-axis tick definitions.
 * In a rank chart, #1 is at the top (pct: 1.0) and maxRank is at the bottom (pct: 0).
 */
export function calculateNiceRankScale(ranks: number[]): {
  maxRank: number;
  chartYTicks: Array<{ pct: number; val: number; label: string }>;
} {
  const validRanks = ranks.filter((r) => r > 0);
  const maxObserved = validRanks.length > 0 ? Math.max(...validRanks) : 10;

  // Provide a comfortable baseline scale (at least 5, rounded to next 5 or 10)
  let maxRank = Math.max(5, Math.ceil(maxObserved / 5) * 5);
  if (maxObserved > 20) {
    maxRank = Math.ceil(maxObserved / 10) * 10;
  }

  const tickQuarter = (maxRank - 1) * 0.25;
  const t75 = Math.round(1 + tickQuarter);
  const t50 = Math.round(1 + tickQuarter * 2);
  const t25 = Math.round(1 + tickQuarter * 3);

  const chartYTicks = [
    { pct: 1.0, val: 1, label: '#1' },
    { pct: 0.75, val: t75, label: `#${t75}` },
    { pct: 0.50, val: t50, label: `#${t50}` },
    { pct: 0.25, val: t25, label: `#${t25}` },
    { pct: 0, val: maxRank, label: `#${maxRank}` },
  ];

  return { maxRank, chartYTicks };
}

/**
 * Builds SVG geometry for desktop charts where Y is inverted:
 * Rank 1 maps to Y=40 (top), maxRank maps to Y=340 (bottom).
 */
export function buildRankChartGeometry(
  dailyRanks: number[],
  maxRank = 10
): {
  pathD: string;
  points: SvgPoint[];
} {
  const X_START = 85;
  const X_STEP = 145;
  const Y_ZERO = 340; // Bottom (maxRank)
  const Y_SPAN = 300; // Top is 40

  const recentValues = dailyRanks.slice(-7);
  if (recentValues.length === 0) {
    return { pathD: '', points: [] };
  }

  const startIdx = 7 - recentValues.length;
  const safeMax = Math.max(2, maxRank);

  const points: SvgPoint[] = recentValues.map((value, i) => {
    const gridIdx = startIdx + i;
    const x = X_START + gridIdx * X_STEP;
    const clamped = Math.max(1, Math.min(safeMax, value));
    // When clamped is 1: ratio is 1 -> y = Y_ZERO - Y_SPAN = 40 (Top)
    // When clamped is safeMax: ratio is 0 -> y = Y_ZERO = 340 (Bottom)
    const ratio = (safeMax - clamped) / (safeMax - 1);
    const y = Math.round(Y_ZERO - ratio * Y_SPAN);
    return { x, y, value };
  });

  const pathD = points.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x},${pt.y}`).join(' ');
  return { pathD, points };
}

/**
 * Builds SVG geometry for mobile charts where Y is inverted:
 * Rank 1 maps to Y=20 (top), maxRank maps to Y=162 (bottom).
 */
export function buildMobileRankChartGeometry(
  dailyRanks: number[],
  maxRank = 10
): {
  pathD: string;
  points: SvgPoint[];
} {
  const X_START = 35;
  const X_STEP = 49;
  const Y_ZERO = 162; // Bottom (maxRank)
  const Y_SPAN = 142; // Top is 20

  const recentValues = dailyRanks.slice(-7);
  if (recentValues.length === 0) {
    return { pathD: '', points: [] };
  }

  const startIdx = 7 - recentValues.length;
  const safeMax = Math.max(2, maxRank);

  const points: SvgPoint[] = recentValues.map((value, i) => {
    const gridIdx = startIdx + i;
    const x = X_START + gridIdx * X_STEP;
    const clamped = Math.max(1, Math.min(safeMax, value));
    const ratio = (safeMax - clamped) / (safeMax - 1);
    const y = Math.round(Y_ZERO - ratio * Y_SPAN);
    return { x, y, value };
  });

  const pathD = points.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x},${pt.y}`).join(' ');
  return { pathD, points };
}
