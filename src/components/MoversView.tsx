import { Link } from 'react-router-dom';
import { getMovers } from '../lib/movers';
import { SeriesItem } from '../lib/supabase';

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
