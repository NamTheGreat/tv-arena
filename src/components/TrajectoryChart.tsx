import React, { useMemo } from 'react';
import { SeriesItem } from '../lib/supabase';
import {
  buildChartGeometry,
  buildMobileChartGeometry,
  calculateNiceMaxScale,
  formatMetricNumber,
  sampleDailyValues,
} from '../lib/svgMath';

export type ChartRange = '7D' | '30D' | '90D' | 'All-Time';

interface TrajectoryChartProps {
  seriesList: SeriesItem[];
  chartRange: ChartRange;
  setChartRange: (range: ChartRange) => void;
}

export function TrajectoryChart({
  seriesList,
  chartRange,
  setChartRange,
}: TrajectoryChartProps) {
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
        const bucketSize = windowDates.length / 7;
        const labels: string[] = [];
        for (let b = 0; b < 7; b++) {
          const idx = Math.min(windowDates.length - 1, Math.floor(b * bucketSize));
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

  // Dynamic Chart Scale & Y-Axis Ticks
  const chartSeries = useMemo(() => seriesList.slice(0, 6), [seriesList]);
  const { maxChartScale, chartYTicks } = useMemo(() => {
    let maxVal = 0;
    for (const s of chartSeries) {
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
  }, [chartSeries, chartRange]);

  const getCumulativeScore = (show: SeriesItem, range: ChartRange): number => {
    const days = range === '7D' ? 7 : range === '30D' ? 30 : range === '90D' ? 90 : show.daily_series.length;
    const slice = show.daily_series.slice(-days);
    if (slice.length > 0) {
      return slice.reduce((sum, v) => sum + v, 0);
    }
    return show.viewers_premiere_28d;
  };

  const topCumulativeShows = useMemo(() => seriesList.slice(0, 3), [seriesList]);
  const maxCumulativeScore = useMemo(() => {
    const scores = topCumulativeShows.map((s) => getCumulativeScore(s, chartRange));
    return Math.max(...scores, 1);
  }, [topCumulativeShows, chartRange]);

  return (
    <section className="w-full max-w-5xl bg-[#FFFDF9]/95 backdrop-blur-md rounded-3xl p-5 sm:p-8 lg:p-10 shadow-soft border border-[#EDE5DA]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 pb-4 sm:pb-6 border-b border-stone-200/60">
        <div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-brand-terracotta" />
            <span className="text-[10px] sm:text-xs font-semibold tracking-widest uppercase text-stone-500">
              Metric: Daily Engagement Index
            </span>
          </div>
          <p className="text-[10px] sm:text-xs text-stone-400 mt-0.5 sm:mt-1">
            Daily synthesized telemetry across Wikipedia pageviews &amp; Reddit discussion metrics
          </p>
        </div>
        <div className="self-end sm:self-auto inline-flex items-center bg-[#F3EFE9] p-0.5 sm:p-1 rounded-full text-[10px] sm:text-xs font-medium border border-[#E7DFD5]">
          {(['7D', '30D', '90D', 'All-Time'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setChartRange(r)}
              className={`px-2.5 sm:px-3.5 py-0.5 sm:py-1 rounded-full transition-colors ${
                chartRange === r
                  ? 'bg-white text-stone-800 shadow-sm font-semibold'
                  : 'text-stone-500 hover:text-stone-900'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-start sm:justify-center gap-x-3.5 sm:gap-x-6 gap-y-1.5 sm:gap-y-2.5 pt-4 sm:pt-6 pb-4 sm:pb-6 text-[10.5px] sm:text-xs font-medium text-stone-600">
        {seriesList.slice(0, 6).map((s) => (
          <div key={s.slug} className="flex items-center gap-1.5 sm:gap-2">
            <span
              className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full"
              style={{ backgroundColor: s.chart_color }}
            />
            <span className="text-stone-800 font-medium">{s.title}</span>
          </div>
        ))}
      </div>

      {/* Mobile SVG (viewBox="0 0 340 185") */}
      <div className="block sm:hidden relative w-full overflow-hidden mt-1 mb-6">
        <svg className="w-full h-auto select-none chart-group" viewBox="0 0 340 185">
          <line stroke="#ECE5DA" strokeDasharray="2 3" x1="35" x2="335" y1="20" y2="20" />
          <text fill="#A89F91" fontSize="9" textAnchor="end" x="30" y="23">{chartYTicks[0]?.label || '100%'}</text>
          <line stroke="#ECE5DA" strokeDasharray="2 3" x1="35" x2="335" y1="55" y2="55" />
          <text fill="#A89F91" fontSize="9" textAnchor="end" x="30" y="58">{chartYTicks[1]?.label || '75%'}</text>
          <line stroke="#ECE5DA" strokeDasharray="2 3" x1="35" x2="335" y1="91" y2="91" />
          <text fill="#A89F91" fontSize="9" textAnchor="end" x="30" y="94">{chartYTicks[2]?.label || '50%'}</text>
          <line stroke="#ECE5DA" strokeDasharray="2 3" x1="35" x2="335" y1="126" y2="126" />
          <text fill="#A89F91" fontSize="9" textAnchor="end" x="30" y="129">{chartYTicks[3]?.label || '25%'}</text>
          <line stroke="#DDD4C7" strokeWidth="1" x1="35" x2="335" y1="162" y2="162" />
          <text fill="#A89F91" fontSize="9" textAnchor="end" x="30" y="165">0</text>

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

          {seriesList.slice(0, 6).map((show) => {
            const sampled = sampleDailyValues(show.daily_series, chartRange);
            const { pathD, points } = buildMobileChartGeometry(sampled, maxChartScale);
            return (
              <g key={show.slug}>
                <path
                  className="chart-line"
                  d={pathD}
                  fill="none"
                  stroke={show.chart_color}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
                {points.map((pt, i) => (
                  <circle
                    key={i}
                    cx={pt.x}
                    cy={pt.y}
                    fill={show.chart_color}
                    r={i === 6 ? 3.5 : 2.5}
                  />
                ))}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Desktop SVG (viewBox="0 0 1000 420") */}
      <div className="hidden sm:block relative w-full overflow-hidden mt-1 mb-8">
        <svg className="w-full h-auto select-none chart-group" viewBox="0 0 1000 420">
          <line stroke="#ECE5DA" strokeDasharray="3 4" x1="75" x2="960" y1="40" y2="40" />
          <text fill="#A89F91" fontSize="11" textAnchor="end" x="65" y="44">{chartYTicks[0]?.label || '100%'}</text>
          <line stroke="#ECE5DA" strokeDasharray="3 4" x1="75" x2="960" y1="115" y2="115" />
          <text fill="#A89F91" fontSize="11" textAnchor="end" x="65" y="119">{chartYTicks[1]?.label || '75%'}</text>
          <line stroke="#ECE5DA" strokeDasharray="3 4" x1="75" x2="960" y1="190" y2="190" />
          <text fill="#A89F91" fontSize="11" textAnchor="end" x="65" y="194">{chartYTicks[2]?.label || '50%'}</text>
          <line stroke="#ECE5DA" strokeDasharray="3 4" x1="75" x2="960" y1="265" y2="265" />
          <text fill="#A89F91" fontSize="11" textAnchor="end" x="65" y="269">{chartYTicks[3]?.label || '25%'}</text>
          <line stroke="#DDD4C7" strokeWidth="1.25" x1="75" x2="960" y1="340" y2="340" />
          <text fill="#A89F91" fontSize="11" textAnchor="end" x="65" y="344">0</text>

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

          {seriesList.slice(0, 6).map((show) => {
            const sampled = sampleDailyValues(show.daily_series, chartRange);
            const { pathD, points } = buildChartGeometry(sampled, maxChartScale);
            return (
              <g key={show.slug}>
                <path
                  className="chart-line"
                  d={pathD}
                  fill="none"
                  stroke={show.chart_color}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.5"
                />
                {points.map((pt, i) => (
                  <circle
                    key={i}
                    cx={pt.x}
                    cy={pt.y}
                    fill={show.chart_color}
                    r={i === 6 ? 4.5 : 3.5}
                  />
                ))}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Cumulative Horizontal Volume Bars */}
      <div className="pt-4 sm:pt-6 border-t border-stone-200/60 space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between text-[11px] sm:text-xs mb-2 sm:mb-3 text-stone-500 font-medium">
          <span>Cumulative Period Totals ({chartRange})</span>
          <span>Cumulative Engagement</span>
        </div>
        {topCumulativeShows.map((show) => {
          const score = getCumulativeScore(show, chartRange);
          const pct = Math.min(100, Math.max(2, Math.round((score / maxCumulativeScore) * 100)));
          return (
            <div key={show.slug} className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4">
              <div className="flex items-center justify-between sm:w-44 shrink-0">
                <span className="text-sm md:text-base font-medium text-stone-800 font-serif">
                  {show.title}
                </span>
                <span className="sm:hidden text-xs font-medium text-stone-700 font-tabular">
                  {score.toLocaleString()}
                </span>
              </div>
              <div className="flex-1 bg-[#F1EAE0] h-2.5 sm:h-3 rounded-full overflow-hidden p-0.5">
                <div
                  className="h-full bg-[#C66A3D] rounded-full transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="hidden sm:inline-block w-24 text-right text-xs md:text-sm font-medium text-stone-700 font-tabular">
                {score.toLocaleString()}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
