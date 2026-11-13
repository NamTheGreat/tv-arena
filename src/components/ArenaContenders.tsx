import React, { useState } from 'react';
import { SeriesItem } from '../lib/supabase';
import { ArenaTrajectoryOverlay } from './ArenaTrajectoryOverlay';

export interface ArenaStats {
  leftPct: number;
  rightPct: number;
  leftLeads: boolean;
  winner: SeriesItem;
  diff: number;
  diffPct: string;
}

function handleComboboxKeyDown(
  event: React.KeyboardEvent<HTMLInputElement>,
  options: SeriesItem[],
  isOpen: boolean,
  setOpen: (open: boolean) => void,
  activeIndex: number,
  setActiveIndex: (index: number) => void,
  onSelect: (show: SeriesItem) => void,
  onRevert?: () => void
) {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    if (!options.length) return;
    event.preventDefault();
    setOpen(true);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    setActiveIndex(activeIndex < 0 ? (step > 0 ? 0 : options.length - 1) : (activeIndex + step + options.length) % options.length);
  } else if (event.key === 'Enter' && isOpen && options[activeIndex]) {
    event.preventDefault();
    onSelect(options[activeIndex]);
    setOpen(false);
    setActiveIndex(-1);
  } else if (event.key === 'Escape') {
    setOpen(false);
    setActiveIndex(-1);
    onRevert?.();
  }
}

interface ArenaContendersProps {
  seriesList: SeriesItem[];
  leftShow: SeriesItem;
  rightShow: SeriesItem;
  leftSearch: string;
  rightSearch: string;
  leftDropdownOpen: boolean;
  rightDropdownOpen: boolean;
  setLeftSearch: (val: string) => void;
  setRightSearch: (val: string) => void;
  setLeftDropdownOpen: (open: boolean) => void;
  setRightDropdownOpen: (open: boolean) => void;
  onSelectLeftShow: (show: SeriesItem) => void;
  onSelectRightShow: (show: SeriesItem) => void;
  onSwapShows: () => void;
  arenaStats: ArenaStats;
}

export function ArenaContenders({
  seriesList,
  leftShow,
  rightShow,
  leftSearch,
  rightSearch,
  leftDropdownOpen,
  rightDropdownOpen,
  setLeftSearch,
  setRightSearch,
  setLeftDropdownOpen,
  setRightDropdownOpen,
  onSelectLeftShow,
  onSelectRightShow,
  onSwapShows,
  arenaStats,
}: ArenaContendersProps) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [leftActiveIndex, setLeftActiveIndex] = useState(0);
  const [rightActiveIndex, setRightActiveIndex] = useState(0);
  const leftOptions = seriesList.filter((show) => show.title.toLowerCase().includes(leftSearch.toLowerCase())).slice(0, 6);
  const rightOptions = seriesList.filter((show) => show.title.toLowerCase().includes(rightSearch.toLowerCase())).slice(0, 6);

  const selectLeft = (show: SeriesItem) => {
    onSelectLeftShow(show);
    setLeftDropdownOpen(false);
    setLeftActiveIndex(-1);
  };
  const selectRight = (show: SeriesItem) => {
    onSelectRightShow(show);
    setRightDropdownOpen(false);
    setRightActiveIndex(-1);
  };

  const handleLeftBlur = () => {
    setLeftDropdownOpen(false);
    setLeftActiveIndex(-1);
    if (leftShow && leftSearch !== leftShow.title) {
      setLeftSearch(leftShow.title);
    }
  };

  const handleRightBlur = () => {
    setRightDropdownOpen(false);
    setRightActiveIndex(-1);
    if (rightShow && rightSearch !== rightShow.title) {
      setRightSearch(rightShow.title);
    }
  };

  const handleCopyLink = async () => {
    setCopied(false);
    setCopyFailed(false);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyFailed(true);
    }
  };
  return (
    <div className="w-full max-w-3xl flex flex-col items-center">
      {/* Search & Contender Selector */}
      <section className="w-full mb-5 sm:mb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-4 relative items-center">
          {/* Left Input */}
          <div className="relative w-full">
            <input
              type="text"
              role="combobox"
              aria-label="Search left contender"
              aria-autocomplete="list"
              aria-expanded={leftDropdownOpen}
              aria-controls={leftDropdownOpen ? 'left-show-options' : undefined}
              aria-activedescendant={leftDropdownOpen && leftOptions[leftActiveIndex] ? `left-show-option-${leftOptions[leftActiveIndex].slug}` : undefined}
              value={leftSearch}
              onFocus={() => { setLeftDropdownOpen(true); setLeftActiveIndex(leftOptions.length ? 0 : -1); }}
              onBlur={handleLeftBlur}
              onChange={(e) => {
                setLeftSearch(e.target.value);
                setLeftDropdownOpen(true);
                setLeftActiveIndex(0);
              }}
              onKeyDown={(event) =>
                handleComboboxKeyDown(
                  event,
                  leftOptions,
                  leftDropdownOpen,
                  setLeftDropdownOpen,
                  leftActiveIndex,
                  setLeftActiveIndex,
                  selectLeft,
                  () => {
                    if (leftShow && leftSearch !== leftShow.title) setLeftSearch(leftShow.title);
                  }
                )
              }
              placeholder="Type a series..."
              className="w-full bg-arena-surface border border-arena-border text-arena-charcoal text-sm sm:text-base font-serif px-4 sm:px-5 py-2.5 sm:py-3.5 rounded-xl sm:rounded-2xl shadow-sm focus:border-arena-terracotta focus:ring-0 outline-none"
            />
            {leftDropdownOpen && (
              <div
                id="left-show-options"
                role="listbox"
                onMouseDown={(event) => event.preventDefault()}
                className="absolute z-30 mt-2 w-full bg-arena-surface border border-arena-border rounded-2xl shadow-soft-card overflow-hidden"
              >
                {leftOptions.map((show, index) => (
                  <div
                    id={`left-show-option-${show.slug}`}
                    key={show.slug}
                    role="option"
                    aria-selected={index === leftActiveIndex}
                    onMouseEnter={() => setLeftActiveIndex(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => selectLeft(show)}
                    className={`w-full text-left px-4 py-2.5 flex items-center justify-between text-sm font-serif cursor-pointer ${index === leftActiveIndex ? 'bg-arena-cream' : ''}`}
                  >
                    <span className="font-semibold">{show.title}</span>
                    <span className="text-xs font-sans text-arena-muted">{show.network}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Clickable Swap Badge */}
          <button
            type="button"
            onClick={onSwapShows}
            onMouseDown={(event) => event.preventDefault()}
            title="Swap Contenders"
            className="hidden sm:flex absolute left-1/2 -translate-x-1/2 z-10 w-8 h-8 rounded-full bg-arena-cream border border-arena-border items-center justify-center text-arena-muted text-xs font-serif italic shadow-sm hover:border-arena-terracotta"
          >
            vs
          </button>

          {/* Right Input */}
          <div className="relative w-full">
            <input
              type="text"
              role="combobox"
              aria-label="Search right contender"
              aria-autocomplete="list"
              aria-expanded={rightDropdownOpen}
              aria-controls={rightDropdownOpen ? 'right-show-options' : undefined}
              aria-activedescendant={rightDropdownOpen && rightOptions[rightActiveIndex] ? `right-show-option-${rightOptions[rightActiveIndex].slug}` : undefined}
              value={rightSearch}
              onFocus={() => { setRightDropdownOpen(true); setRightActiveIndex(rightOptions.length ? 0 : -1); }}
              onBlur={handleRightBlur}
              onChange={(e) => {
                setRightSearch(e.target.value);
                setRightDropdownOpen(true);
                setRightActiveIndex(0);
              }}
              onKeyDown={(event) =>
                handleComboboxKeyDown(
                  event,
                  rightOptions,
                  rightDropdownOpen,
                  setRightDropdownOpen,
                  rightActiveIndex,
                  setRightActiveIndex,
                  selectRight,
                  () => {
                    if (rightShow && rightSearch !== rightShow.title) setRightSearch(rightShow.title);
                  }
                )
              }
              placeholder="Type a series..."
              className="w-full bg-arena-surface border border-arena-border text-arena-charcoal text-sm sm:text-base font-serif px-4 sm:px-5 py-2.5 sm:py-3.5 rounded-xl sm:rounded-2xl shadow-sm focus:border-arena-sage focus:ring-0 outline-none"
            />
            {rightDropdownOpen && (
              <div
                id="right-show-options"
                role="listbox"
                onMouseDown={(event) => event.preventDefault()}
                className="absolute z-30 mt-2 w-full bg-arena-surface border border-arena-border rounded-2xl shadow-soft-card overflow-hidden"
              >
                {rightOptions.map((show, index) => (
                  <div
                    id={`right-show-option-${show.slug}`}
                    key={show.slug}
                    role="option"
                    aria-selected={index === rightActiveIndex}
                    onMouseEnter={() => setRightActiveIndex(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => selectRight(show)}
                    className={`w-full text-left px-4 py-2.5 flex items-center justify-between text-sm font-serif cursor-pointer ${index === rightActiveIndex ? 'bg-arena-cream' : ''}`}
                  >
                    <span className="font-semibold">{show.title}</span>
                    <span className="text-xs font-sans text-arena-muted">{show.network}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Main Comparison Card */}
      <main className="w-full bg-arena-surface border border-arena-border rounded-3xl p-5 sm:p-10 shadow-soft-card">
        <div className="flex items-center justify-between pb-4 sm:pb-6 mb-4 sm:mb-6 border-b border-arena-border/60 text-xs">
          <div className="flex items-center space-x-2">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
            <span className="font-medium text-arena-muted uppercase tracking-wider text-[10px] sm:text-[11px]">
              Metric: 7-Day Engagement Index
            </span>
          </div>
          <div className="bg-arena-cream px-2.5 py-1 rounded-full border border-arena-border/80 text-arena-muted text-[10px] sm:text-[11px] font-medium">
            7-Day Window
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 items-end relative mb-4 sm:mb-6">
          <div className="text-left pr-2 sm:pr-4">
            <span className="block text-[10px] sm:text-[11px] uppercase tracking-wider font-semibold text-arena-muted mb-1 sm:mb-1.5">
              {leftShow.network}
            </span>
            <h2 className="text-xl sm:text-3xl md:text-4xl font-serif font-bold text-arena-charcoal leading-tight">
              {leftShow.title}
            </h2>
          </div>
          <div className="absolute left-1/2 bottom-1 sm:bottom-2 -translate-x-1/2 text-stone-600 font-serif italic text-base sm:text-xl select-none">
            vs
          </div>
          <div className="text-right pl-2 sm:pl-4">
            <span className="block text-[10px] sm:text-[11px] uppercase tracking-wider font-semibold text-arena-muted mb-1 sm:mb-1.5">
              {rightShow.network}
            </span>
            <h2 className="text-xl sm:text-3xl md:text-4xl font-serif font-bold text-arena-charcoal leading-tight">
              {rightShow.title}
            </h2>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 items-center mb-4 sm:mb-6 pt-2 border-t border-arena-border/40 font-tabular">
          <div className="text-left">
            <div className="text-2xl sm:text-4xl md:text-5xl font-serif font-semibold">
              {leftShow.buzz_score.toLocaleString()}
            </div>
            <div className="text-[11px] sm:text-xs text-arena-muted font-medium mt-1 sm:mt-1.5">Engagement Index</div>
          </div>
          <div className="text-right">
            <div className="text-2xl sm:text-4xl md:text-5xl font-serif font-semibold">
              {rightShow.buzz_score.toLocaleString()}
            </div>
            <div className="text-[11px] sm:text-xs text-arena-muted font-medium mt-1 sm:mt-1.5">Engagement Index</div>
          </div>
        </div>

        {/* Tug of War Bar */}
        <div className="w-full my-4 sm:my-6">
          <div className="w-full h-3 sm:h-4 bg-arena-cream rounded-full overflow-hidden p-0.5 flex items-stretch border border-arena-border/70 shadow-inner">
            <div
              className="h-full rounded-l-full transition-all duration-700 ease-out bg-arena-terracotta"
              style={{ width: `${arenaStats.leftPct}%` }}
            />
            <div className="w-0.5 bg-arena-surface" />
            <div
              className="h-full rounded-r-full transition-all duration-700 ease-out bg-arena-sage"
              style={{ width: `${arenaStats.rightPct}%` }}
            />
          </div>
        </div>

        {/* Winner Footer */}
        <footer className="flex flex-col sm:flex-row items-start sm:items-center justify-between pt-3 sm:pt-4 border-t border-arena-border/50 text-xs sm:text-sm gap-3">
          <div className="flex items-center space-x-2">
            <span className="flex h-2 w-2 relative">
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  arenaStats.leftLeads ? 'bg-arena-terracotta' : 'bg-arena-sage'
                }`}
              />
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  arenaStats.leftLeads ? 'bg-arena-terracotta' : 'bg-arena-sage'
                }`}
              />
            </span>
            <p className="font-serif font-semibold text-base sm:text-xl text-arena-charcoal leading-none">
              {arenaStats.winner.title} leads
            </p>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
            <div className="text-[11px] sm:text-sm font-medium font-tabular text-arena-muted flex items-center">
              <span className="text-arena-charcoal font-semibold">
                {arenaStats.diff.toLocaleString()}
              </span>
              <span className="ml-1">more</span>
              <span className="mx-1.5">·</span>
              <span
                className={`font-semibold ${
                  arenaStats.leftLeads ? 'text-arena-terracotta' : 'text-emerald-700'
                }`}
              >
                +{arenaStats.diffPct}%
              </span>
            </div>
            <button
              type="button"
              onClick={handleCopyLink}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white hover:bg-[#FAF6F2] border border-arena-border hover:border-stone-300 text-stone-600 hover:text-stone-900 text-[11px] font-medium transition-all shadow-xs cursor-pointer"
              title="Copy battle URL to clipboard"
              aria-live="polite"
            >
              {copied ? (
                <>
                  <span className="text-emerald-600">✓</span>
                  <span className="text-emerald-700 font-semibold">Copied!</span>
                </>
              ) : copyFailed ? (
                <>
                  <span aria-hidden="true">!</span>
                  <span className="text-rose-700 font-semibold">Could not copy</span>
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5 text-arena-terracotta" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span>Copy Link</span>
                </>
              )}
            </button>
          </div>
        </footer>
        <ArenaTrajectoryOverlay leftShow={leftShow} rightShow={rightShow} />
      </main>
    </div>
  );
}
