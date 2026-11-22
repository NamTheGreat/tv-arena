import type { SeriesItem } from './supabase';

export const EMBED_DEFAULT_LIMIT = 5;
export const EMBED_MIN_LIMIT = 1;
export const EMBED_MAX_LIMIT = 10;

export interface EmbedQuery {
  limit: number;
  platform: string;
  genre: string;
}

/** Paths that render the chrome-less embed widget. */
const EMBED_PATH = /^\/embed(?:\/(?:top5|leaderboard))?\/?$/;

export function isEmbedPath(pathname: string): boolean {
  return EMBED_PATH.test(pathname);
}

function readFilter(params: URLSearchParams, key: string): string {
  const value = (params.get(key) ?? '').trim();
  return value.toUpperCase() === 'ALL' ? '' : value.slice(0, 60);
}

/** Parse and clamp the public query string. Never throws on bad input. */
export function readEmbedQuery(params: URLSearchParams): EmbedQuery {
  const raw = params.get('limit');
  const parsed = raw === null || raw.trim() === '' ? Number.NaN : Number(raw);
  const limit = Number.isFinite(parsed)
    ? Math.min(EMBED_MAX_LIMIT, Math.max(EMBED_MIN_LIMIT, Math.floor(parsed)))
    : EMBED_DEFAULT_LIMIT;
  return {
    limit,
    platform: readFilter(params, 'platform'),
    genre: readFilter(params, 'genre'),
  };
}

function sameGroup(value: string | null | undefined, wanted: string): boolean {
  return (value ?? '').trim().toLowerCase() === wanted.trim().toLowerCase();
}

/** Top shows by score, same ordering as the main leaderboard, after optional filters. */
export function selectEmbedShows(seriesList: SeriesItem[], query: EmbedQuery): SeriesItem[] {
  return seriesList
    .filter((show) => !query.platform || sameGroup(show.network_group ?? show.network, query.platform))
    .filter((show) => !query.genre || sameGroup(show.genre_group, query.genre))
    .sort((a, b) =>
      Number(b.buzz_score || 0) - Number(a.buzz_score || 0)
      || (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER)
      || a.title.localeCompare(b.title)
    )
    .slice(0, query.limit);
}

/**
 * Build an SVG polyline `points` string for a sparkline.
 * Returns null when there are fewer than two finite values to draw.
 * A constant series is drawn as a flat line through the middle.
 */
export function buildSparklinePoints(values: number[], width: number, height: number, padding = 2): string | null {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length < 2) return null;
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const range = max - min;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  return finite
    .map((value, index) => {
      const x = padding + (index / (finite.length - 1)) * innerWidth;
      const y = range === 0 ? height / 2 : padding + (1 - (value - min) / range) * innerHeight;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

/** Only accept plain hex colours from data before putting them in an SVG attribute. */
export function safeChartColor(color: string | null | undefined, fallback = '#C66A3D'): string {
  return color && /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : fallback;
}
