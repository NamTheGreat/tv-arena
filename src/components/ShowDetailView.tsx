import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { SeriesItem } from '../lib/supabase';
import { sampleDailyValues, buildMobileChartGeometry } from '../lib/svgMath';

interface ShowDetailViewProps {
  seriesList: SeriesItem[];
}

export function ShowDetailView({ seriesList }: ShowDetailViewProps) {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const show = seriesList.find((s) => s.slug === slug);

  useEffect(() => {
    if (show) {
      document.title = `${show.title} — TV Arena Intelligence`;
    } else {
      document.title = 'Show Details — TV Arena';
    }
  }, [show]);

  if (!show) {
    return (
      <main className="w-full max-w-lg mx-auto bg-white/90 backdrop-blur-xl rounded-[28px] p-6 sm:p-10 shadow-card border border-[#EFEAE2]/90 text-center my-8">
        <h2 className="font-serif text-2xl font-medium text-arena-charcoal mb-2">Show Not Found</h2>
        <p className="text-xs sm:text-sm text-arena-muted mb-6">
          No television series matched the slug <code className="bg-stone-100 px-1 py-0.5 rounded text-stone-700">{slug}</code>.
        </p>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="px-5 py-2 rounded-full bg-arena-terracotta text-white text-xs font-semibold shadow-pill hover:bg-arena-terracottaHover"
        >
          Return to Leaderboard
        </button>
      </main>
    );
  }

  // Find a suggested rival for head-to-head battle
  const rival =
    seriesList.find((s) => s.slug !== show.slug && (s.network === show.network || s.genre_group === show.genre_group)) ||
    seriesList.find((s) => s.slug !== show.slug) ||
    show;

  const sampled = sampleDailyValues(show.daily_series, '7D');
  const maxSampled = Math.max(...sampled, 1);
  const { pathD, points } = buildMobileChartGeometry(sampled, maxSampled);
  const isNew = show.delta_pct === null || show.delta_pct === undefined;
  const isSteady = !isNew && Math.abs(show.delta_pct as number) < 0.5;
  const isUp = !isNew && (show.delta_pct as number) > 0;
  const score = show.buzz_score ?? 0;

  return (
    <main className="w-full max-w-2xl mx-auto bg-white/95 backdrop-blur-xl rounded-[28px] sm:rounded-[32px] p-6 sm:p-10 shadow-card border border-[#EFEAE2]/90 my-4 text-left">
      {/* Top Breadcrumb */}
      <div className="flex items-center justify-between pb-4 border-b border-stone-100 mb-6">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-arena-muted hover:text-arena-charcoal transition-colors cursor-pointer"
        >
          <span>← Back to Leaderboard</span>
        </button>
        <span className="text-[10.5px] uppercase font-semibold tracking-wider text-arena-faint">
          Show Dossier
        </span>
      </div>

      {/* Main Show Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: show.chart_color || '#C66A3D' }}
            />
            <span className="text-xs uppercase font-semibold tracking-wider text-arena-muted">
              {show.network}
            </span>
            <span className="text-stone-300">·</span>
            <span className="text-xs text-arena-muted">{show.genre_group}</span>
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl font-medium text-arena-charcoal">
            {show.title}
          </h1>
          <p className="text-xs text-arena-faint mt-1">{show.release_years}</p>
        </div>

        {/* Score Card */}
        <div className="bg-[#FAF6F2] border border-[#EEE4DB] rounded-2xl p-4 text-right shrink-0">
          <div className="text-[10px] uppercase font-semibold tracking-wider text-arena-muted mb-0.5">
            Engagement Index
          </div>
          <div className="font-serif text-2xl sm:text-3xl font-semibold text-arena-charcoal">
            {score.toLocaleString()}
          </div>
          <div className="text-xs font-medium mt-1">
            {isNew ? (
              <span className="text-brand-terracotta font-semibold">NEW</span>
            ) : isSteady ? (
              <span className="text-stone-500">Steady</span>
            ) : isUp ? (
              <span className="text-emerald-600">+{(show.delta_pct || 0)}%</span>
            ) : (
              <span className="text-rose-600">{show.delta_pct}%</span>
            )}
          </div>
        </div>
      </div>

      {/* 7-Day Sparkline */}
      <div className="p-4 rounded-2xl bg-stone-50/70 border border-stone-200/60 mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-stone-700">7-Day Trajectory Velocity</span>
          <span className="text-[11px] text-stone-500">Relative Scale</span>
        </div>
        <div className="w-full h-24 sm:h-32">
          <svg className="w-full h-full" viewBox="0 0 340 185" preserveAspectRatio="none">
            <path
              d={pathD}
              fill="none"
              stroke={show.chart_color || '#C66A3D'}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {points.map((pt, i) => (
              <circle
                key={i}
                cx={pt.x}
                cy={pt.y}
                fill={show.chart_color || '#C66A3D'}
                r={i === 6 ? 4 : 2.5}
              />
            ))}
          </svg>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-stone-100">
        <button
          type="button"
          onClick={() => navigate(`/arena/${show.slug}/${rival.slug}`)}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-arena-terracotta hover:bg-arena-terracottaHover text-white text-xs font-semibold shadow-pill transition-all cursor-pointer"
        >
          <span>⚔️ Battle vs {rival.title}</span>
        </button>
        <button
          type="button"
          onClick={() => navigate(`/charts/${show.slug}`)}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white hover:bg-stone-50 border border-stone-200 text-stone-700 text-xs font-semibold transition-all cursor-pointer"
        >
          <span>📈 View Full Chart</span>
        </button>
      </div>
    </main>
  );
}
