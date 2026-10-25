import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SeriesItem } from '../lib/supabase';
import {
  buildChartGeometry,
  buildMobileChartGeometry,
  calculateEventX,
  calculateNiceMaxScale,
  formatMetricNumber,
  sampleDailyValues,
} from '../lib/svgMath';

export type ChartRange = '7D' | '30D' | '90D' | 'All-Time';

export const WORKBENCH_PALETTE = [
  '#C66A3D', // Terracotta
  '#5C828C', // Teal
  '#C59A44', // Gold
  '#886F99', // Violet
  '#6E8761', // Sage
  '#A65D67', // Rose
  '#3D5A80', // Navy Slate
  '#B25B30', // Deep Rust
];

const GENRE_OPTIONS = [
  'Drama & Sci-Fi',
  'Comedy & Drama',
  'Crime & Mystery',
  'Drama',
];

interface TrajectoryChartProps {
  seriesList: SeriesItem[];
  chartRange: ChartRange;
  setChartRange: (range: ChartRange) => void;
  focusedSlug?: string;
}

export function TrajectoryChart({
  seriesList,
  chartRange,
  setChartRange,
  focusedSlug,
}: TrajectoryChartProps) {
  const [searchParams, setSearchParams] = useSearchParams();

  // Active series selection (max 8, min 1)
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>(() => {
    const urlChart = searchParams.get('chart');
    if (urlChart) {
      const parsed = urlChart
        .split(',')
        .map((s) => s.trim())
        .filter((slug) => seriesList.some((s) => s.slug === slug));
      if (parsed.length > 0) {
        return parsed.slice(0, 8);
      }
    }
    if (focusedSlug) {
      const focused = seriesList.find((s) => s.slug === focusedSlug);
      if (focused) {
        const others = seriesList.filter((s) => s.slug !== focusedSlug);
        return [focused.slug, ...others.slice(0, 5).map((s) => s.slug)];
      }
    }
    return seriesList.slice(0, 6).map((s) => s.slug);
  });

  // UI state for isolation, search, dropdowns
  const [isolatedSlug, setIsolatedSlug] = useState<string | null>(null);
  const [hoveredSlug, setHoveredSlug] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerNetwork, setPickerNetwork] = useState<string>('ALL');
  const [genreDropdownOpen, setGenreDropdownOpen] = useState(false);
  const [activePreset, setActivePreset] = useState<string>('top');
  const [catalogDrawerOpen, setCatalogDrawerOpen] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState('');

  const pickerRef = useRef<HTMLDivElement>(null);
  const genreRef = useRef<HTMLDivElement>(null);

  // Sync focusedSlug from props if it changes
  useEffect(() => {
    if (focusedSlug && !selectedSlugs.includes(focusedSlug)) {
      setSelectedSlugs((prev) => [focusedSlug, ...prev.slice(0, 7)]);
    }
  }, [focusedSlug]);

  // Sync selectedSlugs to URL search params (?chart=...)
  useEffect(() => {
    if (selectedSlugs.length > 0) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('chart', selectedSlugs.join(','));
          return next;
        },
        { replace: true }
      );
    }
  }, [selectedSlugs, setSearchParams]);

  // Close popups on click outside or Escape key
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
      if (genreRef.current && !genreRef.current.contains(e.target as Node)) {
        setGenreDropdownOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setPickerOpen(false);
        setGenreDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Map active shows and assign distinct colors from WORKBENCH_PALETTE
  const activeShows = useMemo(() => {
    const list: Array<SeriesItem & { assignedColor: string; slotIndex: number }> = [];
    selectedSlugs.forEach((slug, idx) => {
      const show = seriesList.find((s) => s.slug === slug);
      if (show) {
        list.push({
          ...show,
          assignedColor: WORKBENCH_PALETTE[idx % WORKBENCH_PALETTE.length],
          slotIndex: idx,
        });
      }
    });
    return list;
  }, [selectedSlugs, seriesList]);

  // Dynamic X-Axis labels responding to chosen time range with real calendar dates
  const xAxisLabels = useMemo(() => {
    const formatShortDate = (dateStrOrObj: string | Date): string => {
      if (typeof dateStrOrObj === 'string') {
        const parts = dateStrOrObj.split('-');
        if (parts.length === 3) {
          return `${Number(parts[1])}/${Number(parts[2])}`;
        }
      }
      const d = new Date(dateStrOrObj);
      return `${d.getMonth() + 1}/${d.getDate()}`;
    };

    const referenceShow = seriesList.find((s) => s.daily_dates && s.daily_dates.length > 0);
    const rawDates = referenceShow?.daily_dates || [];

    const days =
      chartRange === '7D'
        ? 7
        : chartRange === '30D'
        ? 30
        : chartRange === '90D'
        ? 90
        : Math.max(7, rawDates.length);

    if (rawDates.length > 0) {
      const windowDates = rawDates.slice(-days);
      if (windowDates.length <= 7) {
        const labels: string[] = [];
        const missingCount = 7 - windowDates.length;
        const firstDate = new Date(windowDates[0] + 'T00:00:00Z');
        for (let i = missingCount; i > 0; i--) {
          const d = new Date(firstDate);
          d.setUTCDate(d.getUTCDate() - i);
          labels.push(formatShortDate(d));
        }
        for (const ds of windowDates) {
          labels.push(formatShortDate(ds));
        }
        return labels;
      } else {
        const labels: string[] = [];
        for (let b = 0; b < 7; b++) {
          const idx = Math.min(
            windowDates.length - 1,
            Math.round((b / 6) * (windowDates.length - 1))
          );
          labels.push(formatShortDate(windowDates[idx]));
        }
        return labels;
      }
    }

    const labels: string[] = [];
    const now = new Date();
    const stepDays = chartRange === '7D' ? 1 : chartRange === '30D' ? 5 : chartRange === '90D' ? 15 : 20;
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i * stepDays);
      labels.push(formatShortDate(d));
    }
    return labels;
  }, [seriesList, chartRange]);

  // Dynamic Chart Scale & Y-Axis Ticks computed from activeShows
  const { maxChartScale, chartYTicks } = useMemo(() => {
    let maxVal = 0;
    for (const s of activeShows) {
      const sampled = sampleDailyValues(s.daily_series, chartRange);
      for (const v of sampled) {
        if (v > maxVal) maxVal = v;
      }
    }
    const niceMax = calculateNiceMaxScale(maxVal);

    const ticks = [
      { pct: 1.0, val: niceMax, label: formatMetricNumber(niceMax) },
      { pct: 0.75, val: Math.round(niceMax * 0.75), label: formatMetricNumber(Math.round(niceMax * 0.75)) },
      { pct: 0.50, val: Math.round(niceMax * 0.50), label: formatMetricNumber(Math.round(niceMax * 0.50)) },
      { pct: 0.25, val: Math.round(niceMax * 0.25), label: formatMetricNumber(Math.round(niceMax * 0.25)) },
      { pct: 0, val: 0, label: '0' },
    ];
    return { maxChartScale: niceMax, chartYTicks: ticks };
  }, [activeShows, chartRange]);

  const getCumulativeScore = (show: SeriesItem, range: ChartRange): number => {
    const days = range === '7D' ? 7 : range === '30D' ? 30 : range === '90D' ? 90 : show.daily_series.length;
    const slice = show.daily_series.slice(-days);
    if (slice.length > 0) {
      return slice.reduce((sum, v) => sum + v, 0);
    }
    return show.buzz_score;
  };

  const breakoutShow = useMemo(
    () => seriesList.find((s) => s.is_breakout) || seriesList.slice().sort((a, b) => b.delta_pct - a.delta_pct)[0],
    [seriesList]
  );

  // Active Plotted Shows sorted by cumulative volume
  const sortedCumulativeShows = useMemo(() => {
    return activeShows
      .slice()
      .map((show) => ({
        ...show,
        cumulativeScore: getCumulativeScore(show, chartRange),
      }))
      .sort((a, b) => b.cumulativeScore - a.cumulativeScore);
  }, [activeShows, chartRange]);

  const maxCumulativeScore = useMemo(() => {
    const scores = sortedCumulativeShows.map((s) => s.cumulativeScore);
    return Math.max(...scores, 1);
  }, [sortedCumulativeShows]);

  // Date range calculation for milestone event alignment
  const { chartStartDate, chartEndDate } = useMemo(() => {
    const referenceShow = seriesList.find((s) => s.daily_dates && s.daily_dates.length > 0);
    const rawDates = referenceShow?.daily_dates || [];
    const days =
      chartRange === '7D'
        ? 7
        : chartRange === '30D'
        ? 30
        : chartRange === '90D'
        ? 90
        : Math.max(7, rawDates.length);

    if (rawDates.length > 0) {
      const windowDates = rawDates.slice(-days);
      return {
        chartStartDate: windowDates[0],
        chartEndDate: windowDates[windowDates.length - 1],
      };
    }

    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - (days - 1));
    return {
      chartStartDate: start.toISOString().split('T')[0],
      chartEndDate: now.toISOString().split('T')[0],
    };
  }, [seriesList, chartRange]);

  // Milestone Event Annotations for active shows
  const activeEvents = useMemo(() => {
    const eventsWithCoords: Array<{
      id: string;
      title: string;
      color: string;
      label: string;
      date: string;
      xDesktop: number;
      xMobile: number;
    }> = [];

    for (const show of activeShows) {
      if (!show.events) continue;
      for (const ev of show.events) {
        const xD = calculateEventX(ev.event_date, chartStartDate, chartEndDate, false);
        const xM = calculateEventX(ev.event_date, chartStartDate, chartEndDate, true);
        if (xD !== null && xM !== null) {
          eventsWithCoords.push({
            id: `${show.slug}-${ev.kind}-${ev.event_date}`,
            title: show.title,
            color: show.assignedColor,
            label: ev.label,
            date: ev.event_date,
            xDesktop: xD,
            xMobile: xM,
          });
        }
      }
    }
    return eventsWithCoords;
  }, [activeShows, chartStartDate, chartEndDate]);

  // Add / Pin show (capped at 8, replaces oldest non-focused if full)
  const addShow = (slug: string) => {
    if (selectedSlugs.includes(slug)) return;
    setSelectedSlugs((prev) => {
      if (prev.length < 8) {
        return [...prev, slug];
      }
      // If at 8, drop first non-focused show (FIFO)
      const dropIndex = prev.findIndex((s) => s !== focusedSlug);
      const next = [...prev];
      if (dropIndex !== -1) {
        next.splice(dropIndex, 1);
      } else {
        next.shift();
      }
      return [...next, slug];
    });
    setActivePreset('custom');
  };

  // Remove show (enforcing 1-show minimum)
  const removeShow = (slug: string) => {
    if (selectedSlugs.length <= 1) return;
    setSelectedSlugs((prev) => prev.filter((s) => s !== slug));
    if (isolatedSlug === slug) setIsolatedSlug(null);
    setActivePreset('custom');
  };

  // Toggle isolation of a single series line
  const toggleIsolate = (slug: string) => {
    setIsolatedSlug((prev) => (prev === slug ? null : slug));
  };

  // Apply Cohort Presets
  const applyPreset = (preset: 'top' | 'breakouts' | 'netflix' | 'hbo' | 'apple' | string) => {
    setActivePreset(preset);
    let candidates = [...seriesList];

    if (preset === 'top') {
      candidates.sort((a, b) => b.buzz_score - a.buzz_score);
    } else if (preset === 'breakouts') {
      candidates.sort((a, b) => {
        if (a.is_breakout && !b.is_breakout) return -1;
        if (!a.is_breakout && b.is_breakout) return 1;
        return b.delta_pct - a.delta_pct;
      });
    } else if (preset === 'netflix') {
      candidates = candidates.filter((s) => s.network.toLowerCase().includes('netflix'));
    } else if (preset === 'hbo') {
      candidates = candidates.filter((s) => {
        const net = s.network.toLowerCase();
        return net.includes('hbo') || net.includes('max');
      });
    } else if (preset === 'apple') {
      candidates = candidates.filter((s) => s.network.toLowerCase().includes('apple'));
    } else if (preset.startsWith('genre:')) {
      const genre = preset.replace('genre:', '');
      candidates = candidates.filter((s) => s.genre_group === genre);
    }

    const nextSlugs = candidates.slice(0, 6).map((s) => s.slug);
    if (nextSlugs.length > 0) {
      setSelectedSlugs(nextSlugs);
      setIsolatedSlug(null);
    }
  };

  // Autocomplete search candidate list (unplotted shows sorted first, full catalog searchable)
  const filteredPickerShows = useMemo(() => {
    const q = pickerQuery.toLowerCase().trim();
    const filtered = seriesList.filter((s) => {
      const matchesQuery =
        !q ||
        s.title.toLowerCase().includes(q) ||
        s.network.toLowerCase().includes(q) ||
        s.genre_group.toLowerCase().includes(q);
      const matchesNet =
        pickerNetwork === 'ALL' ||
        s.network.toLowerCase().includes(pickerNetwork.toLowerCase());
      return matchesQuery && matchesNet;
    });

    // Unplotted shows sorted by buzz_score descending first, then plotted shows
    return filtered.sort((a, b) => {
      const aPlotted = selectedSlugs.includes(a.slug);
      const bPlotted = selectedSlugs.includes(b.slug);
      if (aPlotted !== bPlotted) {
        return aPlotted ? 1 : -1;
      }
      return (b.buzz_score || 0) - (a.buzz_score || 0);
    });
  }, [seriesList, pickerQuery, pickerNetwork, selectedSlugs]);

  const pickerUnplottedCount = useMemo(() => {
    return filteredPickerShows.filter((s) => !selectedSlugs.includes(s.slug)).length;
  }, [filteredPickerShows, selectedSlugs]);

  // Catalog drawer candidate list
  const filteredCatalogShows = useMemo(() => {
    const q = catalogQuery.toLowerCase().trim();
    if (!q) return seriesList;
    return seriesList.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.network.toLowerCase().includes(q) ||
        s.genre_group.toLowerCase().includes(q)
    );
  }, [seriesList, catalogQuery]);

  return (
    <section
      className="w-full max-w-4xl bg-[#FFFDF9]/95 backdrop-blur-md rounded-3xl p-5 sm:p-8 lg:p-10 shadow-soft border border-[#EDE5DA]"
      data-purpose="charts-card"
    >
      {/* Top Header of Card: Title + Time Range Switcher */}
      <div className="pb-5 border-b border-stone-200/60 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-block w-2 h-2 rounded-full bg-brand-terracotta ring-4 ring-brand-terracotta/20 animate-pulse" />
              <span className="text-xs font-semibold tracking-widest uppercase text-stone-500">
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
                    Breakout: <strong>{breakoutShow.title}</strong> (+{breakoutShow.delta_pct.toFixed(1)}%)
                  </span>
                  <span className="text-stone-400 font-mono">·</span>
                  <span className="text-brand-terracotta font-medium hover:underline">
                    {selectedSlugs.includes(breakoutShow.slug) ? '✓ Plotted' : '+ Pin to Plot'}
                  </span>
                </button>
              )}
            </div>
            <p className="text-xs text-stone-400 mt-1">
              Multivariate syndicated trajectory analyzer · Comparing {selectedSlugs.length} of 8 maximum series
            </p>
          </div>

          <div className="flex items-center gap-2 self-start lg:self-auto">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-400 mr-1">
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
                        : 'text-stone-500 hover:text-stone-900'
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
            <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-400 mr-1.5">
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
                <span className="text-[10px] text-stone-400">▾</span>
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

      {/* Legend Row: Removable Chips + Add Show Button */}
      <div className="pt-4 pb-4 space-y-3" data-purpose="chart-legend">
        <div className="flex flex-wrap items-center gap-2">
          {activeShows.map((show) => {
            const isIsolated = isolatedSlug === show.slug;
            const isDimmed = (isolatedSlug && !isIsolated) || (hoveredSlug && hoveredSlug !== show.slug);

            return (
              <div
                key={show.slug}
                onClick={() => toggleIsolate(show.slug)}
                onMouseEnter={() => setHoveredSlug(show.slug)}
                onMouseLeave={() => setHoveredSlug(null)}
                className={`inline-flex items-center gap-2 pl-2.5 pr-2 py-1 rounded-full bg-white shadow-sm text-xs font-medium transition-all cursor-pointer border ${
                  isIsolated
                    ? 'ring-2 ring-stone-800 scale-105'
                    : isDimmed
                    ? 'opacity-40 hover:opacity-100'
                    : 'hover:border-stone-400'
                }`}
                style={{
                  borderColor: isIsolated ? show.assignedColor : `${show.assignedColor}70`,
                  boxShadow: isIsolated ? `0 2px 8px ${show.assignedColor}30` : undefined,
                }}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: show.assignedColor }}
                />
                <span className="text-stone-800">{show.title}</span>
                <span className="text-[10px] text-stone-400 font-mono uppercase">
                  {show.network}
                </span>
                {selectedSlugs.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeShow(show.slug);
                    }}
                    className="text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-full w-4 h-4 inline-flex items-center justify-center transition-colors -mr-0.5"
                    title={`Remove ${show.title}`}
                    aria-label={`Remove ${show.title}`}
                  >
                    <svg
                      className="w-2.5 h-2.5 shrink-0"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    >
                      <path d="M2.5 2.5L9.5 9.5M9.5 2.5L2.5 9.5" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })}

          {/* + Compare Show Button with Popover */}
          <div className="relative inline-block" ref={pickerRef}>
            <button
              type="button"
              onClick={() => {
                setPickerOpen((prev) => !prev);
                setPickerQuery('');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-dashed border-stone-400 hover:border-brand-terracotta bg-white/60 hover:bg-white text-xs font-semibold text-stone-700 hover:text-brand-terracotta transition-all shadow-sm cursor-pointer"
            >
              <span className="text-sm leading-none font-bold">+</span>
              <span>Compare Show</span>
              <span className="px-1.5 py-0.2 bg-stone-100 text-stone-600 rounded text-[10px] font-mono">
                {selectedSlugs.length}/8
              </span>
            </button>

            {/* Compare Search Dropdown */}
            {pickerOpen && (
              <div className="absolute left-0 sm:right-0 sm:left-auto mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-nav border border-[#ECE5DC] p-3 z-40 text-xs">
                {/* Search Bar */}
                <div className="flex items-center gap-2 pb-2 mb-2 border-b border-stone-100">
                  <span className="text-stone-400">🔍</span>
                  <input
                    type="text"
                    value={pickerQuery}
                    onChange={(e) => setPickerQuery(e.target.value)}
                    placeholder="Search all series (e.g. The Office, Severance, Fallout)..."
                    autoFocus
                    className="w-full bg-transparent border-0 text-xs text-stone-800 placeholder-stone-400 focus:ring-0 p-0 font-medium"
                  />
                  {pickerQuery && (
                    <button
                      type="button"
                      onClick={() => setPickerQuery('')}
                      className="w-4 h-4 rounded-full inline-flex items-center justify-center text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors"
                      aria-label="Clear search"
                    >
                      <svg
                        className="w-2.5 h-2.5 shrink-0"
                        viewBox="0 0 12 12"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      >
                        <path d="M2.5 2.5L9.5 9.5M9.5 2.5L2.5 9.5" />
                      </svg>
                    </button>
                  )}
                </div>

                {/* Quick Network Filters */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-1.5 no-scrollbar text-[10px]">
                  {['ALL', 'Netflix', 'HBO', 'Apple TV+', 'Prime Video'].map((net) => (
                    <button
                      key={net}
                      type="button"
                      onClick={() => setPickerNetwork(net)}
                      className={`px-2 py-0.5 rounded-full font-medium whitespace-nowrap transition-colors ${
                        pickerNetwork === net
                          ? 'bg-stone-900 text-white'
                          : 'bg-stone-100 hover:bg-stone-200 text-stone-600'
                      }`}
                    >
                      {net}
                    </button>
                  ))}
                </div>

                {/* Status Bar */}
                <div className="flex items-center justify-between text-[10px] text-stone-400 font-medium px-1 pb-1.5 border-b border-stone-100">
                  <span>{pickerUnplottedCount} available to add</span>
                  <span>{selectedSlugs.length}/8 active</span>
                </div>

                {/* Scrollable Series List */}
                <div className="max-h-72 overflow-y-auto space-y-1 pr-0.5 mt-1">
                  {filteredPickerShows.length === 0 ? (
                    <p className="text-center py-6 text-stone-400 text-xs">
                      No matching series found.
                    </p>
                  ) : (
                    filteredPickerShows.map((s) => {
                      const isSelected = selectedSlugs.includes(s.slug);
                      return (
                        <div
                          key={s.slug}
                          className={`flex items-center justify-between p-2 rounded-xl transition-colors ${
                            isSelected ? 'bg-stone-50/70' : 'hover:bg-stone-50'
                          }`}
                        >
                          <div className="flex flex-col min-w-0 pr-2">
                            <span className="font-semibold text-stone-800 truncate">{s.title}</span>
                            <span className="text-[10px] text-stone-400 truncate">
                              {s.network} · {s.genre_group}
                            </span>
                          </div>
                          {isSelected ? (
                            <button
                              type="button"
                              onClick={() => removeShow(s.slug)}
                              disabled={selectedSlugs.length <= 1}
                              className="shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-rose-50 hover:text-rose-600 px-2 py-0.5 rounded-full border border-emerald-200 hover:border-rose-200 transition-colors group cursor-pointer"
                              title="Click to unplot"
                            >
                              <span className="group-hover:hidden">✓ Plotted</span>
                              <span className="hidden group-hover:inline">× Remove</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                addShow(s.slug);
                                setPickerOpen(false);
                              }}
                              className="shrink-0 px-2.5 py-0.5 rounded-full bg-brand-terracotta text-white font-semibold text-[11px] shadow-sm hover:bg-brand-terracotta-dark transition-colors cursor-pointer"
                            >
                              + Add
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Footer with Done button */}
                <div className="pt-2 mt-2 border-t border-stone-100 flex items-center justify-between text-xs">
                  <span className="text-[10px] text-stone-400">
                    {selectedSlugs.length >= 8 ? 'Capacity full (replaces oldest)' : 'Select up to 8'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPickerOpen(false)}
                    className="px-3 py-1 rounded-full bg-stone-900 text-white text-xs font-semibold hover:bg-stone-800 transition-colors cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile SVG (viewBox="0 0 340 185") */}
      <div className="block sm:hidden relative w-full overflow-hidden mt-1 mb-6">
        <svg className="w-full h-auto select-none chart-group" viewBox="0 0 340 185">
          <line stroke="#ECE5DA" strokeDasharray="2 3" x1="35" x2="335" y1="20" y2="20" />
          <text fill="#A89F91" fontSize="9" textAnchor="end" x="30" y="23">
            {chartYTicks[0]?.label || '100%'}
          </text>
          <line stroke="#ECE5DA" strokeDasharray="2 3" x1="35" x2="335" y1="55" y2="55" />
          <text fill="#A89F91" fontSize="9" textAnchor="end" x="30" y="58">
            {chartYTicks[1]?.label || '75%'}
          </text>
          <line stroke="#ECE5DA" strokeDasharray="2 3" x1="35" x2="335" y1="91" y2="91" />
          <text fill="#A89F91" fontSize="9" textAnchor="end" x="30" y="94">
            {chartYTicks[2]?.label || '50%'}
          </text>
          <line stroke="#ECE5DA" strokeDasharray="2 3" x1="35" x2="335" y1="126" y2="126" />
          <text fill="#A89F91" fontSize="9" textAnchor="end" x="30" y="129">
            {chartYTicks[3]?.label || '25%'}
          </text>
          <line stroke="#DDD4C7" strokeWidth="1" x1="35" x2="335" y1="162" y2="162" />
          <text fill="#A89F91" fontSize="9" textAnchor="end" x="30" y="165">
            0
          </text>

          {xAxisLabels.map((label, idx) => {
            const x = 35 + idx * 49;
            return (
              <g key={label + idx}>
                <line stroke="#F4EDE4" x1={x} x2={x} y1="20" y2="162" />
                <text fill="#999083" fontSize="8.5" textAnchor="middle" x={x} y="176">
                  {label}
                </text>
              </g>
            );
          })}

          {/* Milestone Event Annotations */}
          {activeEvents.map((ev) => (
            <g key={ev.id} role="img" aria-label={`${ev.title}: ${ev.label} (${ev.date})`}>
              <line
                stroke={ev.color}
                strokeDasharray="2 3"
                strokeWidth="1.25"
                strokeOpacity="0.85"
                x1={ev.xMobile}
                x2={ev.xMobile}
                y1="16"
                y2="162"
              />
              <circle cx={ev.xMobile} cy="16" r="3" fill={ev.color} stroke="#FFFFFF" strokeWidth="1" />
            </g>
          ))}

          {activeShows.map((show) => {
            const sampled = sampleDailyValues(show.daily_series, chartRange);
            const { pathD, points } = buildMobileChartGeometry(sampled, maxChartScale);
            const color = show.assignedColor;
            const isIsolated = isolatedSlug === show.slug;
            const isDimmed = (isolatedSlug && !isIsolated) || (hoveredSlug && hoveredSlug !== show.slug);
            const isHighlighted = (isolatedSlug === show.slug) || (hoveredSlug === show.slug);

            return (
              <g
                key={show.slug}
                opacity={isDimmed ? 0.2 : 1}
                className="transition-opacity duration-200"
              >
                <path
                  className="chart-line"
                  d={pathD}
                  fill="none"
                  stroke={color}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={isHighlighted ? 3.5 : 2}
                />
                {points.map((pt, i) => (
                  <circle
                    key={i}
                    cx={pt.x}
                    cy={pt.y}
                    fill={color}
                    r={i === 6 ? (isHighlighted ? 4.5 : 3.5) : (isHighlighted ? 3.5 : 2.5)}
                  />
                ))}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Desktop SVG (viewBox="0 0 1000 420") */}
      <div className="hidden sm:block relative w-full overflow-hidden mt-1 mb-8" data-purpose="svg-trend-visualization">
        <svg className="w-full h-auto select-none chart-group" viewBox="0 0 1000 420" xmlns="http://www.w3.org/2000/svg">
          <line stroke="#ECE5DA" strokeDasharray="3 4" x1="75" x2="960" y1="40" y2="40" />
          <text fill="#A89F91" fontSize="11" textAnchor="end" x="65" y="44">
            {chartYTicks[0]?.label || '100%'}
          </text>
          <line stroke="#ECE5DA" strokeDasharray="3 4" x1="75" x2="960" y1="115" y2="115" />
          <text fill="#A89F91" fontSize="11" textAnchor="end" x="65" y="119">
            {chartYTicks[1]?.label || '75%'}
          </text>
          <line stroke="#ECE5DA" strokeDasharray="3 4" x1="75" x2="960" y1="190" y2="190" />
          <text fill="#A89F91" fontSize="11" textAnchor="end" x="65" y="194">
            {chartYTicks[2]?.label || '50%'}
          </text>
          <line stroke="#ECE5DA" strokeDasharray="3 4" x1="75" x2="960" y1="265" y2="265" />
          <text fill="#A89F91" fontSize="11" textAnchor="end" x="65" y="269">
            {chartYTicks[3]?.label || '25%'}
          </text>
          <line stroke="#DDD4C7" strokeWidth="1.25" x1="75" x2="960" y1="340" y2="340" />
          <text fill="#A89F91" fontSize="11" textAnchor="end" x="65" y="344">
            0
          </text>

          {xAxisLabels.map((label, idx) => {
            const x = 85 + idx * 145;
            return (
              <g key={label + idx}>
                <line stroke="#F4EDE4" x1={x} x2={x} y1="40" y2="340" />
                <text fill="#999083" fontSize="12" textAnchor="middle" x={x} y="375">
                  {label}
                </text>
              </g>
            );
          })}

          {/* Milestone Event Annotations */}
          {activeEvents.map((ev) => (
            <g key={ev.id} role="img" aria-label={`${ev.title}: ${ev.label} (${ev.date})`}>
              <line
                stroke={ev.color}
                strokeDasharray="3 4"
                strokeWidth="1.5"
                strokeOpacity="0.85"
                x1={ev.xDesktop}
                x2={ev.xDesktop}
                y1="32"
                y2="340"
              />
              <rect
                x={ev.xDesktop - 44}
                y="14"
                width="88"
                height="18"
                rx="4"
                fill="#FFFFFF"
                stroke={ev.color}
                strokeWidth="1.2"
                className="shadow-sm"
              />
              <text
                x={ev.xDesktop}
                y="26.5"
                fill="#1E1A17"
                fontSize="9"
                fontWeight="600"
                textAnchor="middle"
              >
                {ev.label}
              </text>
            </g>
          ))}

          {activeShows.map((show) => {
            const sampled = sampleDailyValues(show.daily_series, chartRange);
            const { pathD, points } = buildChartGeometry(sampled, maxChartScale);
            const color = show.assignedColor;
            const isIsolated = isolatedSlug === show.slug;
            const isDimmed = (isolatedSlug && !isIsolated) || (hoveredSlug && hoveredSlug !== show.slug);
            const isHighlighted = (isolatedSlug === show.slug) || (hoveredSlug === show.slug);

            return (
              <g
                key={show.slug}
                opacity={isDimmed ? 0.2 : 1}
                className="transition-opacity duration-200"
                onMouseEnter={() => setHoveredSlug(show.slug)}
                onMouseLeave={() => setHoveredSlug(null)}
              >
                <path
                  className="chart-line"
                  d={pathD}
                  fill="none"
                  stroke={color}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={isHighlighted ? 4 : 2.5}
                />
                {points.map((pt, i) => (
                  <circle
                    key={i}
                    cx={pt.x}
                    cy={pt.y}
                    fill={color}
                    r={i === 6 ? (isHighlighted ? 6 : 4.5) : (isHighlighted ? 5 : 3.5)}
                  />
                ))}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Cumulative Horizontal Volume Bars (1:1 with Active Plotted Shows) */}
      <div className="pt-6 border-t border-stone-200/60 space-y-4" data-purpose="volume-breakdown">
        <div className="flex items-center justify-between text-xs text-stone-500 font-medium">
          <span>Cumulative Period Telemetry (Active Plotted Shows · {chartRange})</span>
          <span>Total Measured Viewers</span>
        </div>

        <div className="space-y-3">
          {sortedCumulativeShows.map((show, idx) => {
            const score = show.cumulativeScore;
            const pct = Math.min(100, Math.max(2, Math.round((score / maxCumulativeScore) * 100)));
            const isIsolated = isolatedSlug === show.slug;

            return (
              <div
                key={show.slug}
                onClick={() => toggleIsolate(show.slug)}
                className={`flex items-center gap-3 sm:gap-4 p-2 rounded-2xl transition-all cursor-pointer ${
                  isIsolated ? 'bg-stone-100/80 shadow-sm' : 'hover:bg-stone-50/60'
                }`}
              >
                <span className="text-xs font-mono font-semibold text-stone-400 w-5">
                  #{idx + 1}
                </span>
                <span className="w-40 sm:w-48 text-sm font-medium text-stone-800 shrink-0 font-serif md:text-base flex items-center gap-2 truncate">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: show.assignedColor }}
                  />
                  <span className="truncate">{show.title}</span>
                </span>
                <div className="flex-1 bg-[#F1EAE0] h-3 rounded-full overflow-hidden p-0.5">
                  <div
                    className="h-full rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${pct}%`, backgroundColor: show.assignedColor }}
                  />
                </div>
                <span className="w-24 text-right text-xs md:text-sm font-medium tracking-tight text-stone-700 font-mono">
                  {score.toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>

        {/* Expandable Catalog Browser Footer */}
        <div className="pt-3 border-t border-stone-100">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setCatalogDrawerOpen((prev) => !prev)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-600 hover:text-brand-terracotta transition-colors"
            >
              <span>{catalogDrawerOpen ? '▲ Hide Catalog Browser' : '▼ Browse All 200+ Series Trajectories'}</span>
              <span className="text-[10px] text-stone-400 font-normal">
                ({seriesList.length} total series)
              </span>
            </button>
            {catalogDrawerOpen && (
              <span className="text-[11px] text-stone-400 font-medium">
                Click "+ Pin" to add any show to the active SVG chart (up to 8)
              </span>
            )}
          </div>

          {catalogDrawerOpen && (
            <div className="mt-4 p-4 bg-[#FAF6F0] rounded-2xl border border-stone-200/70 space-y-3">
              <div className="flex items-center gap-2 p-2 bg-white rounded-xl border border-stone-200 shadow-sm">
                <span className="text-stone-400 text-sm">🔍</span>
                <input
                  type="text"
                  value={catalogQuery}
                  onChange={(e) => setCatalogQuery(e.target.value)}
                  placeholder="Filter catalog by name, network, or genre..."
                  className="w-full bg-transparent border-0 text-xs text-stone-800 placeholder-stone-400 focus:ring-0 p-0 font-medium"
                />
                {catalogQuery && (
                  <button
                    type="button"
                    onClick={() => setCatalogQuery('')}
                    className="text-xs text-stone-400 hover:text-stone-700"
                  >
                    Clear
                  </button>
                )}
              </div>

              <div className="max-h-72 overflow-y-auto divide-y divide-stone-200/50">
                {filteredCatalogShows.map((s, i) => {
                  const isSelected = selectedSlugs.includes(s.slug);
                  return (
                    <div
                      key={s.slug}
                      className="py-2 px-1 flex items-center justify-between hover:bg-white/80 rounded-lg transition-colors text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-stone-400 text-[11px] w-6">#{i + 1}</span>
                        <div>
                          <div className="font-medium text-stone-800 flex items-center gap-1.5">
                            <span>{s.title}</span>
                            {s.is_breakout && (
                              <span className="text-[9px] px-1.5 py-0.2 bg-amber-100 text-amber-800 font-bold rounded-full">
                                🔥
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-stone-400">
                            {s.network} · {s.genre_group} · {s.release_years}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="font-mono text-stone-600 text-xs">
                          {s.buzz_score.toLocaleString()}
                        </span>
                        {isSelected ? (
                          <button
                            type="button"
                            onClick={() => removeShow(s.slug)}
                            className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 hover:bg-rose-100 hover:text-rose-800 transition-colors"
                            title="Click to remove from chart"
                          >
                            ✓ Plotted (×)
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => addShow(s.slug)}
                            className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-white border border-stone-300 hover:border-brand-terracotta hover:text-brand-terracotta text-stone-700 shadow-sm transition-all"
                          >
                            + Pin to Chart
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
