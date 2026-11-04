import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ArenaContenders } from '../components/ArenaContenders';
import { LeaderboardTable } from '../components/LeaderboardTable';
import { ShowDetailView } from '../components/ShowDetailView';
import { computeArenaStats } from '../lib/svgMath';
import { leaderboardScore } from '../lib/derivedScore';
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
    it('shows copied only after the clipboard write succeeds', async () => {
      const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      });
      const stats = computeArenaStats(mockShows[0], mockShows[1]);

      render(
        <ArenaContenders
          seriesList={mockShows}
          leftShow={mockShows[0]}
          rightShow={mockShows[1]}
          leftSearch=""
          rightSearch=""
          leftDropdownOpen={false}
          rightDropdownOpen={false}
          setLeftSearch={vi.fn()}
          setRightSearch={vi.fn()}
          setLeftDropdownOpen={vi.fn()}
          setRightDropdownOpen={vi.fn()}
          onSelectLeftShow={vi.fn()}
          onSelectRightShow={vi.fn()}
          onSwapShows={vi.fn()}
          arenaStats={stats}
        />
      );

      fireEvent.click(screen.getByTitle('Copy battle URL to clipboard'));
      expect(await screen.findByText('Could not copy')).toBeInTheDocument();
      expect(screen.queryByText('Copied!')).not.toBeInTheDocument();

      if (originalClipboard) {
        Object.defineProperty(navigator, 'clipboard', originalClipboard);
      } else {
        Reflect.deleteProperty(navigator, 'clipboard');
      }
    });

    it('supports arrow and enter selection in the contender combobox', () => {
      const onSelectLeftShow = vi.fn();
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
          setLeftDropdownOpen={vi.fn()}
          setRightDropdownOpen={vi.fn()}
          onSelectLeftShow={onSelectLeftShow}
          onSelectRightShow={vi.fn()}
          onSwapShows={vi.fn()}
          arenaStats={stats}
        />
      );

      const combobox = screen.getByRole('combobox', { name: 'Search left contender' });
      fireEvent.focus(combobox);
      fireEvent.keyDown(combobox, { key: 'ArrowDown' });
      expect(combobox).toHaveAttribute('aria-activedescendant', 'left-show-option-the-bear');
      fireEvent.keyDown(combobox, { key: 'Enter' });
      expect(onSelectLeftShow).toHaveBeenCalledWith(mockShows[1]);
    });

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
      expect(screen.getByText('No shared daily history is available for these shows yet.')).toBeInTheDocument();

      // Check search input triggers callback
      const inputs = screen.getAllByPlaceholderText('Type a series...');
      fireEvent.change(inputs[0], { target: { value: 'Stranger' } });
      expect(setLeftSearch).toHaveBeenCalledWith('Stranger');
    });

    it('overlays matching daily history and reports each show’s lead days', () => {
      const leftShow = { ...mockShows[0], daily_dates: ['2026-01-01', '2026-01-02'], daily_series: [10, 5] };
      const rightShow = { ...mockShows[1], daily_dates: ['2026-01-01', '2026-01-02'], daily_series: [5, 7] };
      const stats = computeArenaStats(leftShow, rightShow);

      render(
        <ArenaContenders
          seriesList={[leftShow, rightShow]}
          leftShow={leftShow}
          rightShow={rightShow}
          leftSearch=""
          rightSearch=""
          leftDropdownOpen={false}
          rightDropdownOpen={false}
          setLeftSearch={vi.fn()}
          setRightSearch={vi.fn()}
          setLeftDropdownOpen={vi.fn()}
          setRightDropdownOpen={vi.fn()}
          onSelectLeftShow={vi.fn()}
          onSelectRightShow={vi.fn()}
          onSwapShows={vi.fn()}
          arenaStats={stats}
        />
      );

      expect(screen.getByText('Severance led on 1 of 30 days')).toBeInTheDocument();
      expect(screen.getByText('The Bear led on 1 of 30 days')).toBeInTheDocument();
      expect(screen.getByText(/2 days had recorded values for both shows/)).toBeInTheDocument();
    });
  });

  describe('LeaderboardTable', () => {
    it('renders the leaderboard view score without a stored series score field', () => {
      const databaseViewRow = { current_7d_score: 1_200_000 };
      const viewOnlyShow = { ...mockShows[0], buzz_score: leaderboardScore(databaseViewRow) };

      render(
        <LeaderboardTable
          rankedShows={[viewOnlyShow]}
          searchTerm=""
          sortBy="score"
          displayCount={20}
          onSearchTermChange={vi.fn()}
          onSortChange={vi.fn()}
          onShowMore={vi.fn()}
          platformFilter="ALL"
          genreFilter="ALL"
          availablePlatforms={['ALL']}
          availableGenres={['ALL']}
          maxLeaderboardViewers={1_200_000}
          setPlatformFilter={vi.fn()}
          setGenreFilter={vi.fn()}
          onSelectBattle={vi.fn()}
        />
      );

      expect(screen.getByText('1,200,000')).toBeInTheDocument();
    });

    it('provides URL-backed search, sorting, and show-more controls', () => {
      const shows = Array.from({ length: 21 }, (_, index) => ({
        ...mockShows[index % mockShows.length],
        id: `leader-${index}`,
        slug: `leader-${index}`,
        title: `Show ${index}`,
      }));
      const onSearchTermChange = vi.fn();
      const onSortChange = vi.fn();
      const onShowMore = vi.fn();

      render(
        <LeaderboardTable
          rankedShows={shows}
          searchTerm=""
          sortBy="score"
          displayCount={20}
          onSearchTermChange={onSearchTermChange}
          onSortChange={onSortChange}
          onShowMore={onShowMore}
          platformFilter="ALL"
          genreFilter="ALL"
          availablePlatforms={['ALL']}
          availableGenres={['ALL']}
          maxLeaderboardViewers={1_200_000}
          setPlatformFilter={vi.fn()}
          setGenreFilter={vi.fn()}
          onSelectBattle={vi.fn()}
        />
      );

      expect(screen.getByText('Showing 20 of 21')).toBeInTheDocument();
      fireEvent.change(screen.getByRole('searchbox', { name: 'Search shows' }), {
        target: { value: 'Severance' },
      });
      expect(onSearchTermChange).toHaveBeenCalledWith('Severance');
      fireEvent.change(screen.getByLabelText('Sort leaderboard'), { target: { value: 'growth' } });
      expect(onSortChange).toHaveBeenCalledWith('growth');
      fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
      expect(onShowMore).toHaveBeenCalledOnce();
    });

    it('renders ranked rows and filters', () => {
      const setPlatformFilter = vi.fn();
      const setGenreFilter = vi.fn();
      const onSelectBattle = vi.fn();

      render(
        <LeaderboardTable
          rankedShows={mockShows}
          searchTerm=""
          sortBy="score"
          displayCount={20}
          onSearchTermChange={vi.fn()}
          onSortChange={vi.fn()}
          onShowMore={vi.fn()}
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

    it('renders NEW badge when delta_pct is null', () => {
      const showWithNullDelta: SeriesItem = {
        ...mockShows[0],
        id: 'id-new',
        slug: 'new-show',
        title: 'New Show Debut',
        delta_pct: null,
      };

      render(
        <LeaderboardTable
          rankedShows={[showWithNullDelta]}
          searchTerm=""
          sortBy="score"
          displayCount={20}
          onSearchTermChange={vi.fn()}
          onSortChange={vi.fn()}
          onShowMore={vi.fn()}
          platformFilter="ALL"
          genreFilter="ALL"
          availablePlatforms={['ALL', 'Apple TV+']}
          availableGenres={['ALL', 'Drama & Sci-Fi']}
          maxLeaderboardViewers={1_200_000}
          setPlatformFilter={vi.fn()}
          setGenreFilter={vi.fn()}
          onSelectBattle={vi.fn()}
        />
      );

      expect(screen.getByText('New Show Debut')).toBeInTheDocument();
      expect(screen.getByText('NEW')).toBeInTheDocument();
    });
  });

  describe('ShowDetailView', () => {
    it('renders NEW badge for show with null delta_pct', () => {
      const showWithNullDelta: SeriesItem = {
        ...mockShows[0],
        id: 'id-new',
        slug: 'brand-new-show',
        title: 'Brand New Show',
        delta_pct: null,
      };

      render(
        <MemoryRouter initialEntries={['/show/brand-new-show']}>
          <Routes>
            <Route path="/show/:slug" element={<ShowDetailView seriesList={[showWithNullDelta]} />} />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByText('Brand New Show')).toBeInTheDocument();
      expect(screen.getByText('NEW')).toBeInTheDocument();
    });

    it('formats numeric delta_pct to one decimal place', () => {
      render(
        <MemoryRouter initialEntries={['/show/severance']}>
          <Routes>
            <Route path="/show/:slug" element={<ShowDetailView seriesList={mockShows} />} />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByText('Severance')).toBeInTheDocument();
      expect(screen.getByText('+14.2%')).toBeInTheDocument();
    });
  });
});
