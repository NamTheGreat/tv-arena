import React from 'react';
import { SeriesItem } from '../lib/supabase';
import { ChartRange } from './trajectoryChartTypes';

interface Props {
  breakoutShow?: SeriesItem;
  addShow: (slug: string) => void;
  selectedSlugs: string[];
  chartRange: ChartRange;
  setChartRange: (range: ChartRange) => void;
  activePreset: string;
  applyPreset: (preset: string) => void;
  genreDropdownOpen: boolean;
  setGenreDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  genreRef: React.RefObject<HTMLDivElement | null>;
}

const GENRE_OPTIONS = ['Drama & Sci-Fi', 'Comedy & Drama', 'Crime & Mystery', 'Drama'];

export function TrajectoryChartHeader({ breakoutShow, addShow, selectedSlugs, chartRange, setChartRange, activePreset, applyPreset, genreDropdownOpen, setGenreDropdownOpen, genreRef }: Props) {
  return (
    <>
      {/* Top Header of Card: Title + Time Range Switcher */}
      <div className="pb-5 border-b border-stone-200/60 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-block w-2 h-2 rounded-full bg-brand-terracotta ring-4 ring-brand-terracotta/20 animate-pulse" />
              <span className="text-xs font-semibold tracking-widest uppercase text-stone-600">
                Workbench: Daily Active Household Viewers
              </span>
              {breakoutShow && (
                <button
                  type="button"
                  onClick={() => addShow(breakoutShow.slug)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200/70 hover:bg-amber-100 hover:border-amber-300 transition-colors shadow-sm cursor-pointer"
                  title={breakoutShow.breakout_reason || 'Click to pin this breakout series to the trajectory graph'}
                >
                  <span className="text-xs">🔥</span>
                  <span>
                    Breakout: <strong>{breakoutShow.title}</strong> (+{(breakoutShow.delta_pct ?? 0).toFixed(1)}%)
                  </span>
                  <span className="text-stone-600 font-mono">·</span>
                  <span className="text-brand-terracotta font-medium hover:underline">
                    {selectedSlugs.includes(breakoutShow.slug) ? '✓ Plotted' : '+ Pin to Plot'}
                  </span>
                </button>
              )}
            </div>
            <p className="text-xs text-stone-600 mt-1">
              Multivariate syndicated trajectory analyzer · Comparing {selectedSlugs.length} of 8 maximum series
            </p>
          </div>

          <div className="flex items-center gap-2 self-start lg:self-auto">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-600 mr-1">
              Range:
            </span>
            <div className="inline-flex items-center bg-[#F3EFE9] p-0.5 rounded-full text-[11px] font-medium border border-[#E7DFD5]">
              {(['7D', '30D', '90D', 'All-Time'] as const).map((r) => {
                const label = r === 'All-Time' ? 'All' : r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setChartRange(r)}
                    className={`px-2.5 py-0.5 rounded-full whitespace-nowrap transition-colors ${
                      chartRange === r
                        ? 'bg-white text-stone-800 shadow-sm font-semibold'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Cohort Presets Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-stone-100">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-600 mr-1.5">
              Cohort Presets:
            </span>
            <button
              type="button"
              onClick={() => applyPreset('top')}
              className={`px-3 py-1 rounded-full font-medium text-xs shadow-sm flex items-center gap-1.5 transition-all ${
                activePreset === 'top'
                  ? 'bg-stone-900 text-white'
                  : 'bg-white/80 hover:bg-white text-stone-600 hover:text-stone-900 border border-stone-200/80'
              }`}
            >
              <span>🔥 Top 6</span>
              {activePreset === 'top' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
            </button>
            <button
              type="button"
              onClick={() => applyPreset('breakouts')}
              className={`px-3 py-1 rounded-full font-medium text-xs transition-colors ${
                activePreset === 'breakouts'
                  ? 'bg-stone-900 text-white shadow-sm'
                  : 'bg-white/80 hover:bg-white text-stone-600 hover:text-stone-900 border border-stone-200/80'
              }`}
            >
              🚀 Breakouts
            </button>
            <button
              type="button"
              onClick={() => applyPreset('netflix')}
              className={`px-3 py-1 rounded-full font-medium text-xs transition-colors ${
                activePreset === 'netflix'
                  ? 'bg-stone-900 text-white shadow-sm'
                  : 'bg-white/80 hover:bg-white text-stone-600 hover:text-stone-900 border border-stone-200/80'
              }`}
            >
              Netflix Top 6
            </button>
            <button
              type="button"
              onClick={() => applyPreset('hbo')}
              className={`px-3 py-1 rounded-full font-medium text-xs transition-colors ${
                activePreset === 'hbo'
                  ? 'bg-stone-900 text-white shadow-sm'
                  : 'bg-white/80 hover:bg-white text-stone-600 hover:text-stone-900 border border-stone-200/80'
              }`}
            >
              HBO Top 6
            </button>
            <button
              type="button"
              onClick={() => applyPreset('apple')}
              className={`px-3 py-1 rounded-full font-medium text-xs transition-colors ${
                activePreset === 'apple'
                  ? 'bg-stone-900 text-white shadow-sm'
                  : 'bg-white/80 hover:bg-white text-stone-600 hover:text-stone-900 border border-stone-200/80'
              }`}
            >
              Apple TV+ Top 6
            </button>

            {/* Genre Dropdown */}
            <div className="relative inline-block" ref={genreRef}>
              <button
                type="button"
                onClick={() => setGenreDropdownOpen((prev) => !prev)}
                className={`px-2.5 py-1 rounded-full font-medium text-xs inline-flex items-center gap-1 transition-colors ${
                  activePreset.startsWith('genre:')
                    ? 'bg-stone-900 text-white shadow-sm'
                    : 'bg-stone-100 hover:bg-stone-200/80 text-stone-600'
                }`}
              >
                <span>
                  {activePreset.startsWith('genre:') ? activePreset.replace('genre:', '') : 'Genre'}
                </span>
                <span className="text-[10px] text-stone-600">▾</span>
              </button>
              {genreDropdownOpen && (
                <div className="absolute left-0 mt-1.5 w-48 bg-white rounded-2xl shadow-nav border border-[#ECE5DC] py-1.5 z-30 text-xs">
                  {GENRE_OPTIONS.map((genre) => (
                    <button
                      key={genre}
                      type="button"
                      onClick={() => {
                        applyPreset(`genre:${genre}`);
                        setGenreDropdownOpen(false);
                      }}
                      className="w-full text-left px-3.5 py-1.5 text-stone-700 hover:bg-stone-50 hover:text-brand-terracotta flex items-center justify-between font-medium"
                    >
                      <span>{genre}</span>
                      {activePreset === `genre:${genre}` && (
                        <span className="text-brand-terracotta font-bold">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
