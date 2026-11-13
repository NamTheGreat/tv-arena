import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

describe('TriviaGame timer and finish guards', () => {
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
    mocks.fetchDailyDeck.mockResolvedValue(deckIds);
    mocks.fetchMyDailyScore.mockResolvedValue({ score: null, unavailable: false });
    mocks.submitDailyScore.mockResolvedValue({ success: true, score: 10, date: '2026-11-13' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('switching to Endless while daily auto-advance timer is pending clears the timer and does not advance', async () => {
    render(<TriviaGame seriesList={testShows} />);

    // Start Daily Run
    const dailyTab = screen.getByRole('button', { name: /Daily Run/i });
    fireEvent.click(dailyTab);

    await waitFor(() => {
      expect(screen.getByText(/Daily Round/i)).toBeInTheDocument();
    });

    expect(screen.getByText('1 / 10')).toBeInTheDocument();

    // Use fake timers to control auto-advance
    vi.useFakeTimers();

    // Make correct guess (Show 2 is 200 vs Show 1 is 100 -> Higher is correct)
    const higherBtn = screen.getByRole('button', { name: /Higher/i });
    act(() => {
      fireEvent.click(higherBtn);
    });

    expect(screen.getByText(/Correct!/i)).toBeInTheDocument();

    // While auto-advance timer is pending (1250ms), switch to Endless mode
    const endlessTab = screen.getByRole('button', { name: /Endless Streak/i });
    act(() => {
      fireEvent.click(endlessTab);
    });

    // Fast-forward past auto-advance duration
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    // Switch back to Daily mode
    act(() => {
      fireEvent.click(dailyTab);
    });

    // Should still be on Round 1, NOT advanced to Round 2 by a ghost timer
    expect(screen.getByText('1 / 10')).toBeInTheDocument();
  });

  it('disables Complete Run button while finishing and submits exactly once', async () => {
    render(<TriviaGame seriesList={testShows} />);

    const dailyTab = screen.getByRole('button', { name: /Daily Run/i });
    fireEvent.click(dailyTab);

    await waitFor(() => {
      expect(screen.getByText(/Daily Round/i)).toBeInTheDocument();
    });

    vi.useFakeTimers();

    // Play rounds 1 to 9
    for (let r = 0; r < 9; r++) {
      const higherBtn = screen.getByRole('button', { name: /Higher/i });
      act(() => {
        fireEvent.click(higherBtn);
      });
      // Advance auto-advance timer (1250ms) + slide timer (320ms)
      act(() => {
        vi.advanceTimersByTime(1600);
      });
    }

    expect(screen.getByText('10 / 10')).toBeInTheDocument();

    // Guess round 10
    const higherBtn = screen.getByRole('button', { name: /Higher/i });
    act(() => {
      fireEvent.click(higherBtn);
    });

    // The Complete Run button should be present and clickable
    const completeBtn = screen.getByRole('button', { name: /Complete Run/i });
    expect(completeBtn).not.toBeDisabled();

    // Click Complete Run (and simulate rapid multi-clicks)
    act(() => {
      fireEvent.click(completeBtn);
      fireEvent.click(completeBtn);
    });

    // Let the auto-finish timer run past 1,250ms
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    // submitDailyScore should only be called once
    expect(mocks.submitDailyScore).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Challenge Complete/i)).toBeInTheDocument();
  });
});
