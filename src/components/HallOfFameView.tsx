import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { isSupabaseConfigured } from '../lib/supabase';
import {
  HALL_OF_FAME_CATEGORIES,
  HallOfFameRow,
  fetchHallOfFame,
  formatPlace,
  formatRecordPeriod,
  groupHallOfFame,
} from '../lib/hallOfFame';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; rows: HallOfFameRow[] };

export function HallOfFameView() {
  const [state, setState] = useState<LoadState>(
    isSupabaseConfigured ? { status: 'loading' } : { status: 'error', message: 'Records need a live database connection.' },
  );

  useEffect(() => {
    document.title = 'Hall of Fame | TV Arena';
    if (!isSupabaseConfigured) return;
    let active = true;
    fetchHallOfFame()
      .then((rows) => active && setState({ status: 'ready', rows }))
      .catch((err: unknown) =>
        active && setState({ status: 'error', message: err instanceof Error ? err.message : 'Could not load records.' }),
      );
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-3xl text-arena-charcoal">Hall of Fame</h1>
        <p className="mt-1 text-sm text-stone-600">All-time records across every tracked show, with the dates they happened.</p>
      </header>

      {state.status === 'loading' && <p role="status" className="text-sm text-stone-500">Loading records…</p>}
      {state.status === 'error' && <p role="alert" className="text-sm text-stone-600">{state.message}</p>}
      {state.status === 'ready' && <Records rows={state.rows} />}
    </div>
  );
}

function Records({ rows }: { rows: HallOfFameRow[] }) {
  const grouped = groupHallOfFame(rows);
  if (grouped.size === 0) {
    return <p className="text-sm text-stone-600">Not enough history yet. Records appear as daily data accumulates.</p>;
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {HALL_OF_FAME_CATEGORIES.map((cat) => {
        const list = grouped.get(cat.key) ?? [];
        return (
          <section key={cat.key} aria-labelledby={`hof-${cat.key}`} className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-6">
            <h2 id={`hof-${cat.key}`} className="font-serif text-xl text-arena-charcoal">{cat.title}</h2>
            <p className="mb-3 text-xs text-stone-500">{cat.description}</p>
            {list.length ? (
              <ol className="divide-y divide-stone-100">
                {list.map((row) => (
                  <li key={`${row.category}-${row.series_id}`} className="flex items-center justify-between gap-3 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="w-8 text-xs text-stone-500">{formatPlace(row, list)}</span>
                      <div className="min-w-0">
                        <Link className="block truncate text-sm font-semibold hover:text-arena-terracotta" to={`/show/${row.slug}`}>
                          {row.title}
                        </Link>
                        <span className="text-[11px] text-stone-500">{formatRecordPeriod(row.start_date, row.end_date)}</span>
                      </div>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-arena-charcoal">{cat.unit(Number(row.value))}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-xs text-stone-500">No records in this category yet.</p>
            )}
          </section>
        );
      })}
    </div>
  );
}
