import React from 'react';
import { SeriesItem } from '../lib/supabase';

interface LeaderboardTableProps {
  rankedShows: SeriesItem[];
  platformFilter: string;
  genreFilter: string;
  availablePlatforms: string[];
  availableGenres: string[];
  maxLeaderboardViewers: number;
  setPlatformFilter: (platform: string) => void;
  setGenreFilter: (genre: string) => void;
  onSelectBattle: (slugA: string, slugB: string) => void;
}

export function LeaderboardTable({
  rankedShows,
  platformFilter,
  genreFilter,
  availablePlatforms,
  availableGenres,
  maxLeaderboardViewers,
  setPlatformFilter,
  setGenreFilter,
  onSelectBattle,
}: LeaderboardTableProps) {
  return (
    <main className="w-full max-w-4xl bg-white/90 backdrop-blur-xl rounded-[28px] sm:rounded-[32px] p-4 sm:p-10 shadow-card border border-[#EFEAE2]/90">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 pb-4 sm:pb-6 border-b border-[#F2ECE3]">
        <div className="flex items-center space-x-2 sm:space-x-2.5">
          <span className="inline-block w-2 sm:w-2.5 h-2 sm:h-2.5 rounded-full bg-brand-terracotta" />
          <span className="text-[10px] sm:text-xs uppercase tracking-wider font-semibold text-[#665D53]">
            Metric: 7-Day Engagement Index
          </span>
        </div>
        <div className="flex items-center flex-wrap gap-1.5 sm:gap-2 text-[11px] sm:text-xs">
          <div className="relative">
            <select
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
              className="appearance-none bg-white hover:bg-stone-50 text-[#786E63] pl-3 pr-7 py-1 sm:py-1.5 rounded-full font-medium border border-[#E9E2D5] transition-colors cursor-pointer outline-none focus:border-brand-terracotta"
              aria-label="Filter by Platform"
            >
              {availablePlatforms.map((p) => (
                <option key={p} value={p}>
                  Platform: {p === 'ALL' ? 'All Platforms' : p}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2 text-[#786E63]">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          <div className="relative">
            <select
              value={genreFilter}
              onChange={(e) => setGenreFilter(e.target.value)}
              className="appearance-none bg-white hover:bg-stone-50 text-[#786E63] pl-3 pr-7 py-1 sm:py-1.5 rounded-full font-medium border border-[#E9E2D5] transition-colors cursor-pointer outline-none focus:border-brand-terracotta"
              aria-label="Filter by Genre"
            >
              {availableGenres.map((g) => (
                <option key={g} value={g}>
                  Genre: {g === 'ALL' ? 'All Genres' : g}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2 text-[#786E63]">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 sm:mt-4 divide-y divide-[#F7F3ED]/75">
        {rankedShows.map((show, idx) => {
          const rank = idx + 1;
          const widthPct = Math.round((show.viewers_premiere_28d / maxLeaderboardViewers) * 100);
          const isSteady = Math.abs(show.delta_pct) < 0.5;
          const isUp = show.delta_pct > 0;

          return (
            <article
              key={show.slug}
              onClick={() => onSelectBattle(show.slug, rankedShows[(idx + 1) % rankedShows.length].slug)}
              className={`ranking-row cursor-pointer relative overflow-hidden rounded-2xl py-2.5 sm:py-3.5 px-3 sm:px-4 my-1 sm:my-1.5 ${
                rank === 1
                  ? 'bg-[#FBF7F0]/40 border border-[#F3ECE0]/80'
                  : 'hover:bg-[#FBF8F2] border border-transparent hover:border-[#EFE8DD]'
              }`}
            >
              <div
                className={`absolute inset-y-0 left-0 rounded-2xl pointer-events-none ${
                  rank === 1 ? 'bar-highlight' : 'bar-subtle'
                }`}
                style={{ width: `${widthPct}%` }}
              />
              <div className="relative z-10 flex items-center justify-between gap-3 sm:gap-4">
                <div className="flex items-center gap-3 sm:gap-5 min-w-0">
                  <div
                    className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-semibold text-xs sm:text-sm shrink-0 ${
                      rank === 1
                        ? 'bg-brand-terracotta text-white shadow-sm'
                        : 'bg-[#EFEAE1] text-[#696155]'
                    }`}
                  >
                    {rank}
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-serif text-base sm:text-xl text-[#1E1A17] font-medium tracking-tight truncate">
                      {show.title}
                    </h2>
                    <p className="text-[11px] sm:text-xs text-[#8A8175] font-medium mt-0.5">{show.network}</p>
                  </div>
                </div>

                <div className="text-right shrink-0 font-tabular">
                  <div className="font-serif text-base sm:text-xl font-medium text-[#1E1A17]">
                    {show.viewers_premiere_28d.toLocaleString()}
                  </div>
                  {isSteady ? (
                    <div className="text-[10px] sm:text-xs font-medium text-[#A3998D] mt-0.5">
                      Steady
                    </div>
                  ) : (
                    <div
                      className={`text-[10px] sm:text-xs font-semibold flex items-center justify-end space-x-1 mt-0.5 ${
                        isUp ? 'text-brand-success' : 'text-brand-danger'
                      }`}
                    >
                      <span>{isUp ? '▲' : '▼'}</span>
                      <span>{Math.abs(show.delta_pct).toFixed(1)}%</span>
                    </div>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </main>
  );
}
