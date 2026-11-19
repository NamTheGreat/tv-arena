import React from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  deriveHistoricalRanks,
  sampleDailyRanks,
  calculateNiceRankScale,
  buildRankChartGeometry,
  buildMobileRankChartGeometry,
} from '../lib/historicalRank';
import { TrajectoryChart } from '../components/TrajectoryChart';
import { ShowDetailView } from '../components/ShowDetailView';
import { SeriesItem } from '../lib/supabase';

describe('historicalRank domain logic', () => {
  it('breaks ties deterministically by title ASC matching SQL series_leaderboard', () => {
    const shows = [
      {
        id: 'show-z',
        title: 'Zebra',
        daily_dates: ['2026-11-01'],
        daily_series: [1000],
      },
      {
        id: 'show-a',
        title: 'Alpha',
        daily_dates: ['2026-11-01'],
        daily_series: [1000],
      },
      {
        id: 'show-m',
        title: 'Middle',
        daily_dates: ['2026-11-01'],
        daily_series: [1000],
      },
    ];

    const ranks = deriveHistoricalRanks(shows);

    // Alpha (rank 1), Middle (rank 2), Zebra (rank 3)
    expect(ranks.get('show-a')).toEqual([1]);
    expect(ranks.get('show-m')).toEqual([2]);
    expect(ranks.get('show-z')).toEqual([3]);
  });

  it('ranks higher daily scores above lower scores regardless of title', () => {
    const shows = [
      {
        id: 'show-a',
        title: 'Alpha',
        daily_dates: ['2026-11-01', '2026-11-02'],
        daily_series: [100, 500],
      },
      {
        id: 'show-z',
        title: 'Zebra',
        daily_dates: ['2026-11-01', '2026-11-02'],
        daily_series: [500, 100],
      },
    ];

    const ranks = deriveHistoricalRanks(shows);

    // Day 1: Zebra has 500 (rank 1), Alpha has 100 (rank 2)
    // Day 2: Alpha has 500 (rank 1), Zebra has 100 (rank 2)
    expect(ranks.get('show-a')).toEqual([2, 1]);
    expect(ranks.get('show-z')).toEqual([1, 2]);
  });

  it('does NOT fabricate missing dates for shows without telemetry on that date', () => {
    const shows = [
      {
        id: 'show-1',
        title: 'Continuous Show',
        daily_dates: ['2026-11-01', '2026-11-02', '2026-11-03'],
        daily_series: [300, 300, 300],
      },
      {
        id: 'show-2',
        title: 'Late Premiering Show',
        daily_dates: ['2026-11-03'],
        daily_series: [500],
      },
    ];

    const ranks = deriveHistoricalRanks(shows);

    // Show 1 has 3 dates: on day 1 & 2 it was rank 1 alone; on day 3 Show 2 (500) beat it (300)
    expect(ranks.get('show-1')).toEqual([1, 1, 2]);
    // Show 2 only has 1 date; it does NOT get fabricated dates for day 1 or 2
    expect(ranks.get('show-2')).toEqual([1]);
  });

  it('samples daily ranks over 7D, 30D and 90D windows', () => {
    const shortSeries = [1, 2, 3, 2, 1];
    expect(sampleDailyRanks(shortSeries, '7D')).toEqual([1, 2, 3, 2, 1]);

    const longSeries = Array.from({ length: 28 }, (_, i) => (i % 2 === 0 ? 2 : 4));
    const sampled = sampleDailyRanks(longSeries, '30D');
    expect(sampled.length).toBe(7);
    expect(sampled.every((r) => r === 3)).toBe(true);
  });

  it('calculates nice rank scale with #1 at the top and maxRank at the bottom', () => {
    const scale = calculateNiceRankScale([1, 3, 7, 8]);
    expect(scale.maxRank).toBe(10);
    expect(scale.chartYTicks[0]).toEqual({ pct: 1.0, val: 1, label: '#1' });
    expect(scale.chartYTicks[4]).toEqual({ pct: 0, val: 10, label: '#10' });
  });

  it('inverts SVG geometry so Rank 1 is at the top of the chart', () => {
    // Desktop: top is Y=40, bottom is Y=340
    const desktopGeo = buildRankChartGeometry([1, 10], 10);
    expect(desktopGeo.points[0].y).toBe(40); // Rank 1 is at top (Y=40)
    expect(desktopGeo.points[1].y).toBe(340); // Rank 10 is at bottom (Y=340)

    // Mobile: top is Y=20, bottom is Y=162
    const mobileGeo = buildMobileRankChartGeometry([1, 10], 10);
    expect(mobileGeo.points[0].y).toBe(20); // Rank 1 is at top (Y=20)
    expect(mobileGeo.points[1].y).toBe(162); // Rank 10 is at bottom (Y=162)
  });
});

describe('TrajectoryChart Metric Switcher', () => {
  function makeShow(slug: string, title: string, ranks: number[]): SeriesItem {
    return {
      id: slug,
      tmdb_id: 100,
      slug,
      title,
      network: 'HBO Max',
      network_group: 'HBO',
      genre_group: 'Drama',
      release_years: '2022–present',
      chart_color: '#c66a3d',
      wiki_slug: slug,
      reddit_query: slug,
      buzz_score: 500000,
      delta_pct: 5.2,
      updated_at: null,
      daily_series: [400000, 420000, 450000, 500000],
      daily_dates: ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'],
      daily_ranks: ranks,
    };
  }

  it('toggles between Engagement Score and Leaderboard Rank', () => {
    const shows = [
      makeShow('house-of-dragon', 'House of the Dragon', [1, 1, 2, 1]),
      makeShow('succession', 'Succession', [2, 2, 1, 2]),
    ];

    render(
      <MemoryRouter>
        <TrajectoryChart
          seriesList={shows}
          chartRange="7D"
          setChartRange={() => undefined}
        />
      </MemoryRouter>
    );

    // Initial default is Score
    expect(screen.getByText(/Daily Active Household Viewers/)).toBeInTheDocument();

    // Click Rank button
    const rankBtn = screen.getByRole('button', { name: 'Rank' });
    fireEvent.click(rankBtn);

    // Header updates to Leaderboard Rank
    expect(screen.getByText(/Daily Leaderboard Rank/)).toBeInTheDocument();
    // Explanatory note rendered
    expect(screen.getAllByText(/Historical rank is a relative measure/i).length).toBeGreaterThan(0);
  });
});

describe('ShowDetailView Rank Trajectory', () => {
  it('toggles 90-day trajectory between Score and Rank', () => {
    const show: SeriesItem = {
      id: 'severance',
      tmdb_id: 200,
      slug: 'severance',
      title: 'Severance',
      network: 'Apple TV+',
      network_group: 'Apple TV+',
      genre_group: 'Sci-Fi',
      release_years: '2022–present',
      chart_color: '#5c828c',
      wiki_slug: 'severance',
      reddit_query: 'severance',
      buzz_score: 750000,
      delta_pct: 12.0,
      updated_at: null,
      daily_series: [600000, 650000, 700000, 750000],
      daily_dates: ['2026-10-01', '2026-10-15', '2026-11-01', '2026-11-15'],
      daily_ranks: [3, 2, 1, 1],
    };

    render(
      <MemoryRouter initialEntries={['/show/severance']}>
        <Routes>
          <Route path="/show/:slug" element={<ShowDetailView seriesList={[show]} />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Severance')).toBeInTheDocument();
    expect(screen.getByText('90-Day Trajectory')).toBeInTheDocument();

    // Toggle to Rank
    const rankBtn = screen.getByRole('button', { name: 'Rank' });
    fireEvent.click(rankBtn);

    // Displays peak rank indicator and relative measure note
    expect(screen.getByText(/Peak: #1/)).toBeInTheDocument();
    expect(screen.getByText(/Historical rank is a relative measure showing daily standing/)).toBeInTheDocument();
  });
});
