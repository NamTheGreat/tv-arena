import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { getTodayDateString } from '../lib/dailyChallenge';
import { TriviaGame } from '../components/TriviaGame';

const mocks = vi.hoisted(() => ({
  user: { id: 'user-1' },
  fetchDailyDeck: vi.fn(),
  fetchMyDailyScore: vi.fn(),
  fetchDailyLeaderboard: vi.fn(),
  fetchStreakLeaderboard: vi.fn(),
  submitDailyScore: vi.fn(),
}));

vi.mock('../lib/auth', () => ({
  useAuth: () => ({ user: mocks.user, loading: false }),
}));

vi.mock('../lib/dailyChallenge', async () => {
  const actual = await vi.importActual<typeof import('../lib/dailyChallenge')>('../lib/dailyChallenge');
  return {
    ...actual,
    fetchDailyDeck: mocks.fetchDailyDeck,
    fetchMyDailyScore: mocks.fetchMyDailyScore,
    fetchDailyLeaderboard: mocks.fetchDailyLeaderboard,
    fetchStreakLeaderboard: mocks.fetchStreakLeaderboard,
    submitDailyScore: mocks.submitDailyScore,
  };
});

describe('frozen daily challenge scores in TriviaGame', () => {
  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  const baseShows = [
    {
      id: 'show-a',
      tmdb_id: 1,
      slug: 'show-a',
      title: 'Show Alpha',
      network: 'HBO',
      network_group: 'HBO',
      genre_group: 'Drama',
      release_years: '2024',
      chart_color: '#fff',
      wiki_slug: 'Show_Alpha',
      reddit_query: 'Show Alpha',
      buzz_score: 100, // live score is 100
      delta_pct: null,
      updated_at: null,
      daily_series: [],
    },
    {
      id: 'show-b',
      tmdb_id: 2,
      slug: 'show-b',
      title: 'Show Beta',
      network: 'Netflix',
      network_group: 'Netflix',
      genre_group: 'Sci-Fi',
      release_years: '2024',
      chart_color: '#000',
      wiki_slug: 'Show_Beta',
      reddit_query: 'Show Beta',
      buzz_score: 200, // live score is 200
      delta_pct: null,
      updated_at: null,
      daily_series: [],
    },
  ];

  it('renders frozen scores on benchmark card rather than live scores', async () => {
    mocks.fetchDailyDeck.mockResolvedValue({
      seriesIds: ['show-a', 'show-b'],
      seriesScores: {
        'show-a': 999_999, // frozen snapshot overrides live 100
        'show-b': 123_456,
      },
    });
    mocks.fetchMyDailyScore.mockResolvedValue({ score: null, unavailable: false });

    render(<TriviaGame seriesList={baseShows} />);

    // Switch to daily mode
    const dailyTab = screen.getByRole('button', { name: /daily run/i });
    fireEvent.click(dailyTab);

    // Wait for the benchmark card to render with the frozen score 999,999
    await waitFor(() => {
      expect(screen.getByText('Show Alpha')).toBeInTheDocument();
      expect(screen.getByText('999,999')).toBeInTheDocument();
    });
  });

  it('falls back to live seriesList scores when frozen scores are null', async () => {
    mocks.fetchDailyDeck.mockResolvedValue({
      seriesIds: ['show-a', 'show-b'],
      seriesScores: null,
    });
    mocks.fetchMyDailyScore.mockResolvedValue({ score: null, unavailable: false });

    render(<TriviaGame seriesList={baseShows} />);

    const dailyTab = screen.getByRole('button', { name: /daily run/i });
    fireEvent.click(dailyTab);

    await waitFor(() => {
      expect(screen.getByText('Show Alpha')).toBeInTheDocument();
      expect(screen.getByText('100')).toBeInTheDocument();
    });
  });
});
