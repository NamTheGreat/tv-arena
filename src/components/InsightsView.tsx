import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { isSupabaseConfigured } from '../lib/supabase';
import {
  GenreShareRow,
  PlatformShareRow,
  SIGNAL_OPTIONS,
  SignalKey,
  SignalPoint,
  buildScatter,
  describeStrength,
  fetchGenreShares,
  fetchPlatformShares,
  fetchSignalPoints,
  pivotShares,
} from '../lib/insights';
import { LineChart, ScatterChart } from './InsightCharts';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; platforms: PlatformShareRow[]; genres: GenreShareRow[]; points: SignalPoint[] };

export function InsightsView() {
  const [state, setState] = useState<LoadState>(
    isSupabaseConfigured ? { status: 'loading' } : { status: 'error', message: 'Insights need a live database connection.' },
  );

  useEffect(() => {
    document.title = 'Market Insights | TV Arena';
    if (!isSupabaseConfigured) return;
    let active = true;
    Promise.all([fetchPlatformShares(), fetchGenreShares(), fetchSignalPoints()])
      .then(([platforms, genres, points]) => active && setState({ status: 'ready', platforms, genres, points }))
      .catch((err: unknown) =>
        active && setState({ status: 'error', message: err instanceof Error ? err.message : 'Could not load insights.' }),
      );
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-3xl text-arena-charcoal">Market Insights</h1>
        <p className="mt-1 text-sm text-stone-600">Platform share, genre momentum and how engagement signals relate across shows.</p>
      </header>
      {state.status === 'loading' && <p role="status" className="text-sm text-stone-500">Loading insights…</p>}
      {state.status === 'error' && <p role="alert" className="text-sm text-stone-600">{state.message}</p>}
      {state.status === 'ready' && <Insights platforms={state.platforms} genres={state.genres} points={state.points} />}
    </div>
  );
}

function Card({ id, title, note, children }: { id: string; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-6">
      <h2 id={id} className="font-serif text-xl text-arena-charcoal">{title}</h2>
      {note && <p className="mb-3 text-xs text-stone-500">{note}</p>}
      {children}
    </section>
  );
}

function Insights({ platforms, genres, points }: { platforms: PlatformShareRow[]; genres: GenreShareRow[]; points: SignalPoint[] }) {
  const platformChart = useMemo(() => pivotShares(platforms, (r) => r.network_group, (r) => r.share_pct), [platforms]);
  const genreChart = useMemo(() => pivotShares(genres, (r) => r.genre_group, (r) => r.share_pct), [genres]);

  const latestWeek = platforms.length ? platforms.reduce((max, r) => (r.week_start > max ? r.week_start : max), platforms[0].week_start) : null;
  const latestPlatforms = platforms
    .filter((r) => r.week_start === latestWeek)
    .sort((a, b) => b.shows - a.shows || b.score_share_pct - a.score_share_pct || a.network_group.localeCompare(b.network_group));
  const latestGenres = genres
    .filter((r) => r.week_start === (genres.length ? genres.reduce((m, r2) => (r2.week_start > m ? r2.week_start : m), genres[0].week_start) : ''))
    .sort((a, b) => b.share_pct - a.share_pct || a.genre_group.localeCompare(b.genre_group));

  if (!platforms.length && !genres.length && !points.length) {
    return <p className="text-sm text-stone-600">Not enough history yet. Insights appear once shows have at least four days of data in a week.</p>;
  }

  return (
    <div className="space-y-4">
      <Card id="ins-platform" title="Platform share of the top 100" note={latestWeek ? `Week of ${latestWeek}. Each show counts once, ranked by its average daily score.` : undefined}>
        {latestPlatforms.length ? (
          <>
            <ul className="mb-4 space-y-2">
              {latestPlatforms.slice(0, 8).map((p) => (
                <li key={p.network_group}>
                  <div className="flex justify-between text-xs text-stone-700">
                    <span className="font-semibold">{p.network_group}</span>
                    <span>{p.share_pct}% of shows ({p.shows}/{p.ranked_shows}) · {p.score_share_pct}% of buzz</span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-stone-100" aria-hidden="true">
                    <div className="h-full rounded-full bg-arena-terracotta" style={{ width: `${Math.min(100, p.share_pct)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
            <LineChart title="Platform share of top 100 over time" labels={platformChart.labels} series={platformChart.series} />
          </>
        ) : <p className="text-xs text-stone-500">No weekly data yet.</p>}
      </Card>

      <Card id="ins-genre" title="Genre engagement trajectories" note="Share of total weekly engagement across all tracked shows with enough data.">
        {latestGenres.length ? (
          <>
            <ul className="mb-4 grid gap-2 sm:grid-cols-2">
              {latestGenres.slice(0, 6).map((g) => (
                <li key={g.genre_group} className="rounded-xl bg-stone-50 px-3 py-2 text-xs text-stone-700">
                  <span className="block font-semibold">{g.genre_group}</span>
                  {g.share_pct}% of engagement · {g.shows} shows · {g.avg_score_per_show.toLocaleString()} avg/day
                </li>
              ))}
            </ul>
            <LineChart title="Genre share of weekly engagement" labels={genreChart.labels} series={genreChart.series} />
          </>
        ) : <p className="text-xs text-stone-500">No weekly data yet.</p>}
      </Card>

      <CorrelationExplorer points={points} />
    </div>
  );
}

function CorrelationExplorer({ points }: { points: SignalPoint[] }) {
  const [xKey, setXKey] = useState<SignalKey>('avg_wiki_views');
  const [yKey, setYKey] = useState<SignalKey>('avg_reddit_comments');
  const [logScale, setLogScale] = useState(true);
  const scatter = useMemo(() => buildScatter(points, xKey, yKey, logScale), [points, xKey, yKey, logScale]);
  const xLabel = SIGNAL_OPTIONS.find((o) => o.key === xKey)?.label ?? '';
  const yLabel = SIGNAL_OPTIONS.find((o) => o.key === yKey)?.label ?? '';
  const reg = scatter.regression;

  return (
    <Card id="ins-correlation" title="Signal correlation explorer" note="Each dot is a show, using its average over the last 7 days. Shows missing either signal are left out.">
      <div className="mb-3 flex flex-wrap items-end gap-3 text-xs">
        <label className="flex flex-col gap-1">
          <span className="text-stone-600">X axis</span>
          <select value={xKey} onChange={(e) => setXKey(e.target.value as SignalKey)} className="rounded-xl border border-stone-200 px-2 py-1.5 text-sm">
            {SIGNAL_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-stone-600">Y axis</span>
          <select value={yKey} onChange={(e) => setYKey(e.target.value as SignalKey)} className="rounded-xl border border-stone-200 px-2 py-1.5 text-sm">
            {SIGNAL_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-1.5">
          <input type="checkbox" checked={logScale} onChange={(e) => setLogScale(e.target.checked)} />
          <span className="text-stone-700">Log scale</span>
        </label>
      </div>

      {xKey === yKey && <p role="status" className="mb-2 text-xs text-stone-600">Pick two different signals to compare.</p>}

      {scatter.points.length ? (
        <>
          <ScatterChart title={`${xLabel} versus ${yLabel}`} xLabel={xLabel} yLabel={yLabel} points={scatter.points} regression={reg} logScale={logScale} />
          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4" aria-label="Regression metrics">
            <div><dt className="text-stone-500">Shows</dt><dd className="text-base font-semibold" data-testid="metric-n">{scatter.points.length}</dd></div>
            <div><dt className="text-stone-500">R²</dt><dd className="text-base font-semibold" data-testid="metric-r2">{reg ? reg.r2.toFixed(3) : 'n/a'}</dd></div>
            <div><dt className="text-stone-500">Correlation (r)</dt><dd className="text-base font-semibold" data-testid="metric-r">{reg ? reg.r.toFixed(3) : 'n/a'}</dd></div>
            <div><dt className="text-stone-500">Slope</dt><dd className="text-base font-semibold" data-testid="metric-slope">{reg ? reg.slope.toPrecision(3) : 'n/a'}</dd></div>
          </dl>
          <p className="mt-2 text-xs text-stone-600">
            {reg
              ? `A ${describeStrength(reg.r2)} relationship: ${xLabel} explains about ${Math.round(reg.r2 * 100)}% of the variation in ${yLabel}. Correlation does not mean one signal drives the other.`
              : 'Not enough varied data to fit a trendline yet (needs at least 3 shows with differing values).'}
          </p>
          <details className="mt-2 text-xs text-stone-600">
            <summary className="cursor-pointer">Shows in this view</summary>
            <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
              {scatter.points.slice(0, 40).map((p) => (
                <li key={p.slug}><Link className="underline" to={`/show/${p.slug}`}>{p.title}</Link></li>
              ))}
            </ul>
          </details>
        </>
      ) : <p className="text-xs text-stone-500">No shows have both signals yet.</p>}
    </Card>
  );
}
