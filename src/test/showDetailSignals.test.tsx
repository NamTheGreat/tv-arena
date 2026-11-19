import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { ShowDetailView } from '../components/ShowDetailView';
import { getSignalFreshness } from '../lib/signalFreshness';
import type { SeriesItem } from '../lib/supabase';

const baseShow: SeriesItem = {
  id: '00000000-0000-0000-0000-000000000001',
  tmdb_id: 114472,
  slug: 'severance',
  title: 'Severance',
  network: 'Apple TV+',
  network_group: 'Apple TV+',
  genre_group: 'Drama & Sci-Fi',
  release_years: '2022–Present',
  chart_color: '#4A7C59',
  buzz_score: 9500,
  current_7d_score: 9500,
  previous_7d_score: 8000,
  delta_pct: 18.75,
  daily_series: [1000, 1100, 1200, 1300, 1400, 1500, 1600],
  daily_dates: [
    '2026-11-10',
    '2026-11-11',
    '2026-11-12',
    '2026-11-13',
    '2026-11-14',
    '2026-11-15',
    '2026-11-16',
  ],
  updated_at: '2026-11-16T00:00:00Z',
  wiki_slug: 'Severance_(TV_series)',
  reddit_query: 'severance',
};

describe('getSignalFreshness unit tests', () => {
  const referenceDate = '2026-11-16';

  it('handles complete and fresh observation for both signals', () => {
    const show: SeriesItem = {
      ...baseShow,
      signal_contributions: {
        wiki_contribution: 6000,
        reddit_contribution: 3500,
        telemetry_days: 7,
        wiki_observed_days: 7,
        reddit_observed_days: 7,
        last_wiki_date: '2026-11-16',
        last_reddit_date: '2026-11-16',
      },
    };

    const freshness = getSignalFreshness(show, referenceDate);
    expect(freshness.wiki.status).toBe('fresh');
    expect(freshness.wiki.statusLabel).toBe('Fresh');
    expect(freshness.wiki.coverageLabel).toBe('7 of 7 days');
    expect(freshness.wiki.latestDate).toBe('2026-11-16');
    expect(freshness.wiki.scoreDisplay).toBe('6,000');
    expect(freshness.wiki.isMeasuredZero).toBe(false);

    expect(freshness.reddit.status).toBe('fresh');
    expect(freshness.reddit.statusLabel).toBe('Fresh');
    expect(freshness.reddit.coverageLabel).toBe('7 of 7 days');
    expect(freshness.reddit.latestDate).toBe('2026-11-16');
    expect(freshness.reddit.scoreDisplay).toBe('3,500');
    expect(freshness.reddit.isMeasuredZero).toBe(false);
  });

  it('detects stale observation when lag exceeds 2 days', () => {
    const show: SeriesItem = {
      ...baseShow,
      signal_contributions: {
        wiki_contribution: 5000,
        reddit_contribution: 1200,
        telemetry_days: 7,
        wiki_observed_days: 7,
        reddit_observed_days: 4,
        last_wiki_date: '2026-11-16',
        last_reddit_date: '2026-11-12', // 4 days prior to referenceDate -> stale
      },
    };

    const freshness = getSignalFreshness(show, referenceDate);
    expect(freshness.wiki.status).toBe('fresh');
    expect(freshness.reddit.status).toBe('stale');
    expect(freshness.reddit.statusLabel).toBe('Stale');
    expect(freshness.reddit.isStale).toBe(true);
    expect(freshness.reddit.coverageLabel).toBe('4 of 7 days');
    expect(freshness.reddit.latestDate).toBe('2026-11-12');
  });

  it('uses Wikipedia observation days rather than all telemetry days for coverage', () => {
    const show: SeriesItem = {
      ...baseShow,
      signal_contributions: {
        wiki_contribution: 1200,
        reddit_contribution: 300,
        telemetry_days: 7,
        wiki_observed_days: 2,
        reddit_observed_days: 7,
        last_wiki_date: '2026-11-16',
        last_reddit_date: '2026-11-16',
      },
    };

    const freshness = getSignalFreshness(show, referenceDate);
    expect(freshness.wiki.coverageLabel).toBe('2 of 7 days');
    expect(freshness.reddit.coverageLabel).toBe('7 of 7 days');
  });

  it('does not treat other-source telemetry as a Wikipedia observation', () => {
    const show: SeriesItem = {
      ...baseShow,
      signal_contributions: {
        wiki_contribution: 0,
        reddit_contribution: 300,
        telemetry_days: 7,
        wiki_observed_days: 0,
        reddit_observed_days: 7,
        last_wiki_date: null,
        last_reddit_date: '2026-11-16',
      },
    };

    const freshness = getSignalFreshness(show, referenceDate);
    expect(freshness.wiki.status).toBe('unobserved');
    expect(freshness.wiki.scoreDisplay).toBe('No data');
    expect(freshness.wiki.coverageLabel).toBe('0 of 7 days');
    expect(freshness.reddit.status).toBe('fresh');
  });

  it('distinguishes measured zero from unobserved / absent observations', () => {
    const showWithZero: SeriesItem = {
      ...baseShow,
      signal_contributions: {
        wiki_contribution: 4000,
        reddit_contribution: 0,
        telemetry_days: 7,
        wiki_observed_days: 7,
        reddit_observed_days: 7,
        last_wiki_date: '2026-11-16',
        last_reddit_date: '2026-11-16',
      },
    };

    const freshnessZero = getSignalFreshness(showWithZero, referenceDate);
    expect(freshnessZero.reddit.isMeasuredZero).toBe(true);
    expect(freshnessZero.reddit.isUnobserved).toBe(false);
    expect(freshnessZero.reddit.scoreDisplay).toBe('0');
    expect(freshnessZero.reddit.status).toBe('fresh');
    expect(freshnessZero.reddit.coverageLabel).toBe('7 of 7 days');

    const showUnobserved: SeriesItem = {
      ...baseShow,
      signal_contributions: {
        wiki_contribution: 4000,
        reddit_contribution: 0,
        telemetry_days: 7,
        wiki_observed_days: 7,
        reddit_observed_days: 0,
        last_wiki_date: '2026-11-16',
        last_reddit_date: null,
      },
    };

    const freshnessUnobserved = getSignalFreshness(showUnobserved, referenceDate);
    expect(freshnessUnobserved.reddit.isMeasuredZero).toBe(false);
    expect(freshnessUnobserved.reddit.isUnobserved).toBe(true);
    expect(freshnessUnobserved.reddit.scoreDisplay).toBe('No data');
    expect(freshnessUnobserved.reddit.status).toBe('unobserved');
    expect(freshnessUnobserved.reddit.statusLabel).toBe('Not observed');
    expect(freshnessUnobserved.reddit.coverageLabel).toBe('0 of 7 days');
    expect(freshnessUnobserved.reddit.latestDate).toBeNull();
  });
});

describe('ShowDetailView dossier signal freshness rendering', () => {
  const referenceDate = '2026-11-16';

  it('renders complete and fresh signal coverage and dates in the dossier', () => {
    const show: SeriesItem = {
      ...baseShow,
      signal_contributions: {
        wiki_contribution: 4800,
        reddit_contribution: 1550,
        telemetry_days: 7,
        wiki_observed_days: 7,
        reddit_observed_days: 7,
        last_wiki_date: '2026-11-16',
        last_reddit_date: '2026-11-16',
      },
    };

    render(
      <MemoryRouter initialEntries={['/show/severance']}>
        <Routes>
          <Route
            path="/show/:slug"
            element={<ShowDetailView seriesList={[show]} referenceDate={referenceDate} />}
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('7-Day Score Contributions')).toBeInTheDocument();
    expect(screen.getByText('4,800')).toBeInTheDocument();
    expect(screen.getByText('1,550')).toBeInTheDocument();

    const freshBadges = screen.getAllByText('Fresh');
    expect(freshBadges).toHaveLength(2);

    const coverageElements = screen.getAllByText('7 of 7 days');
    expect(coverageElements).toHaveLength(2);

    const latestDateElements = screen.getAllByText('2026-11-16');
    expect(latestDateElements.length).toBeGreaterThanOrEqual(2);
  });

  it('renders partial coverage and stale status when a signal stopped updating', () => {
    const show: SeriesItem = {
      ...baseShow,
      signal_contributions: {
        wiki_contribution: 3200,
        reddit_contribution: 800,
        telemetry_days: 7,
        wiki_observed_days: 2,
        reddit_observed_days: 3,
        last_wiki_date: '2026-11-16',
        last_reddit_date: '2026-11-11', // 5 days old
      },
    };

    render(
      <MemoryRouter initialEntries={['/show/severance']}>
        <Routes>
          <Route
            path="/show/:slug"
            element={<ShowDetailView seriesList={[show]} referenceDate={referenceDate} />}
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Fresh')).toBeInTheDocument();
    expect(screen.getByText('Stale')).toBeInTheDocument();
    expect(screen.getByText('3 of 7 days')).toBeInTheDocument();
    expect(screen.getByText('2 of 7 days')).toBeInTheDocument();
    expect(screen.getByText('2026-11-11')).toBeInTheDocument();
  });

  it('visibly distinguishes measured zero from absent observation', () => {
    const show: SeriesItem = {
      ...baseShow,
      signal_contributions: {
        wiki_contribution: 2500,
        reddit_contribution: 0,
        telemetry_days: 7,
        wiki_observed_days: 7,
        reddit_observed_days: 7,
        last_wiki_date: '2026-11-16',
        last_reddit_date: '2026-11-16',
      },
    };

    render(
      <MemoryRouter initialEntries={['/show/severance']}>
        <Routes>
          <Route
            path="/show/:slug"
            element={<ShowDetailView seriesList={[show]} referenceDate={referenceDate} />}
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('(measured zero)')).toBeInTheDocument();
  });

  it('renders absent signal states when telemetry is missing', () => {
    const show: SeriesItem = {
      ...baseShow,
      signal_contributions: {
        wiki_contribution: 0,
        reddit_contribution: 0,
        telemetry_days: 0,
        wiki_observed_days: 0,
        reddit_observed_days: 0,
        last_wiki_date: null,
        last_reddit_date: null,
      },
    };

    render(
      <MemoryRouter initialEntries={['/show/severance']}>
        <Routes>
          <Route
            path="/show/:slug"
            element={<ShowDetailView seriesList={[show]} referenceDate={referenceDate} />}
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('No telemetry history is available for this period.')).toBeInTheDocument();
    const notObservedBadges = screen.getAllByText('Not observed');
    expect(notObservedBadges).toHaveLength(2);

    const noDataElements = screen.getAllByText('No data');
    expect(noDataElements).toHaveLength(2);

    const noneElements = screen.getAllByText('None');
    expect(noneElements).toHaveLength(2);
  });
});
