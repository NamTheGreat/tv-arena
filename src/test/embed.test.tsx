import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import { EmbedLeaderboard } from '../components/EmbedLeaderboard';
import {
  buildSparklinePoints,
  EMBED_DEFAULT_LIMIT,
  isEmbedPath,
  readEmbedQuery,
  safeChartColor,
  selectEmbedShows,
} from '../lib/embed';
import type { SeriesItem } from '../lib/supabase';

vi.mock('../lib/supabase', () => ({ isSupabaseConfigured: false, supabase: null }));
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: null, signOut: vi.fn() }) }));

function show(index: number, overrides: Partial<SeriesItem> = {}): SeriesItem {
  return {
    id: `series-${index}`,
    tmdb_id: index,
    slug: `show-${index}`,
    title: `Show ${index}`,
    network: 'Net A',
    network_group: 'Net A',
    genre_group: 'Drama',
    release_years: '2024',
    chart_color: '#336699',
    wiki_slug: `Show_${index}`,
    reddit_query: `Show ${index}`,
    buzz_score: index * 1000,
    current_7d_score: index * 1000,
    previous_7d_score: 0,
    delta_pct: null,
    rank: 10 - index,
    updated_at: null,
    daily_series: [index, index + 2, index + 1],
    daily_dates: [],
    events: [],
    is_breakout: false,
    ...overrides,
  } as SeriesItem;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('embed query and selection', () => {
  it('recognises only the embed paths', () => {
    for (const path of ['/embed', '/embed/', '/embed/top5', '/embed/leaderboard']) expect(isEmbedPath(path)).toBe(true);
    for (const path of ['/', '/embedded', '/embed/other', '/embed/top5/x', '/show/embed']) expect(isEmbedPath(path)).toBe(false);
  });

  it('defaults and clamps limit, ignores junk', () => {
    const limit = (value: string) => readEmbedQuery(new URLSearchParams(value)).limit;
    expect(limit('')).toBe(EMBED_DEFAULT_LIMIT);
    expect(limit('limit=3')).toBe(3);
    expect(limit('limit=3.9')).toBe(3);
    expect(limit('limit=0')).toBe(1);
    expect(limit('limit=-4')).toBe(1);
    expect(limit('limit=99')).toBe(10);
    expect(limit('limit=abc')).toBe(EMBED_DEFAULT_LIMIT);
    expect(limit('limit=')).toBe(EMBED_DEFAULT_LIMIT);
  });

  it('reads platform and genre, treating ALL as no filter', () => {
    expect(readEmbedQuery(new URLSearchParams('platform=Netflix&genre=Drama'))).toMatchObject({ platform: 'Netflix', genre: 'Drama' });
    expect(readEmbedQuery(new URLSearchParams('platform=all&genre=ALL'))).toMatchObject({ platform: '', genre: '' });
  });

  it('sorts by score, filters case-insensitively and does not mutate the input', () => {
    const list = [
      show(1),
      show(2, { genre_group: 'Comedy', network_group: 'Net B' }),
      show(3),
      show(4, { genre_group: 'Comedy' }),
    ];
    const snapshot = list.map((item) => item.slug);
    expect(selectEmbedShows(list, { limit: 5, platform: '', genre: '' }).map((s) => s.slug)).toEqual(['show-4', 'show-3', 'show-2', 'show-1']);
    expect(selectEmbedShows(list, { limit: 5, platform: 'net a', genre: 'COMEDY' }).map((s) => s.slug)).toEqual(['show-4']);
    expect(selectEmbedShows(list, { limit: 2, platform: '', genre: '' })).toHaveLength(2);
    expect(selectEmbedShows(list, { limit: 5, platform: 'Nope', genre: '' })).toEqual([]);
    expect(list.map((item) => item.slug)).toEqual(snapshot);
  });

  it('falls back to network when network_group is missing', () => {
    const list = [show(1, { network_group: undefined as unknown as string, network: 'Net Z' })];
    expect(selectEmbedShows(list, { limit: 5, platform: 'net z', genre: '' })).toHaveLength(1);
  });
});

describe('sparkline helpers', () => {
  it('needs two finite points', () => {
    expect(buildSparklinePoints([], 72, 24)).toBeNull();
    expect(buildSparklinePoints([5], 72, 24)).toBeNull();
    expect(buildSparklinePoints([Number.NaN, 5], 72, 24)).toBeNull();
  });

  it('draws a flat midline for a constant series without NaN', () => {
    expect(buildSparklinePoints([7, 7, 7], 72, 24)).toBe('2.0,12.0 36.0,12.0 70.0,12.0');
  });

  it('maps the maximum to the top and the minimum to the bottom', () => {
    expect(buildSparklinePoints([0, 10], 72, 24)).toBe('2.0,22.0 70.0,2.0');
  });

  it('only allows hex colours into SVG attributes', () => {
    expect(safeChartColor('#aabbcc')).toBe('#aabbcc');
    expect(safeChartColor('red" onload="x')).toBe('#C66A3D');
    expect(safeChartColor(null)).toBe('#C66A3D');
  });
});

describe('EmbedLeaderboard', () => {
  const renderAt = (url: string, props: Partial<React.ComponentProps<typeof EmbedLeaderboard>> = {}) =>
    render(
      <MemoryRouter initialEntries={[url]}>
        <EmbedLeaderboard seriesList={[show(1), show(2), show(3), show(4), show(5), show(6), show(7)]} isLoading={false} {...props} />
      </MemoryRouter>
    );

  it('renders the top five with rank, sparkline, score and attribution', () => {
    renderAt('/embed');
    const rows = within(screen.getByRole('list', { name: /top shows/i })).getAllByRole('listitem');
    expect(rows).toHaveLength(5);
    expect(within(rows[0]).getByRole('link', { name: 'Show 7' })).toHaveAttribute('href', '/show/show-7');
    expect(within(rows[0]).getByRole('link', { name: 'Show 7' })).toHaveAttribute('target', '_blank');
    expect(within(rows[0]).getByRole('link', { name: 'Show 7' })).toHaveAttribute('rel', 'noopener');
    expect(within(rows[0]).getByText('7K')).toBeInTheDocument();
    expect(within(rows[0]).getByTestId('embed-sparkline')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'TV Arena' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('honours limit and filters, and adds a noindex meta tag', () => {
    const { unmount } = renderAt('/embed?limit=2');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(document.head.querySelector('meta[name="robots"][content="noindex"]')).not.toBeNull();
    unmount();
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
  });

  it('shows empty, loading and error states', () => {
    renderAt('/embed?genre=Horror');
    expect(screen.getByRole('status')).toHaveTextContent('No shows match this filter.');
    cleanup();
    renderAt('/embed', { seriesList: [], isLoading: true });
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    cleanup();
    renderAt('/embed', { seriesList: [], isLoading: false, error: 'boom' });
    expect(screen.getByRole('alert')).toHaveTextContent('temporarily unavailable');
  });
});

describe('App /embed route', () => {
  it('renders the widget from the snapshot with no app chrome', async () => {
    const snapshot = {
      generated_at: new Date().toISOString(),
      series: [show(1), show(2, { genre_group: 'Comedy' })],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(snapshot), { status: 200 })));
    render(
      <MemoryRouter initialEntries={['/embed/top5?genre=comedy']}>
        <App />
      </MemoryRouter>
    );
    expect(await screen.findByRole('link', { name: 'Show 2' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Show 1' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Main Navigation')).not.toBeInTheDocument();
    expect(screen.queryByText('Global TV Engagement Intelligence')).not.toBeInTheDocument();
  });
});
