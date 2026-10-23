import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ArenaContenders } from '../components/ArenaContenders';
import { LeaderboardTable } from '../components/LeaderboardTable';
import { computeArenaStats } from '../lib/svgMath';
import { SeriesItem } from '../lib/supabase';

const mockShows: SeriesItem[] = [
  {
    id: 'id-1',
    tmdb_id: 100,
    slug: 'severance',
    title: 'Severance',
    network: 'Apple TV+',
    genre_group: 'Drama & Sci-Fi',
    release_years: '2024–2025',
    chart_color: '#C66A3D',
    wiki_slug: 'Severance_(TV_series)',
    reddit_query: 'subreddit:SeveranceAppleTVPlus',
    buzz_score: 1_200_000,
    delta_pct: 14.2,
    updated_at: null,
    daily_series: [100000, 120000, 140000, 160000, 180000, 200000, 220000],
  },
  {
    id: 'id-2',
    tmdb_id: 101,
    slug: 'the-bear',
    title: 'The Bear',
    network: 'FX / Hulu',
    genre_group: 'Comedy & Drama',
    release_years: '2024–2025',
    chart_color: '#5C828C',
    wiki_slug: 'The_Bear_(TV_series)',
    reddit_query: 'subreddit:TheBear',
    buzz_score: 800_000,
    delta_pct: -3.8,
    updated_at: null,
    daily_series: [80000, 85000, 90000, 95000, 100000, 105000, 110000],
  },
];

describe('Core components headless tests', () => {
  describe('ArenaContenders', () => {
    it('renders both contenders and shows the leading show', () => {
      const stats = computeArenaStats(mockShows[0], mockShows[1]);
      const setLeftSearch = vi.fn();
      const setRightSearch = vi.fn();

      render(
        <ArenaContenders
          seriesList={mockShows}
          leftShow={mockShows[0]}
          rightShow={mockShows[1]}
          leftSearch=""
          rightSearch=""
          leftDropdownOpen={false}
          rightDropdownOpen={false}
          setLeftSearch={setLeftSearch}
          setRightSearch={setRightSearch}
          setLeftDropdownOpen={vi.fn()}
          setRightDropdownOpen={vi.fn()}
          onSelectLeftShow={vi.fn()}
          onSelectRightShow={vi.fn()}
          onSwapShows={vi.fn()}
          arenaStats={stats}
        />
      );

      // Check titles rendered
      expect(screen.getByText('Severance')).toBeInTheDocument();
      expect(screen.getByText('The Bear')).toBeInTheDocument();
      expect(screen.getByText('Apple TV+')).toBeInTheDocument();
      expect(screen.getByText('FX / Hulu')).toBeInTheDocument();

      // Check winner declared in footer
      expect(screen.getByText(/Severance leads/i)).toBeInTheDocument();
      expect(screen.getByText(/\+50\.0%/i)).toBeInTheDocument();

      // Check search input triggers callback
      const inputs = screen.getAllByPlaceholderText('Type a series...');
      fireEvent.change(inputs[0], { target: { value: 'Stranger' } });
      expect(setLeftSearch).toHaveBeenCalledWith('Stranger');
    });
  });

  describe('LeaderboardTable', () => {
    it('renders ranked rows and filters', () => {
      const setPlatformFilter = vi.fn();
      const setGenreFilter = vi.fn();
      const onSelectBattle = vi.fn();

      render(
        <LeaderboardTable
          rankedShows={mockShows}
          platformFilter="ALL"
          genreFilter="ALL"
          availablePlatforms={['ALL', 'Apple TV+', 'FX / Hulu']}
          availableGenres={['ALL', 'Drama & Sci-Fi', 'Comedy & Drama']}
          maxLeaderboardViewers={1_200_000}
          setPlatformFilter={setPlatformFilter}
          setGenreFilter={setGenreFilter}
          onSelectBattle={onSelectBattle}
        />
      );

      // Rank numbers and titles rendered
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('Severance')).toBeInTheDocument();
      expect(screen.getByText('The Bear')).toBeInTheDocument();

      // Formatted viewers
      expect(screen.getByText('1,200,000')).toBeInTheDocument();
      expect(screen.getByText('800,000')).toBeInTheDocument();

      // Deltas rendered
      expect(screen.getByText('14.2%')).toBeInTheDocument();
      expect(screen.getByText('3.8%')).toBeInTheDocument();

      // Platform select changes trigger callback
      const platformSelect = screen.getByLabelText('Filter by Platform');
      fireEvent.change(platformSelect, { target: { value: 'Apple TV+' } });
      expect(setPlatformFilter).toHaveBeenCalledWith('Apple TV+');

      // Genre select changes trigger callback
      const genreSelect = screen.getByLabelText('Filter by Genre');
      fireEvent.change(genreSelect, { target: { value: 'Drama & Sci-Fi' } });
      expect(setGenreFilter).toHaveBeenCalledWith('Drama & Sci-Fi');

      // Clicking first row calls onSelectBattle
      const firstRow = screen.getByText('Severance').closest('article');
      expect(firstRow).not.toBeNull();
      fireEvent.click(firstRow!);
      expect(onSelectBattle).toHaveBeenCalledWith('severance', 'the-bear');
    });
  });
});
