import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMovers, getNextMoverWeekStart } from '../lib/movers';
import { SeriesItem, supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

function MoversList({ title, shows, emptyText }: { title: string; shows: SeriesItem[]; emptyText: string }) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-6">
      <h2 className="mb-3 font-serif text-xl text-arena-charcoal">{title}</h2>
      {shows.length ? (
        <ol className="divide-y divide-stone-100">
          {shows.map((show, index) => (
            <li key={show.slug} className="flex items-center justify-between gap-3 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="w-6 text-xs text-stone-400">{index + 1}</span>
                <div className="min-w-0">
                  <Link className="block truncate text-sm font-semibold hover:text-arena-terracotta" to={`/show/${show.slug}`}>{show.title}</Link>
                  <span className="text-[11px] text-stone-500">{show.network} · {show.current_7d_score?.toLocaleString() ?? '—'} this week</span>
                </div>
              </div>
              <span className={`shrink-0 text-sm font-semibold ${Number(show.delta_pct) > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                {Number(show.delta_pct) > 0 ? '+' : ''}{Number(show.delta_pct).toFixed(1)}%
              </span>
            </li>
          ))}
        </ol>
      ) : <p className="text-xs text-stone-500">{emptyText}</p>}
    </section>
  );
}

function PredictionSection({ seriesList }: { seriesList: SeriesItem[] }) {
  const { user } = useAuth();
  const nextWeekStart = getNextMoverWeekStart();
  const [existingPrediction, setExistingPrediction] = useState<{ series_id: string } | null>(null);
  const [selectedSeriesId, setSelectedSeriesId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!user || !supabase) {
      setExistingPrediction(null);
      return;
    }
    const currentUserId = user.id;
    const client = supabase;
    async function loadPrediction() {
      try {
        const { data, error } = await client
          .from('mover_predictions')
          .select('series_id')
          .eq('user_id', currentUserId)
          .eq('week_start', nextWeekStart)
          .maybeSingle();
        if (active) {
          setExistingPrediction(!error && data ? data : null);
        }
      } catch {
        if (active) setExistingPrediction(null);
      }
    }
    loadPrediction();
    return () => {
      active = false;
    };
  }, [user?.id, nextWeekStart]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !supabase || !selectedSeriesId) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const { error } = await supabase.rpc('submit_mover_prediction', {
        p_week_start: nextWeekStart,
        p_series_id: selectedSeriesId,
      });
      if (error) {
        setErrorMessage(error.message);
      } else {
        setExistingPrediction({ series_id: selectedSeriesId });
        setSuccessMessage('Your prediction is locked in for next week!');
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to submit prediction');
    } finally {
      setIsSubmitting(false);
    }
  };

  const predictedShow = existingPrediction
    ? seriesList.find((s) => s.id === existingPrediction.series_id)
    : null;

  return (
    <section className="mt-4 rounded-2xl border border-stone-200 bg-white p-4 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-stone-100 pb-3">
        <h2 className="font-serif text-xl text-arena-charcoal">Predict Next Week&apos;s #1 Mover</h2>
        <span className="text-xs font-medium text-stone-500">Week of {nextWeekStart}</span>
      </div>
      {successMessage && (
        <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-xs font-semibold text-emerald-700">
          {successMessage}
        </p>
      )}
      {!user ? (
        <p className="mt-3 text-xs text-stone-500">
          Sign in to submit your prediction for next week&apos;s fastest-rising show and earn leaderboard points.
        </p>
      ) : existingPrediction ? (
        <div className="mt-3">
          <p className="text-xs text-stone-600">
            You locked in your pick:
          </p>
          <p className="mt-1 font-serif text-lg text-arena-charcoal">
            {predictedShow ? predictedShow.title : 'Prediction submitted'}
          </p>
          <p className="mt-1 text-[11px] text-stone-400">
            Graded on Monday following the 06:00 UTC telemetry sync. (1st place = 3 pts, Top 3 = 1 pt)
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-3 flex flex-wrap items-center gap-3">
          <label htmlFor="mover-prediction-select" className="sr-only">Select contender</label>
          <select
            id="mover-prediction-select"
            value={selectedSeriesId}
            onChange={(e) => setSelectedSeriesId(e.target.value)}
            className="flex-1 min-w-[200px] rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-arena-charcoal focus:border-arena-terracotta focus:outline-none"
          >
            <option value="">Choose a show...</option>
            {seriesList
              .filter((s) => (s.current_7d_score ?? 0) > 0 || (s.previous_7d_score ?? 0) > 0)
              .sort((a, b) => a.title.localeCompare(b.title))
              .map((s) => (
                <option key={s.id} value={s.id}>{s.title} ({s.network})</option>
              ))}
          </select>
          <button
            type="submit"
            disabled={!selectedSeriesId || isSubmitting}
            className="rounded-xl bg-arena-terracotta px-4 py-2 text-xs font-semibold text-white transition hover:bg-arena-terracotta/90 disabled:opacity-50"
          >
            {isSubmitting ? 'Locking in...' : 'Lock In Pick'}
          </button>
          {errorMessage && <p className="w-full text-xs text-rose-600">{errorMessage}</p>}
        </form>
      )}
    </section>
  );
}

export function MoversView({ seriesList }: { seriesList: SeriesItem[] }) {
  const { risers, fallers, breakouts } = getMovers(seriesList);

  return (
    <main className="w-full max-w-4xl rounded-3xl border border-stone-200 bg-white/90 p-5 shadow-card sm:p-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-stone-100 pb-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-500">Current 7 days vs prior 7 days</p>
          <h1 className="font-serif text-3xl text-arena-charcoal">Top Movers</h1>
        </div>
        <a className="text-xs font-semibold text-arena-terracotta underline" href="/movers.xml">Subscribe to RSS</a>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <MoversList title="Risers" shows={risers} emptyText="No rising shows have a previous-week comparison yet." />
        <MoversList title="Fallers" shows={fallers} emptyText="No falling shows have a previous-week comparison yet." />
      </div>
      <PredictionSection seriesList={seriesList} />
      <section className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 sm:p-6">
        <h2 className="mb-3 font-serif text-xl text-arena-charcoal">Recent Breakouts</h2>
        {breakouts.length ? (
          <ul className="space-y-2">
            {breakouts.map((show) => <li key={show.slug} className="text-sm"><Link className="font-semibold hover:text-arena-terracotta" to={`/show/${show.slug}`}>{show.title}</Link><span className="ml-2 text-xs text-stone-600">{show.breakout_reason || 'Recent engagement breakout'}</span></li>)}
          </ul>
        ) : <p className="text-xs text-stone-600">No recent breakout detections.</p>}
      </section>
    </main>
  );
}
