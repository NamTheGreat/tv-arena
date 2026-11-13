import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SeriesItem } from '../lib/supabase';
import { calculateEventX, calculateNiceMaxScale, formatMetricNumber, sampleDailyValues } from '../lib/svgMath';
import { ActiveChartShow, ChartEvent, ChartRange, WORKBENCH_PALETTE } from './trajectoryChartTypes';
import { getCumulativeScore } from './trajectoryChartModel';

export function useTrajectoryChart({ seriesList, chartRange, focusedSlug }: {
  seriesList: SeriesItem[];
  chartRange: ChartRange;
  focusedSlug?: string;
}) {
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

  // Sync focusedSlug from props ONLY when the route slug itself changes
  const lastRouteFocusedSlugRef = useRef<string | undefined>(focusedSlug);
  useEffect(() => {
    if (focusedSlug && focusedSlug !== lastRouteFocusedSlugRef.current) {
      lastRouteFocusedSlugRef.current = focusedSlug;
      setSelectedSlugs((prev) => (prev.includes(focusedSlug) ? prev : [focusedSlug, ...prev.slice(0, 7)]));
    }
  }, [focusedSlug]);

  // Invariant: if isolated show is no longer in selectedSlugs, reset isolation so lines are not all muted
  useEffect(() => {
    if (isolatedSlug && !selectedSlugs.includes(isolatedSlug)) {
      setIsolatedSlug(null);
    }
  }, [selectedSlugs, isolatedSlug]);

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

  const breakoutShow = useMemo(
    () => seriesList.find((s) => s.is_breakout) || seriesList.slice().sort((a, b) => (b.delta_pct ?? 0) - (a.delta_pct ?? 0))[0],
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

  // Add / Pin show (capped at 8, replaces oldest candidate that is neither focused nor isolated)
  const addShow = (slug: string) => {
    if (selectedSlugs.includes(slug)) return;
    setSelectedSlugs((prev) => {
      if (prev.length < 8) {
        return [...prev, slug];
      }
      // Eviction should never drop the focused or isolated show when another candidate exists
      let dropIndex = prev.findIndex((s) => s !== focusedSlug && s !== isolatedSlug);
      if (dropIndex === -1) {
        // Fall back to oldest non-focused show if all other shows are isolated
        dropIndex = prev.findIndex((s) => s !== focusedSlug);
      }
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
        return (b.delta_pct ?? 0) - (a.delta_pct ?? 0);
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

  return {
    selectedSlugs, setSelectedSlugs, isolatedSlug, hoveredSlug, setHoveredSlug,
    pickerOpen, setPickerOpen, pickerQuery, setPickerQuery, pickerNetwork, setPickerNetwork,
    genreDropdownOpen, setGenreDropdownOpen, activePreset, catalogDrawerOpen, setCatalogDrawerOpen,
    catalogQuery, setCatalogQuery, pickerRef, genreRef, activeShows, xAxisLabels,
    maxChartScale, chartYTicks, sortedCumulativeShows, maxCumulativeScore,
    chartStartDate, chartEndDate, activeEvents, breakoutShow, addShow, removeShow,
    toggleIsolate, applyPreset, filteredPickerShows, pickerUnplottedCount, filteredCatalogShows,
  };
}
