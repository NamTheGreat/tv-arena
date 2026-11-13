import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import { useTrajectoryChart } from '../components/useTrajectoryChart';
import { SeriesItem } from '../lib/supabase';

describe('Trajectory cohort isolation and focus invariants', () => {
  const mockSeries: SeriesItem[] = Array.from({ length: 12 }, (_, i) => ({
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
    buzz_score: (12 - i) * 100,
    delta_pct: null,
    updated_at: null,
    daily_series: [100, 110, 120],
    daily_dates: ['2026-11-01', '2026-11-02', '2026-11-03'],
  }));

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={['/charts']}>{children}</MemoryRouter>
  );

  it('eviction does not drop the isolated show when another candidate exists', () => {
    const { result } = renderHook(
      () =>
        useTrajectoryChart({
          seriesList: mockSeries,
          chartRange: '30D',
          focusedSlug: 'show-1',
        }),
      { wrapper }
    );

    // Initial shows (focused show-1 + 5 others = 6 shows)
    expect(result.current.selectedSlugs).toEqual([
      'show-1',
      'show-2',
      'show-3',
      'show-4',
      'show-5',
      'show-6',
    ]);

    // Fill to 8 shows
    act(() => {
      result.current.addShow('show-7');
    });
    act(() => {
      result.current.addShow('show-8');
    });
    expect(result.current.selectedSlugs.length).toBe(8);
    // Selected: ['show-1', 'show-2', 'show-3', 'show-4', 'show-5', 'show-6', 'show-7', 'show-8']

    // Isolate show-2 (the oldest non-focused show)
    act(() => {
      result.current.toggleIsolate('show-2');
    });
    expect(result.current.isolatedSlug).toBe('show-2');

    // Add 9th show ('show-9')
    act(() => {
      result.current.addShow('show-9');
    });

    // show-2 (isolated) and show-1 (focused) should NOT be dropped; show-3 should be dropped instead
    expect(result.current.selectedSlugs).toContain('show-1');
    expect(result.current.selectedSlugs).toContain('show-2');
    expect(result.current.selectedSlugs).toContain('show-9');
    expect(result.current.selectedSlugs).not.toContain('show-3');
    expect(result.current.isolatedSlug).toBe('show-2');
  });

  it('resets isolatedSlug to null if the isolated show is removed', () => {
    const { result } = renderHook(
      () =>
        useTrajectoryChart({
          seriesList: mockSeries,
          chartRange: '30D',
        }),
      { wrapper }
    );

    act(() => {
      result.current.toggleIsolate('show-2');
    });
    expect(result.current.isolatedSlug).toBe('show-2');

    // Remove show-2
    act(() => {
      result.current.removeShow('show-2');
    });

    expect(result.current.selectedSlugs).not.toContain('show-2');
    expect(result.current.isolatedSlug).toBeNull();
  });

  it('removing focused show keeps it removed until route slug changes', () => {
    let currentFocused: string | undefined = 'show-1';
    const { result, rerender } = renderHook(
      ({ focused }) =>
        useTrajectoryChart({
          seriesList: mockSeries,
          chartRange: '30D',
          focusedSlug: focused,
        }),
      {
        wrapper,
        initialProps: { focused: currentFocused },
      }
    );

    expect(result.current.selectedSlugs).toContain('show-1');

    // User removes the focused show
    act(() => {
      result.current.removeShow('show-1');
    });
    expect(result.current.selectedSlugs).not.toContain('show-1');

    // Re-render with the SAME focusedSlug (e.g. parent rerender)
    rerender({ focused: 'show-1' });
    expect(result.current.selectedSlugs).not.toContain('show-1');

    // Route changes to a NEW focusedSlug ('show-10')
    rerender({ focused: 'show-10' });
    expect(result.current.selectedSlugs).toContain('show-10');
  });
});
