import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ArenaContenders } from '../components/ArenaContenders';
import { computeArenaStats } from '../lib/svgMath';
import { SeriesItem } from '../lib/supabase';

const mockShows: SeriesItem[] = [
  {
    id: 'id-1',
    tmdb_id: 100,
    slug: 'severance',
    title: 'Severance',
    network: 'Apple TV+',
    network_group: 'Apple TV+',
    genre_group: 'Drama & Sci-Fi',
    release_years: '2024–2025',
    chart_color: '#C66A3D',
    wiki_slug: 'Severance_(TV_series)',
    reddit_query: 'subreddit:SeveranceAppleTVPlus',
    buzz_score: 1_200_000,
    delta_pct: 12.5,
    updated_at: null,
    daily_series: [100000, 110000, 120000],
  },
  {
    id: 'id-2',
    tmdb_id: 101,
    slug: 'the-bear',
    title: 'The Bear',
    network: 'FX / Hulu',
    network_group: 'FX / Hulu',
    genre_group: 'Comedy & Drama',
    release_years: '2024–2025',
    chart_color: '#5C828C',
    wiki_slug: 'The_Bear_(TV_series)',
    reddit_query: 'subreddit:TheBear',
    buzz_score: 800_000,
    delta_pct: -3.8,
    updated_at: null,
    daily_series: [80000, 85000, 90000],
  },
  {
    id: 'id-3',
    tmdb_id: 102,
    slug: 'succession',
    title: 'Succession',
    network: 'HBO',
    network_group: 'HBO',
    genre_group: 'Drama',
    release_years: '2018–2023',
    chart_color: '#8A5A36',
    wiki_slug: 'Succession_(TV_series)',
    reddit_query: 'subreddit:SuccessionTV',
    buzz_score: 950_000,
    delta_pct: 5.0,
    updated_at: null,
    daily_series: [90000, 92000, 95000],
  },
];

describe('ArenaContenders combobox blur and click synchronization', () => {
  it('selects an option immediately on click without depending on blur timers', () => {
    const onSelectLeftShow = vi.fn();
    const setLeftDropdownOpen = vi.fn();
    const stats = computeArenaStats(mockShows[0], mockShows[1]);

    render(
      <ArenaContenders
        seriesList={mockShows}
        leftShow={mockShows[0]}
        rightShow={mockShows[1]}
        leftSearch=""
        rightSearch=""
        leftDropdownOpen={true}
        rightDropdownOpen={false}
        setLeftSearch={vi.fn()}
        setRightSearch={vi.fn()}
        setLeftDropdownOpen={setLeftDropdownOpen}
        setRightDropdownOpen={vi.fn()}
        onSelectLeftShow={onSelectLeftShow}
        onSelectRightShow={vi.fn()}
        onSwapShows={vi.fn()}
        arenaStats={stats}
      />
    );

    const option = screen.getByRole('option', { name: /The Bear/ });
    // Simulate mousedown preventDefault and click
    const mousedownEvent = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    option.dispatchEvent(mousedownEvent);
    expect(mousedownEvent.defaultPrevented).toBe(true);

    fireEvent.click(option);

    expect(onSelectLeftShow).toHaveBeenCalledWith(mockShows[1]);
    expect(setLeftDropdownOpen).toHaveBeenCalledWith(false);
  });

  it('synchronously closes dropdown and reverts input to current show title on blur', () => {
    const setLeftSearch = vi.fn();
    const setLeftDropdownOpen = vi.fn();
    const stats = computeArenaStats(mockShows[0], mockShows[1]);

    render(
      <ArenaContenders
        seriesList={mockShows}
        leftShow={mockShows[0]}
        rightShow={mockShows[1]}
        leftSearch="Random Unmatched String"
        rightSearch=""
        leftDropdownOpen={true}
        rightDropdownOpen={false}
        setLeftSearch={setLeftSearch}
        setRightSearch={vi.fn()}
        setLeftDropdownOpen={setLeftDropdownOpen}
        setRightDropdownOpen={vi.fn()}
        onSelectLeftShow={vi.fn()}
        onSelectRightShow={vi.fn()}
        onSwapShows={vi.fn()}
        arenaStats={stats}
      />
    );

    const input = screen.getByRole('combobox', { name: 'Search left contender' });
    fireEvent.blur(input);

    expect(setLeftDropdownOpen).toHaveBeenCalledWith(false);
    expect(setLeftSearch).toHaveBeenCalledWith('Severance');
  });

  it('reverts input text and closes dropdown on Escape key', () => {
    const setLeftSearch = vi.fn();
    const setLeftDropdownOpen = vi.fn();
    const stats = computeArenaStats(mockShows[0], mockShows[1]);

    render(
      <ArenaContenders
        seriesList={mockShows}
        leftShow={mockShows[0]}
        rightShow={mockShows[1]}
        leftSearch="Typing Something Else"
        rightSearch=""
        leftDropdownOpen={true}
        rightDropdownOpen={false}
        setLeftSearch={setLeftSearch}
        setRightSearch={vi.fn()}
        setLeftDropdownOpen={setLeftDropdownOpen}
        setRightDropdownOpen={vi.fn()}
        onSelectLeftShow={vi.fn()}
        onSelectRightShow={vi.fn()}
        onSwapShows={vi.fn()}
        arenaStats={stats}
      />
    );

    const input = screen.getByRole('combobox', { name: 'Search left contender' });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(setLeftDropdownOpen).toHaveBeenCalledWith(false);
    expect(setLeftSearch).toHaveBeenCalledWith('Severance');
  });

  it('reverts right combobox and closes dropdown on blur', () => {
    const setRightSearch = vi.fn();
    const setRightDropdownOpen = vi.fn();
    const stats = computeArenaStats(mockShows[0], mockShows[1]);

    render(
      <ArenaContenders
        seriesList={mockShows}
        leftShow={mockShows[0]}
        rightShow={mockShows[1]}
        leftSearch=""
        rightSearch="Unknown Show"
        leftDropdownOpen={false}
        rightDropdownOpen={true}
        setLeftSearch={vi.fn()}
        setRightSearch={setRightSearch}
        setLeftDropdownOpen={vi.fn()}
        setRightDropdownOpen={setRightDropdownOpen}
        onSelectLeftShow={vi.fn()}
        onSelectRightShow={vi.fn()}
        onSwapShows={vi.fn()}
        arenaStats={stats}
      />
    );

    const input = screen.getByRole('combobox', { name: 'Search right contender' });
    fireEvent.blur(input);

    expect(setRightDropdownOpen).toHaveBeenCalledWith(false);
    expect(setRightSearch).toHaveBeenCalledWith('The Bear');
  });

  it('prevents default on mousedown for the swap button to avoid stealing focus', () => {
    const onSwapShows = vi.fn();
    const stats = computeArenaStats(mockShows[0], mockShows[1]);

    render(
      <ArenaContenders
        seriesList={mockShows}
        leftShow={mockShows[0]}
        rightShow={mockShows[1]}
        leftSearch="Severance"
        rightSearch="The Bear"
        leftDropdownOpen={false}
        rightDropdownOpen={false}
        setLeftSearch={vi.fn()}
        setRightSearch={vi.fn()}
        setLeftDropdownOpen={vi.fn()}
        setRightDropdownOpen={vi.fn()}
        onSelectLeftShow={vi.fn()}
        onSelectRightShow={vi.fn()}
        onSwapShows={onSwapShows}
        arenaStats={stats}
      />
    );

    const swapBtn = screen.getByTitle('Swap Contenders');
    const mousedownEvent = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    swapBtn.dispatchEvent(mousedownEvent);
    expect(mousedownEvent.defaultPrevented).toBe(true);

    fireEvent.click(swapBtn);
    expect(onSwapShows).toHaveBeenCalledTimes(1);
  });
});
