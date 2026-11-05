import React from 'react';
import { sampleDailyValues, buildChartGeometry, buildMobileChartGeometry } from '../lib/svgMath';
import { ChartRange, ActiveChartShow, ChartEvent } from './trajectoryChartTypes';

interface Props {
  chartRange: ChartRange;
  chartYTicks: Array<{ label: string }>;
  xAxisLabels: string[];
  activeEvents: ChartEvent[];
  activeShows: ActiveChartShow[];
  maxChartScale: number;
  isolatedSlug: string | null;
  hoveredSlug: string | null;
  setHoveredSlug: (slug: string | null) => void;
}

export function TrajectoryChartSvg({ chartRange, chartYTicks, xAxisLabels, activeEvents, activeShows, maxChartScale, isolatedSlug, hoveredSlug, setHoveredSlug }: Props) {
  return (
    <>
      {/* Mobile SVG (viewBox="0 0 340 185") */}
      <div className="block sm:hidden relative w-full overflow-hidden mt-1 mb-6">
        <svg role="img" aria-label={`Normalized ${chartRange} engagement trajectories for ${activeShows.map((show) => show.title).join(', ')}`} className="w-full h-auto select-none chart-group" viewBox="0 0 340 185">
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
        <svg role="img" aria-label={`Normalized ${chartRange} engagement trajectories for ${activeShows.map((show) => show.title).join(', ')}`} className="w-full h-auto select-none chart-group" viewBox="0 0 1000 420" xmlns="http://www.w3.org/2000/svg">
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
    </>
  );
}
