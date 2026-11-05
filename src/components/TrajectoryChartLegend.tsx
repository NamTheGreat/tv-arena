import React from 'react';
import { SeriesItem } from '../lib/supabase';
import { ActiveChartShow } from './trajectoryChartTypes';

interface Props {
  selectedSlugs: string[];
  activeShows: ActiveChartShow[];
  isolatedSlug: string | null;
  hoveredSlug: string | null;
  setHoveredSlug: (slug: string | null) => void;
  toggleIsolate: (slug: string) => void;
  removeShow: (slug: string) => void;
  pickerRef: React.RefObject<HTMLDivElement | null>;
  pickerOpen: boolean;
  setPickerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  pickerQuery: string;
  setPickerQuery: React.Dispatch<React.SetStateAction<string>>;
  pickerNetwork: string;
  setPickerNetwork: React.Dispatch<React.SetStateAction<string>>;
  pickerUnplottedCount: number;
  filteredPickerShows: SeriesItem[];
  addShow: (slug: string) => void;
}

export function TrajectoryChartLegend({ selectedSlugs, activeShows, isolatedSlug, hoveredSlug, setHoveredSlug, toggleIsolate, removeShow, pickerRef, pickerOpen, setPickerOpen, pickerQuery, setPickerQuery, pickerNetwork, setPickerNetwork, pickerUnplottedCount, filteredPickerShows, addShow }: Props) {
  return (
    <>
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
                <span className="text-[10px] text-stone-600 font-mono uppercase">
                  {show.network}
                </span>
                {selectedSlugs.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeShow(show.slug);
                    }}
                    className="text-stone-600 hover:text-stone-700 hover:bg-stone-100 rounded-full w-4 h-4 inline-flex items-center justify-center transition-colors -mr-0.5"
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
                  <span className="text-stone-600">🔍</span>
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
                      className="w-4 h-4 rounded-full inline-flex items-center justify-center text-stone-600 hover:text-stone-600 hover:bg-stone-100 transition-colors"
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
                <div className="flex items-center justify-between text-[10px] text-stone-600 font-medium px-1 pb-1.5 border-b border-stone-100">
                  <span>{pickerUnplottedCount} available to add</span>
                  <span>{selectedSlugs.length}/8 active</span>
                </div>

                {/* Scrollable Series List */}
                <div className="max-h-72 overflow-y-auto space-y-1 pr-0.5 mt-1">
                  {filteredPickerShows.length === 0 ? (
                    <p className="text-center py-6 text-stone-600 text-xs">
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
                            <span className="text-[10px] text-stone-600 truncate">
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
                  <span className="text-[10px] text-stone-600">
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
    </>
  );
}
