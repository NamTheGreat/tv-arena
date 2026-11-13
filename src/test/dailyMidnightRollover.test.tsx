import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TriviaGame } from '../components/TriviaGame';
import { DailyResultCard } from '../components/DailyResultCard';

const mocks = vi.hoisted(() => ({
  user: null as { id: string } | null,
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

describe('Daily midnight rollover handling', () => {
  const testShows = Array.from({ length: 12 }, (_, i) => ({
    id: `show-${i + 1}`,
    tmdb_id: i + 1,
    slug: `show-${i + 1}`,
    title: `Show ${i + 1}`,
    network: 'Network',
    network_group: 'Other',
    genre_group: 'Drama',
    release_years: '2020-',
    chart_color: '#333333',
    wiki_slug: `show_${i + 1}`,
    reddit_query: `show_${i + 1}`,
    buzz_score: (i + 1) * 100,
    delta_pct: null,
    updated_at: null,
    daily_series: [(i + 1) * 100],
    daily_dates: ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07'],
  }));

  const deckIds = testShows.slice(0, 11).map((s) => s.id);

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mocks.user = null;
    mocks.fetchDailyDeck.mockResolvedValue(deckIds);
    mocks.fetchMyDailyScore.mockResolvedValue({ score: null, unavailable: false });
    mocks.submitDailyScore.mockResolvedValue({ success: true, score: 10, date: '2026-11-13' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('unverified result from yesterday does not trigger RPC when user is signed in today and displays day changed explanation', async () => {
    mocks.user = { id: 'user-1' };

    // Simulate an unverified result stored from yesterday
    const yesterdayDate = '2026-11-12';
    const yesterdayResult = {
      date: yesterdayDate,
      score: 7,
      correctness: [true, true, true, true, true, true, true, false, false, false],
      answers: ['higher', 'higher', 'higher', 'higher', 'higher', 'higher', 'higher', 'lower', 'lower', 'lower'] as ('higher' | 'lower')[],
      completedAt: '2026-11-12T23:59:00.000Z',
      verified: false,
    };
    localStorage.setItem(`tv_arena_daily_${yesterdayDate}`, JSON.stringify(yesterdayResult));

    render(<TriviaGame seriesList={testShows} />);

    // Start Daily Run
    const dailyTab = screen.getByRole('button', { name: /Daily Run/i });
    fireEvent.click(dailyTab);

    await waitFor(() => {
      expect(screen.getByText(/Daily Round/i)).toBeInTheDocument();
    });

    // Today's daily run is ready to play and NOT blocked by yesterday's stored result
    expect(screen.getByText('1 / 10')).toBeInTheDocument();
    expect(mocks.submitDailyScore).not.toHaveBeenCalled();
  });

  it('DailyResultCard for a past date shows device only explanation and provides play today action', () => {
    const onPlayToday = vi.fn();
    const onRetry = vi.fn();
    const yesterdayResult = {
      date: '2026-11-12',
      score: 7,
      correctness: [true, true, true, true, true, true, true, false, false, false],
      answers: ['higher', 'higher', 'higher', 'higher', 'higher', 'higher', 'higher', 'lower', 'lower', 'lower'] as ('higher' | 'lower')[],
      completedAt: '2026-11-12T23:59:00.000Z',
      verified: false,
    };

    render(
      <DailyResultCard
        result={yesterdayResult}
        isAuthenticated={true}
        isSubmitting={false}
        submissionError={null}
        onRetry={onRetry}
        todayDateStr="2026-11-13"
        onPlayToday={onPlayToday}
      />
    );

    expect(screen.getByText(/Saved on this device only/i)).toBeInTheDocument();
    expect(screen.getByText(/The challenge date \(2026-11-12\) has passed/i)).toBeInTheDocument();

    const playTodayBtn = screen.getByRole('button', { name: /Play today's challenge/i });
    fireEvent.click(playTodayBtn);
    expect(onPlayToday).toHaveBeenCalledTimes(1);

    // No retry saving score button should be present
    expect(screen.queryByRole('button', { name: /Retry saving score/i })).not.toBeInTheDocument();
  });
});
