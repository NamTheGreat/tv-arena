import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { calculateStreakProgression, fetchUserDailyHistory } from '../lib/dailyHistory';
import { DailyHistoryView } from '../components/DailyHistoryView';
import { supabase } from '../lib/supabase';

describe('calculateStreakProgression', () => {
  it('assigns streak 1 to a single date', () => {
    const streaks = calculateStreakProgression(['2026-11-01']);
    expect(streaks.get('2026-11-01')).toBe(1);
  });

  it('increments streak on consecutive calendar days', () => {
    const dates = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'];
    const streaks = calculateStreakProgression(dates);
    expect(streaks.get('2026-11-01')).toBe(1);
    expect(streaks.get('2026-11-02')).toBe(2);
    expect(streaks.get('2026-11-03')).toBe(3);
    expect(streaks.get('2026-11-04')).toBe(4);
  });

  it('reports the best streak from the full history even when the current page ends a streak', async () => {
    if (!supabase) return;

    const eqSpy = vi.fn().mockReturnThis();
    const rangeSpy = vi.fn().mockResolvedValue({
      data: [{
        date: '2026-11-10',
        score: 8,
        correctness: [true, true],
        completed_at: '2026-11-10T12:00:00Z',
      }],
      error: null,
    });
    const orderSpy = vi.fn().mockImplementation((col, opts) => {
      if (opts?.ascending === true) {
        return Promise.resolve({
          data: [{ date: '2026-11-01' }, { date: '2026-11-02' }, { date: '2026-11-10' }],
          error: null,
        });
      }
      return { range: rangeSpy };
    });
    vi.spyOn(supabase, 'from').mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: eqSpy }),
    } as any);
    eqSpy.mockReturnValue({ order: orderSpy });

    const result = await fetchUserDailyHistory('test-user-uuid', 1, 1);
    expect(result.data?.entries[0].streak).toBe(1);
    expect(result.data?.bestStreak).toBe(2);
  });

  it('resets streak to 1 after a day gap', () => {
    const dates = ['2026-11-01', '2026-11-02', '2026-11-05', '2026-11-06'];
    const streaks = calculateStreakProgression(dates);
    expect(streaks.get('2026-11-01')).toBe(1);
    expect(streaks.get('2026-11-02')).toBe(2);
    expect(streaks.get('2026-11-05')).toBe(1);
    expect(streaks.get('2026-11-06')).toBe(2);
  });
});

describe('fetchUserDailyHistory RLS & pagination', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fails gracefully when user is unauthenticated', async () => {
    const result = await fetchUserDailyHistory('');
    expect(result.data).toBeNull();
    expect(result.error).toContain('Authentication required');
  });

  it('queries user_scores scoped strictly to the authenticated user ID and respects range pagination', async () => {
    if (!supabase) return;

    const mockDates = [{ date: '2026-11-01' }, { date: '2026-11-02' }, { date: '2026-11-03' }];
    const mockPageRows = [
      {
        date: '2026-11-03',
        score: 8,
        correctness: [true, true, true, true, true, true, true, true, false, false],
        completed_at: '2026-11-03T12:00:00Z',
      },
      {
        date: '2026-11-02',
        score: 7,
        correctness: [true, true, true, true, true, true, true, false, false, false],
        completed_at: '2026-11-02T12:00:00Z',
      },
    ];

    const eqSpy = vi.fn().mockReturnThis();
    const rangeSpy = vi.fn().mockResolvedValue({ data: mockPageRows, error: null });

    const orderSpy = vi.fn().mockImplementation((col, opts) => {
      if (opts?.ascending === true) {
        return Promise.resolve({ data: mockDates, error: null });
      }
      return { range: rangeSpy };
    });

    const selectSpy = vi.fn().mockReturnValue({
      eq: eqSpy,
    });
    eqSpy.mockReturnValue({
      order: orderSpy,
    });

    vi.spyOn(supabase, 'from').mockReturnValue({
      select: selectSpy,
    } as any);

    const res = await fetchUserDailyHistory('test-user-uuid', 1, 2);

    expect(supabase.from).toHaveBeenCalledWith('user_scores');
    expect(eqSpy).toHaveBeenCalledWith('user_id', 'test-user-uuid');
    expect(rangeSpy).toHaveBeenCalledWith(0, 1);
    expect(res.data?.totalCount).toBe(3);
    expect(res.data?.totalPages).toBe(2);
    expect(res.data?.entries).toHaveLength(2);
    expect(res.data?.entries[0].streak).toBe(3);
  });
});

describe('DailyHistoryView component', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders sign-in prompt for anonymous users and calls onOpenAuth', () => {
    const onOpenAuth = vi.fn();
    render(
      <MemoryRouter>
        <DailyHistoryView user={null} onOpenAuth={onOpenAuth} />
      </MemoryRouter>
    );

    expect(screen.getByText('Daily Challenge History')).toBeInTheDocument();
    expect(
      screen.getByText(/Sign in to view your private daily run history/)
    ).toBeInTheDocument();

    const signInBtn = screen.getByRole('button', { name: /sign in to view history/i });
    fireEvent.click(signInBtn);
    expect(onOpenAuth).toHaveBeenCalledOnce();
  });

  it('renders honest empty state when authenticated user has no history', async () => {
    if (!supabase) return;

    vi.spyOn(supabase, 'from').mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    } as any);

    render(
      <MemoryRouter>
        <DailyHistoryView user={{ id: 'user-1', email: 'test@example.com' }} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(
        screen.getByText(/No daily challenges completed yet. Play today's Daily Run to record your first score!/)
      ).toBeInTheDocument();
    });
  });

  it('renders history entries, streak badges, and opens share card modal on click', async () => {
    if (!supabase) return;

    const mockDates = [{ date: '2026-11-15' }, { date: '2026-11-16' }];
    const mockPageRows = [
      {
        date: '2026-11-16',
        score: 9,
        correctness: [true, true, true, true, true, true, true, true, true, false],
        completed_at: '2026-11-16T12:00:00Z',
      },
    ];

    const eqSpy = vi.fn().mockReturnThis();
    const rangeSpy = vi.fn().mockResolvedValue({ data: mockPageRows, error: null });

    const orderSpy = vi.fn().mockImplementation((col, opts) => {
      if (opts?.ascending === true) {
        return Promise.resolve({ data: mockDates, error: null });
      }
      return { range: rangeSpy };
    });

    vi.spyOn(supabase, 'from').mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: eqSpy,
      }),
    } as any);
    eqSpy.mockReturnValue({
      order: orderSpy,
    });

    render(
      <MemoryRouter>
        <DailyHistoryView user={{ id: 'user-1', email: 'test@example.com' }} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('2 Completed')).toBeInTheDocument();
      expect(screen.getByText('Best Streak: 2d')).toBeInTheDocument();
      expect(screen.getByText('9 / 10')).toBeInTheDocument();
      expect(screen.getByText('Streak: 2d')).toBeInTheDocument();
    });

    const shareBtn = screen.getByRole('button', { name: /share card/i });
    fireEvent.click(shareBtn);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /close share card/i })).toBeInTheDocument();

    const closeBtn = screen.getByRole('button', { name: /close share card/i });
    fireEvent.click(closeBtn);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
