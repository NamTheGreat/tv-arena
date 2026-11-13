import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MoversView } from '../components/MoversView';
import { getMovers, getNextMoverWeekStart } from '../lib/movers';
import { SeriesItem } from '../lib/supabase';

const {
  mockAuthState,
  mockRpc,
  mockMaybeSingle,
  mockEq2,
  mockEq1,
  mockSelect,
  mockFrom,
} = vi.hoisted(() => {
  const mockAuthState = { user: null as { id: string; email: string } | null };
  const mockRpc = vi.fn();
  const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  const mockEq2 = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
  const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 });
  const mockSelect = vi.fn().mockReturnValue({ eq: mockEq1 });
  const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });

  return {
    mockAuthState,
    mockRpc,
    mockMaybeSingle,
    mockEq2,
    mockEq1,
    mockSelect,
    mockFrom,
  };
});

vi.mock('../lib/auth', () => ({
  useAuth: () => ({ user: mockAuthState.user }),
}));

vi.mock('../lib/supabase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/supabase')>();
  return {
    ...actual,
    supabase: {
      from: mockFrom,
      rpc: mockRpc,
    },
  };
});

function series(
  slug: string,
  change: number | null,
  breakout = false,
  current_7d = 120,
  previous_7d = 100
): SeriesItem {
  return {
    id: slug,
    tmdb_id: 1,
    slug,
    title: slug,
    network: 'Network',
    network_group: 'Network',
    genre_group: 'Drama',
    release_years: '2020–present',
    chart_color: '#c66a3d',
    wiki_slug: slug,
    reddit_query: slug,
    buzz_score: 100,
    delta_pct: change,
    updated_at: null,
    daily_series: [],
    current_7d_score: current_7d,
    previous_7d_score: previous_7d,
    is_breakout: breakout,
    breakout_reason: breakout ? 'Recent rise' : undefined,
  };
}

describe('MoversView', () => {
  beforeEach(() => {
    mockAuthState.user = null;
    mockRpc.mockReset();
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
  });

  it('separates risers, fallers, and breakouts, excluding shows without prior-week comparison', () => {
    const shows = [series('riser', 25, true), series('faller', -12), series('new-show', null)];
    const result = getMovers(shows);

    expect(result.risers.map((show) => show.slug)).toEqual(['riser']);
    expect(result.fallers.map((show) => show.slug)).toEqual(['faller']);
    expect(result.breakouts.map((show) => show.slug)).toEqual(['riser']);

    render(<MemoryRouter><MoversView seriesList={shows} /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Top Movers' })).toBeInTheDocument();
    expect(screen.getByText('+25.0%')).toBeInTheDocument();
    expect(screen.getByText('-12.0%')).toBeInTheDocument();
    expect(screen.getByText('Subscribe to RSS')).toHaveAttribute('href', '/movers.xml');
    expect(screen.queryByText('new-show')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: "Predict Next Week's #1 Mover" })).toBeInTheDocument();
    expect(screen.getByText(/Sign in to submit your prediction/)).toBeInTheDocument();
  });

  it('renders contender choices for shows active in either current or prior 7-day window and retains success message', async () => {
    mockAuthState.user = { id: 'user-123', email: 'fan@example.com' };
    mockRpc.mockResolvedValue({ error: null });

    const shows = [
      series('only-current', null, false, 50, 0),
      series('only-prior', null, false, 0, 40),
      series('zero-activity', null, false, 0, 0),
    ];

    render(<MemoryRouter><MoversView seriesList={shows} /></MemoryRouter>);

    // Options dropdown should include only-current and only-prior, but omit zero-activity
    const select = screen.getByLabelText('Select contender') as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).toContain('only-current');
    expect(optionValues).toContain('only-prior');
    expect(optionValues).not.toContain('zero-activity');

    // Submit prediction for only-current
    fireEvent.change(select, { target: { value: 'only-current' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lock In Pick' }));

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('submit_mover_prediction', expect.objectContaining({
        p_series_id: 'only-current',
      }));
    });

    // Success banner must stay mounted and visible above the locked-in pick
    await waitFor(() => {
      expect(screen.getByText('Your prediction is locked in for next week!')).toBeInTheDocument();
    });
    expect(screen.getByText('You locked in your pick:')).toBeInTheDocument();
    expect(screen.getByText('only-current')).toBeInTheDocument();
  });

  it('computes next Monday UTC for getNextMoverWeekStart', () => {
    // Wednesday 2026-11-04 -> next Monday is 2026-11-09
    expect(getNextMoverWeekStart(new Date('2026-11-04T12:00:00Z'))).toBe('2026-11-09');
    // Sunday 2026-11-08 -> next Monday is 2026-11-09
    expect(getNextMoverWeekStart(new Date('2026-11-08T23:59:59Z'))).toBe('2026-11-09');
    // Monday 2026-11-09 -> next Monday is 2026-11-16
    expect(getNextMoverWeekStart(new Date('2026-11-09T00:00:00Z'))).toBe('2026-11-16');
  });
});
