import React from 'react';
import { SeriesItem } from '../lib/supabase';
import { ChartRange } from './trajectoryChartTypes';
import { useTrajectoryChart } from './useTrajectoryChart';
import { TrajectoryChartHeader } from './TrajectoryChartHeader';
import { TrajectoryChartLegend } from './TrajectoryChartLegend';
import { TrajectoryChartSvg } from './TrajectoryChartSvg';

export type { ChartRange } from './trajectoryChartTypes';

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
  const {
    selectedSlugs, isolatedSlug, hoveredSlug, setHoveredSlug,
    pickerOpen, setPickerOpen, pickerQuery, setPickerQuery, pickerNetwork, setPickerNetwork,
    genreDropdownOpen, setGenreDropdownOpen, catalogDrawerOpen, setCatalogDrawerOpen,
    catalogQuery, setCatalogQuery, pickerRef, genreRef, activePreset, activeShows, xAxisLabels,
    maxChartScale, chartYTicks, sortedCumulativeShows, maxCumulativeScore,
    activeEvents, breakoutShow, addShow, removeShow, toggleIsolate, applyPreset,
    filteredPickerShows, pickerUnplottedCount, filteredCatalogShows,
  } = useTrajectoryChart({ seriesList, chartRange, focusedSlug });

  return (
    <section
      className="w-full max-w-4xl bg-[#FFFDF9]/95 backdrop-blur-md rounded-3xl p-5 sm:p-8 lg:p-10 shadow-soft border border-[#EDE5DA]"
      data-purpose="charts-card"
    >
      <TrajectoryChartHeader
        breakoutShow={breakoutShow}
        addShow={addShow}
        selectedSlugs={selectedSlugs}
        chartRange={chartRange}
        setChartRange={setChartRange}
        activePreset={activePreset}
        applyPreset={applyPreset}
        genreDropdownOpen={genreDropdownOpen}
        setGenreDropdownOpen={setGenreDropdownOpen}
        genreRef={genreRef}
      />
      <TrajectoryChartLegend
        selectedSlugs={selectedSlugs}
        activeShows={activeShows}
        isolatedSlug={isolatedSlug}
        hoveredSlug={hoveredSlug}
        setHoveredSlug={setHoveredSlug}
        toggleIsolate={toggleIsolate}
        removeShow={removeShow}
        pickerRef={pickerRef}
        pickerOpen={pickerOpen}
        setPickerOpen={setPickerOpen}
        pickerQuery={pickerQuery}
        setPickerQuery={setPickerQuery}
        pickerNetwork={pickerNetwork}
        setPickerNetwork={setPickerNetwork}
        pickerUnplottedCount={pickerUnplottedCount}
        filteredPickerShows={filteredPickerShows}
        addShow={addShow}
      />
      <TrajectoryChartSvg
        chartRange={chartRange}
        chartYTicks={chartYTicks}
        xAxisLabels={xAxisLabels}
        activeEvents={activeEvents}
        activeShows={activeShows}
        maxChartScale={maxChartScale}
        isolatedSlug={isolatedSlug}
        hoveredSlug={hoveredSlug}
        setHoveredSlug={setHoveredSlug}
      />

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
