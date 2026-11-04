import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
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

describe('anonymous daily score transfer', () => {
  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('submits saved answers after sign-in when no server score exists', async () => {
    const date = getTodayDateString();
    const answers = ['higher', 'lower', 'higher', 'higher', 'lower', 'higher', 'lower', 'higher', 'lower', 'higher'] as const;
    localStorage.setItem(`tv_arena_daily_${date}`, JSON.stringify({
      date,
      score: 6,
      correctness: [true, true, false, true, false, true, false, true, false, true],
      answers,
      completedAt: new Date().toISOString(),
      verified: false,
    }));
    mocks.fetchDailyDeck.mockResolvedValue(['show-a', 'show-b']);
    mocks.fetchMyDailyScore.mockResolvedValue({ score: null, unavailable: false });
    mocks.submitDailyScore.mockResolvedValue({ success: true, score: 6, date });

    render(
      <TriviaGame
        seriesList={[
          { id: 'show-a', tmdb_id: 1, slug: 'show-a', title: 'Show A', network: 'A', network_group: 'Other', genre_group: '', release_years: '', chart_color: '', wiki_slug: '', reddit_query: '', buzz_score: 100, delta_pct: null, updated_at: null, daily_series: [] },
          { id: 'show-b', tmdb_id: 2, slug: 'show-b', title: 'Show B', network: 'B', network_group: 'Other', genre_group: '', release_years: '', chart_color: '', wiki_slug: '', reddit_query: '', buzz_score: 200, delta_pct: null, updated_at: null, daily_series: [] },
        ]}
      />
    );

    await waitFor(() => expect(mocks.submitDailyScore).toHaveBeenCalledWith(date, [...answers]));
  });
});
