import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { SeriesItem } from '../lib/supabase';
import { calculateEventX, sampleDailyValues, buildMobileChartGeometry } from '../lib/svgMath';
import { sampleDailyRanks, buildMobileRankChartGeometry } from '../lib/historicalRank';
import { findSimilarShows } from '../lib/showDetail';
import { getSignalFreshness, SignalStatus } from '../lib/signalFreshness';
import { ShowComments } from './ShowComments';
import { PremiereImpactCard } from './PremiereImpactCard';

interface ShowDetailViewProps {
  seriesList: SeriesItem[];
  referenceDate?: string | Date;
  watchlistIds?: string[];
  pendingWatchlistIds?: string[];
  onToggleWatchlist?: (seriesId: string) => void;
  watchlistError?: string | null;
  onOpenAuth?: () => void;
}

export function ShowDetailView({
  seriesList,
  referenceDate,
  watchlistIds = [],
  pendingWatchlistIds = [],
  onToggleWatchlist,
  watchlistError,
  onOpenAuth,
}: ShowDetailViewProps) {
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

  const [chartMetric, setChartMetric] = useState<'score' | 'rank'>('score');
  const similarShows = findSimilarShows(show, seriesList);
  const rival = similarShows[0] || seriesList.find((s) => s.slug !== show.slug) || show;
  const history = (show.daily_series || []).slice(-90);
  const historyDates = (show.daily_dates || []).slice(-90);
  const historyRanks = (show.daily_ranks || []).slice(-90);

  const sampledScores = sampleDailyValues(history, '90D');
  const maxSampled = Math.max(...sampledScores, 1);
  const scoreGeometry = buildMobileChartGeometry(sampledScores, maxSampled);

  const sampledRanks = sampleDailyRanks(historyRanks, '90D');
  const maxRankObserved = Math.max(...sampledRanks.filter((r) => r > 0), 1);
  const maxRankScale = Math.max(5, Math.ceil(maxRankObserved / 5) * 5);
  const rankGeometry = buildMobileRankChartGeometry(sampledRanks, maxRankScale);

  const { pathD, points } = chartMetric === 'rank' ? rankGeometry : scoreGeometry;
  const validHistoryRanks = historyRanks.filter((r) => r > 0);
  const peakRank = validHistoryRanks.length > 0 ? Math.min(...validHistoryRanks) : null;
  const chartStartDate = historyDates[0];
  const chartEndDate = historyDates[historyDates.length - 1];
  const eventMarkers = (show.events || []).flatMap((event) => {
    if (!chartStartDate || !chartEndDate) return [];
    const x = calculateEventX(event.event_date, chartStartDate, chartEndDate, true);
    return x === null ? [] : [{ ...event, x }];
  });
  const contributions = show.signal_contributions;
  const freshness = getSignalFreshness(show, referenceDate);
  const hasHistory = history.length > 0;
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
          <div className="flex items-center gap-3">
            <h1 className="font-serif text-3xl sm:text-4xl font-medium text-arena-charcoal">
              {show.title}
            </h1>
            {onToggleWatchlist && (
              <button
                type="button"
                aria-label={`${watchlistIds.includes(show.id) ? 'Remove' : 'Add'} ${show.title} ${watchlistIds.includes(show.id) ? 'from' : 'to'} watchlist`}
                aria-pressed={watchlistIds.includes(show.id)}
                disabled={pendingWatchlistIds.includes(show.id)}
                onClick={() => onToggleWatchlist(show.id)}
                className="rounded-full p-2 text-[#665D53] hover:text-brand-terracotta hover:bg-stone-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-terracotta disabled:opacity-50"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill={watchlistIds.includes(show.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m12 3 2.7 5.47 6.03.88-4.36 4.25 1.03 6.01L12 16.77l-5.4 2.84 1.03-6.01L3.27 9.35l6.03-.88L12 3Z" />
                </svg>
              </button>
            )}
          </div>
          <p className="text-xs text-arena-faint mt-1">{show.release_years}</p>
          {watchlistError && (
            <p role="alert" className="text-xs text-rose-600 font-medium mt-1">
              {watchlistError}
            </p>
          )}
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
              <span className="text-emerald-600">+{(show.delta_pct as number).toFixed(1)}%</span>
            ) : (
              <span className="text-rose-600">{(show.delta_pct as number).toFixed(1)}%</span>
            )}
          </div>
        </div>
      </div>

      {/* Signal contributions */}
      <section className="mb-6 p-4 rounded-2xl bg-[#FAF6F2] border border-[#EEE4DB]" aria-label="Seven day signal contributions">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-xs font-semibold text-stone-700">7-Day Score Contributions</h2>
            <span className="text-[11px] text-stone-500">Weighted score points and observation coverage</span>
          </div>
          <span className="text-[10.5px] font-medium text-stone-500 bg-white/80 px-2 py-0.5 rounded-md border border-stone-200/60">
            Window: 7 Days
          </span>
        </div>
        {!contributions ? (
          <p className="text-xs text-stone-500">Signal contribution data is temporarily unavailable.</p>
        ) : contributions.telemetry_days === 0 ? (
          <div>
            <p className="text-xs text-stone-500 mb-3">No telemetry history is available for this period.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <SignalCard signal={freshness.wiki} />
              <SignalCard signal={freshness.reddit} />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <SignalCard signal={freshness.wiki} />
            <SignalCard signal={freshness.reddit} />
          </div>
        )}
      </section>

      {/* 90-Day Trajectory and events */}
      <div className="p-4 rounded-2xl bg-stone-50/70 border border-stone-200/60 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-stone-700">90-Day Trajectory</span>
            <div className="inline-flex items-center bg-[#F3EFE9] p-0.5 rounded-full text-[10px] font-medium border border-[#E7DFD5]">
              <button
                type="button"
                onClick={() => setChartMetric('score')}
                className={`px-2 py-0.5 rounded-full transition-colors ${
                  chartMetric === 'score'
                    ? 'bg-white text-stone-800 shadow-sm font-semibold'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                Score
              </button>
              <button
                type="button"
                onClick={() => setChartMetric('rank')}
                className={`px-2 py-0.5 rounded-full transition-colors ${
                  chartMetric === 'rank'
                    ? 'bg-white text-stone-800 shadow-sm font-semibold'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                Rank
              </button>
            </div>
          </div>
          <span className="text-[11px] text-stone-500">
            {chartMetric === 'rank' ? (
              peakRank ? `Peak: #${peakRank} · Top = #1` : 'Top = #1'
            ) : (
              'Relative Scale'
            )}
          </span>
        </div>
        {hasHistory ? (
          <div className="w-full h-24 sm:h-32">
            <svg role="img" aria-label={`${show.title} 90-day ${chartMetric === 'rank' ? 'leaderboard rank' : 'engagement'} trajectory with ${eventMarkers.length} event markers`} className="w-full h-full" viewBox="0 0 340 185" preserveAspectRatio="none">
              {eventMarkers.map((event) => <line key={event.id ?? `${event.kind}-${event.event_date}`} x1={event.x} x2={event.x} y1="8" y2="162" stroke="#8a5a44" strokeDasharray="3 3" />)}
              <path d={pathD} fill="none" stroke={show.chart_color || '#C66A3D'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              {points.map((pt, i) => <circle key={i} cx={pt.x} cy={pt.y} fill={show.chart_color || '#C66A3D'} r={i === points.length - 1 ? 4 : 2.5} />)}
            </svg>
          </div>
        ) : <p className="py-8 text-center text-xs text-stone-500">No viewing history is available yet.</p>}
        {chartMetric === 'rank' && (
          <p className="mt-2 text-[10px] text-stone-500 italic">
            * Historical rank is a relative measure showing daily standing among all tracked series.
          </p>
        )}
        {eventMarkers.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs text-stone-600">
            {eventMarkers.map((event) => <li key={event.id ?? `${event.kind}-${event.event_date}`}>{event.event_date}: {event.label}</li>)}
          </ul>
        )}
      </div>

      {show.is_breakout && <p className="mb-6 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-900">Breakout detected: {show.breakout_reason || 'This show is gaining engagement.'}</p>}

      <section className="mb-6" aria-label="Similar shows">
        <h2 className="mb-2 text-xs font-semibold text-stone-700">Similar Shows</h2>
        {similarShows.length ? (
          <ul className="grid gap-2 sm:grid-cols-3">
            {similarShows.map((similar) => <li key={similar.slug}><button type="button" onClick={() => navigate(`/show/${similar.slug}`)} className="w-full rounded-xl border border-stone-200 px-3 py-2 text-left hover:border-arena-terracotta"><span className="block text-sm font-medium">{similar.title}</span><span className="text-[10px] text-stone-500">{similar.network} · {similar.genre_group}</span></button></li>)}
          </ul>
        ) : <p className="text-xs text-stone-500">No shows share this platform or genre yet.</p>}
      </section>

      <PremiereImpactCard seriesId={show.id} />

      <ShowComments seriesId={show.id} onOpenAuth={onOpenAuth} />

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

function SignalCard({ signal }: { signal: SignalStatus }) {
  const badgeColors =
    signal.status === 'fresh'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : signal.status === 'stale'
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : 'bg-stone-100 text-stone-500 border-stone-200';

  return (
    <div className="p-3.5 bg-white/80 rounded-xl border border-stone-200/80 flex flex-col justify-between text-left">
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-stone-800">{signal.label}</span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${badgeColors}`}>
            {signal.statusLabel}
          </span>
        </div>
        <div className="flex items-baseline gap-2 mb-2">
          <strong className="text-xl font-serif font-semibold text-arena-charcoal">
            {signal.scoreDisplay}
          </strong>
          {signal.isMeasuredZero && (
            <span className="text-[10.5px] text-stone-500 font-medium">(measured zero)</span>
          )}
        </div>
      </div>
      <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-500">
        <span>Coverage: <strong>{signal.coverageLabel}</strong></span>
        <span>Latest: <strong>{signal.latestDate ? signal.latestDate : 'None'}</strong></span>
      </div>
    </div>
  );
}
