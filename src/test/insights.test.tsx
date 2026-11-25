import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  linearRegression,
  buildScatter,
  pivotShares,
  describeStrength,
  type SignalPoint,
  type PlatformShareRow,
  type GenreShareRow,
} from '../lib/insights';

const mocks = vi.hoisted(() => ({ fetchPlatformShares: vi.fn(), fetchGenreShares: vi.fn(), fetchSignalPoints: vi.fn() }));
vi.mock('../lib/supabase', () => ({ isSupabaseConfigured: true, supabase: {} }));
vi.mock('../lib/insights', async (orig) => ({ ...(await orig<typeof import('../lib/insights')>()), ...mocks }));

import { InsightsView } from '../components/InsightsView';
import { LineChart, ScatterChart } from '../components/InsightCharts';

const sp = (over: Partial<SignalPoint>): SignalPoint => ({
  series_id: 'id', slug: 's', title: 'S', network_group: 'N', genre_group: 'G', observed_days: 7,
  avg_wiki_views: 100, avg_reddit_comments: 10, avg_reddit_upvotes: 50, avg_daily_score: 1000, ...over,
});

describe('linearRegression', () => {
  it('fits a perfect line exactly', () => {
    const fit = linearRegression([{ x: 1, y: 3 }, { x: 2, y: 5 }, { x: 3, y: 7 }, { x: 4, y: 9 }])!;
    expect(fit.slope).toBeCloseTo(2, 12);
    expect(fit.intercept).toBeCloseTo(1, 12);
    expect(fit.r2).toBeCloseTo(1, 12);
    expect(fit.r).toBeCloseTo(1, 12);
  });

  it('matches a hand-computed noisy example', () => {
    // x: 1..5, y: 2,4,5,4,5 -> slope 0.6, intercept 2.2, r = 0.7746, r2 = 0.6
    const fit = linearRegression([1, 2, 3, 4, 5].map((x, i) => ({ x, y: [2, 4, 5, 4, 5][i] })))!;
    expect(fit.slope).toBeCloseTo(0.6, 10);
    expect(fit.intercept).toBeCloseTo(2.2, 10);
    expect(fit.r2).toBeCloseTo(0.6, 10);
    expect(fit.r).toBeCloseTo(Math.sqrt(0.6), 10);
  });

  it('reports a negative correlation with positive r2', () => {
    const fit = linearRegression([{ x: 1, y: 9 }, { x: 2, y: 6 }, { x: 3, y: 3 }])!;
    expect(fit.r).toBeCloseTo(-1, 12);
    expect(fit.r2).toBeCloseTo(1, 12);
    expect(fit.slope).toBeCloseTo(-3, 12);
  });

  it('refuses degenerate input', () => {
    expect(linearRegression([])).toBeNull();
    expect(linearRegression([{ x: 1, y: 1 }, { x: 2, y: 2 }])).toBeNull();
    expect(linearRegression([{ x: 1, y: 5 }, { x: 2, y: 5 }, { x: 3, y: 5 }])).toBeNull();
    expect(linearRegression([{ x: 2, y: 1 }, { x: 2, y: 2 }, { x: 2, y: 3 }])).toBeNull();
  });

  it('labels strength bands', () => {
    expect([0.7, 0.3, 0.1, 0.01].map(describeStrength)).toEqual(['strong', 'moderate', 'weak', 'negligible']);
  });
});

describe('buildScatter', () => {
  it('skips shows missing either signal instead of treating them as zero', () => {
    const rows = [sp({ slug: 'a' }), sp({ slug: 'b', avg_reddit_comments: null }), sp({ slug: 'c', avg_wiki_views: null })];
    const data = buildScatter(rows, 'avg_wiki_views', 'avg_reddit_comments', false);
    expect(data.points.map((p) => p.slug)).toEqual(['a']);
  });

  it('applies ln(1 + x) on log scale', () => {
    const data = buildScatter([sp({ avg_wiki_views: 99, avg_reddit_comments: 0 })], 'avg_wiki_views', 'avg_reddit_comments', true);
    expect(data.points[0].x).toBeCloseTo(Math.log(100), 12);
    expect(data.points[0].y).toBe(0);
  });

  it('keeps the log fit tighter for heavy-tailed data', () => {
    const rows = [1, 10, 100, 1000, 100000].map((v, i) => sp({ slug: `s${i}`, avg_wiki_views: v, avg_reddit_comments: Math.round(v / 10) + (i % 2) }));
    const linear = buildScatter(rows, 'avg_wiki_views', 'avg_reddit_comments', false).regression!;
    const log = buildScatter(rows, 'avg_wiki_views', 'avg_reddit_comments', true).regression!;
    expect(linear.r2).toBeGreaterThan(0.99);
    expect(log.r2).toBeGreaterThan(0.95);
  });
});

describe('pivotShares', () => {
  const rows: PlatformShareRow[] = [
    { week_start: '2026-11-02', network_group: 'Netflix', shows: 40, share_pct: 40, score_share_pct: 50, ranked_shows: 100 },
    { week_start: '2026-11-02', network_group: 'HBO', shows: 10, share_pct: 10, score_share_pct: 10, ranked_shows: 100 },
    { week_start: '2026-11-09', network_group: 'Netflix', shows: 30, share_pct: 30, score_share_pct: 40, ranked_shows: 100 },
    { week_start: '2026-11-09', network_group: 'Apple TV+', shows: 5, share_pct: 5, score_share_pct: 9, ranked_shows: 100 },
    { week_start: '2026-11-09', network_group: 'Hulu', shows: 3, share_pct: 3, score_share_pct: 2, ranked_shows: 100 },
  ];

  it('orders weeks, keeps the top categories, folds the rest into Other, and fills absent weeks with 0', () => {
    const chart = pivotShares(rows, (r) => r.network_group, (r) => r.share_pct, 2);
    expect(chart.labels).toEqual(['2026-11-02', '2026-11-09']);
    expect(chart.series.map((s) => s.name)).toEqual(['Netflix', 'Apple TV+', 'Other']);
    expect(chart.series[0].values).toEqual([40, 30]);
    expect(chart.series[1].values).toEqual([0, 5]);
    expect(chart.series[2].values).toEqual([10, 3]); // HBO (week 1) and Hulu (week 2)
  });

  it('returns an empty chart for no rows and no Other series when everything fits', () => {
    expect(pivotShares([], (r: PlatformShareRow) => r.network_group, (r) => r.share_pct)).toEqual({ labels: [], series: [] });
    expect(pivotShares(rows, (r) => r.network_group, (r) => r.share_pct, 5).series.map((s) => s.name)).not.toContain('Other');
  });
});

describe('charts are responsive', () => {
  it('scale with their container via viewBox and never set fixed pixel sizes', () => {
    const { container } = render(
      <>
        <LineChart title="t" labels={['2026-11-02', '2026-11-09']} series={[{ name: 'A', color: '#000', values: [10, 20] }]} />
        <ScatterChart title="s" xLabel="x" yLabel="y" points={[{ x: 1, y: 1, title: 'a' }, { x: 2, y: 3, title: 'b' }, { x: 3, y: 2, title: 'c' }]} regression={null} logScale={false} />
      </>,
    );
    const svgs = container.querySelectorAll('svg');
    expect(svgs).toHaveLength(2);
    svgs.forEach((svg) => {
      expect(svg.getAttribute('viewBox')).toBe('0 0 640 260');
      expect(svg.getAttribute('width')).toBeNull();
      expect(svg.getAttribute('height')).toBeNull();
      expect(svg.getAttribute('class')).toMatch(/w-full/);
      expect(svg.getAttribute('class')).toMatch(/h-auto/);
    });
  });

  it('exposes chart data to screen readers as a table', () => {
    const { container } = render(<LineChart title="Share" labels={['2026-11-02']} series={[{ name: 'Netflix', color: '#000', values: [40] }]} />);
    const table = container.querySelector('table.sr-only')!;
    expect(within(table as HTMLElement).getByText('Netflix')).toBeTruthy();
    expect(table.textContent).toMatch(/40%/);
  });
});

describe('InsightsView', () => {
  const platforms: PlatformShareRow[] = [
    { week_start: '2026-11-09', network_group: 'Netflix', shows: 30, share_pct: 30, score_share_pct: 40, ranked_shows: 100 },
    { week_start: '2026-11-09', network_group: 'HBO', shows: 20, share_pct: 20, score_share_pct: 25, ranked_shows: 100 },
  ];
  const genres: GenreShareRow[] = [
    { week_start: '2026-11-09', genre_group: 'Drama', shows: 12, total_daily_score: 90000, avg_score_per_show: 7500, share_pct: 60 },
  ];
  const points = [1, 2, 3, 4, 5].map((n) => sp({ slug: `s${n}`, title: `Show ${n}`, avg_wiki_views: n * 100, avg_reddit_comments: n * 10, avg_reddit_upvotes: n * 7 + (n % 2), avg_daily_score: n * 1000 }));

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchPlatformShares.mockResolvedValue(platforms);
    mocks.fetchGenreShares.mockResolvedValue(genres);
    mocks.fetchSignalPoints.mockResolvedValue(points);
  });

  const renderView = () => render(<MemoryRouter><InsightsView /></MemoryRouter>);

  it('renders platform share, genre trajectories and the explorer', async () => {
    renderView();
    expect(await screen.findByText('Platform share of the top 100')).toBeTruthy();
    expect(screen.getByText(/30% of shows \(30\/100\) · 40% of buzz/)).toBeTruthy();
    expect(screen.getByText('Genre engagement trajectories')).toBeTruthy();
    expect(screen.getByText(/60% of engagement · 12 shows/)).toBeTruthy();
    expect(screen.getAllByTestId('line-chart')).toHaveLength(2);
    expect(screen.getByTestId('scatter-chart')).toBeTruthy();
  });

  it('shows regression metrics and a trendline, and updates when the signal pair changes', async () => {
    renderView();
    await screen.findByTestId('scatter-chart');
    // wiki vs comments is perfectly linear in the fixture
    expect(screen.getByTestId('metric-n').textContent).toBe('5');
    expect(Number(screen.getByTestId('metric-r2').textContent)).toBeGreaterThan(0.9);
    expect(screen.getByTestId('trendline')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Y axis'), { target: { value: 'avg_reddit_upvotes' } });
    expect(screen.getByTestId('metric-n').textContent).toBe('5');
    fireEvent.click(screen.getByLabelText('Log scale'));
    expect(screen.getByTestId('metric-r2').textContent).toMatch(/^\d\.\d{3}$/);
  });

  it('asks for two different signals when both axes match', async () => {
    renderView();
    await screen.findByTestId('scatter-chart');
    fireEvent.change(screen.getByLabelText('Y axis'), { target: { value: 'avg_wiki_views' } });
    expect(screen.getByRole('status').textContent).toMatch(/two different signals/);
  });

  it('handles empty data and load errors', async () => {
    mocks.fetchPlatformShares.mockResolvedValueOnce([]);
    mocks.fetchGenreShares.mockResolvedValueOnce([]);
    mocks.fetchSignalPoints.mockResolvedValueOnce([]);
    const { unmount } = renderView();
    expect(await screen.findByText(/Not enough history yet/)).toBeTruthy();
    unmount();
    mocks.fetchPlatformShares.mockRejectedValueOnce(new Error('relation does not exist'));
    renderView();
    expect((await screen.findByRole('alert')).textContent).toMatch(/relation does not exist/);
  });
});
