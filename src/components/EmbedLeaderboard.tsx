import React, { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { SeriesItem } from '../lib/supabase';
import { buildSparklinePoints, readEmbedQuery, safeChartColor, selectEmbedShows } from '../lib/embed';
import { formatMetricNumber } from '../lib/svgMath';

interface EmbedLeaderboardProps {
  seriesList: SeriesItem[];
  isLoading: boolean;
  error?: string | null;
}

const SPARK_WIDTH = 72;
const SPARK_HEIGHT = 24;

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const points = buildSparklinePoints(values, SPARK_WIDTH, SPARK_HEIGHT);
  return (
    <svg
      width={SPARK_WIDTH}
      height={SPARK_HEIGHT}
      viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
      className="shrink-0"
      aria-hidden="true"
      focusable="false"
      data-testid="embed-sparkline"
    >
      {points ? (
        <polyline points={points} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <line x1="2" y1={SPARK_HEIGHT / 2} x2={SPARK_WIDTH - 2} y2={SPARK_HEIGHT / 2} stroke="#d6d3d1" strokeWidth="1.5" strokeDasharray="3 3" />
      )}
    </svg>
  );
}

/**
 * Chrome-less leaderboard for iframes: /embed, /embed/top5, /embed/leaderboard.
 * Query: limit (1-10, default 5), genre, platform. Links open in a new tab.
 */
export function EmbedLeaderboard({ seriesList, isLoading, error }: EmbedLeaderboardProps) {
  const [searchParams] = useSearchParams();
  const query = useMemo(() => readEmbedQuery(searchParams), [searchParams]);
  const shows = useMemo(() => selectEmbedShows(seriesList, query), [seriesList, query]);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'TV Arena — Top shows';
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex';
    document.head.appendChild(robots);
    return () => {
      document.title = previousTitle;
      robots.remove();
    };
  }, []);

  const filterLabel = [query.platform, query.genre].filter(Boolean).join(' · ');

  let body: React.ReactNode;
  if (isLoading && seriesList.length === 0) {
    body = <p role="status" className="px-4 py-8 text-center text-sm text-stone-600">Loading live rankings…</p>;
  } else if (error && seriesList.length === 0) {
    body = <p role="alert" className="px-4 py-8 text-center text-sm text-stone-600">Rankings are temporarily unavailable.</p>;
  } else if (shows.length === 0) {
    body = <p role="status" className="px-4 py-8 text-center text-sm text-stone-600">No shows match this filter.</p>;
  } else {
    body = (
      <ol aria-label="Top shows by 7-day buzz score" className="divide-y divide-stone-100">
        {shows.map((show, index) => (
          <li key={show.slug} className="flex items-center gap-3 px-4 py-2.5">
            <span className="w-5 shrink-0 text-sm font-semibold tabular-nums text-stone-500" aria-label={`Rank ${index + 1}`}>
              {index + 1}
            </span>
            <a
              href={`/show/${encodeURIComponent(show.slug)}`}
              target="_blank"
              rel="noopener"
              className="min-w-0 flex-1 truncate font-serif text-base font-medium text-stone-900 hover:underline focus-visible:underline focus-visible:outline-none"
            >
              {show.title}
            </a>
            <Sparkline values={show.daily_series ?? []} color={safeChartColor(show.chart_color)} />
            <span className="w-14 shrink-0 text-right text-sm font-semibold tabular-nums text-stone-900">
              {formatMetricNumber(Number(show.buzz_score || 0))}
            </span>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <main className="min-h-screen bg-white font-sans text-stone-900">
      <header className="flex items-baseline justify-between gap-2 border-b border-stone-200 px-4 py-3">
        <h1 className="font-serif text-lg font-medium tracking-tight">
          TV <span className="italic text-[#B4552B]">Arena</span> Top {query.limit}
        </h1>
        <span className="truncate text-xs text-stone-600">{filterLabel || '7-day buzz'}</span>
      </header>
      {body}
      <footer className="border-t border-stone-200 px-4 py-2.5 text-center text-xs text-stone-600">
        Live rankings by{' '}
        <a href="/" target="_blank" rel="noopener" className="font-semibold text-[#B4552B] underline">
          TV Arena
        </a>
      </footer>
    </main>
  );
}
