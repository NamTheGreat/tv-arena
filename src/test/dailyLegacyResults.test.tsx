import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('Daily legacy results without answers handling', () => {
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
  });

  it('legacy result without answers renders device only and offers Clear saved result', () => {
    const onClearSavedResult = vi.fn();
    const legacyResult = {
      date: '2026-11-13',
      score: 6,
      correctness: [true, true, true, true, true, true, false, false, false, false],
      answers: undefined as any,
      completedAt: '2026-11-13T10:00:00.000Z',
      verified: false,
    };

    render(
      <DailyResultCard
        result={legacyResult}
        isAuthenticated={true}
        isSubmitting={false}
        submissionError={null}
        onRetry={vi.fn()}
        onClearSavedResult={onClearSavedResult}
      />
    );

    expect(screen.getByText(/Saved on this device only/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Retry saving score/i })).not.toBeInTheDocument();

    const clearBtn = screen.getByRole('button', { name: /Clear saved result/i });
    expect(clearBtn).toBeInTheDocument();

    fireEvent.click(clearBtn);
    expect(onClearSavedResult).toHaveBeenCalledTimes(1);
  });

  it('result with answers is never clearable', () => {
    const resultWithAnswers = {
      date: '2026-11-13',
      score: 6,
      correctness: [true, true, true, true, true, true, false, false, false, false],
      answers: ['higher', 'higher', 'higher', 'higher', 'higher', 'higher', 'lower', 'lower', 'lower', 'lower'] as ('higher' | 'lower')[],
      completedAt: '2026-11-13T10:00:00.000Z',
      verified: false,
    };

    render(
      <DailyResultCard
        result={resultWithAnswers}
        isAuthenticated={true}
        isSubmitting={false}
        submissionError={null}
        onRetry={vi.fn()}
        onClearSavedResult={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /Clear saved result/i })).not.toBeInTheDocument();
  });

  it('signed-in user with a server row sees the verified result even if local result has no answers', async () => {
    mocks.user = { id: 'user-1' };
    mocks.fetchMyDailyScore.mockResolvedValue({ score: 9, unavailable: false });

    // Local result has no answers
    const todayDate = new Date().toISOString().slice(0, 10);
    const legacyResult = {
      date: todayDate,
      score: 6,
      correctness: [],
      completedAt: '2026-11-13T10:00:00.000Z',
      verified: false,
    };
    localStorage.setItem(`tv_arena_daily_${todayDate}`, JSON.stringify(legacyResult));

    render(<TriviaGame seriesList={testShows} />);

    // Start Daily Run
    const dailyTab = screen.getByRole('button', { name: /Daily Run/i });
    fireEvent.click(dailyTab);

    await waitFor(() => {
      expect(screen.getByText(/Verified and saved to your account/i)).toBeInTheDocument();
    });

    expect(screen.getByText('Score: 9/10')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Clear saved result/i })).not.toBeInTheDocument();
  });
});
