import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export type DatabaseStatusType = 'unconfigured' | 'loading' | 'error' | 'empty' | 'healthy';

export interface SyncRunRecord {
  id: number;
  started_at: string;
  completed_at: string | null;
  status: 'running' | 'success' | 'partial' | 'failed';
  shows_total: number;
  shows_updated: number;
  shows_failed: number;
  wiki_failures: number;
  reddit_failures: number;
  error_log: string | null;
  duration_ms: number | null;
}

export function formatRelativeTime(dateStr?: string | null): string {
  if (!dateStr) return 'never';
  const now = new Date();
  const then = new Date(dateStr);
  const diffSec = Math.floor((now.getTime() - then.getTime()) / 1000);

  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}

export function getNext0200UtcCountdown(): string {
  const now = new Date();
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 2, 0, 0, 0)
  );
  if (now.getTime() >= next.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  const diffMs = next.getTime() - now.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  return `${diffHours}h ${diffMinutes}m`;
}

interface DatabaseStatusCardProps {
  type: DatabaseStatusType;
  errorMessage?: string | null;
  onClose?: () => void;
}

export function DatabaseStatusCard({ type, errorMessage, onClose }: DatabaseStatusCardProps) {
  const [latestRun, setLatestRun] = useState<SyncRunRecord | null>(null);
  const [isLoadingRun, setIsLoadingRun] = useState(false);
  const [countdown, setCountdown] = useState<string>(getNext0200UtcCountdown());

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(getNext0200UtcCountdown());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    async function fetchLatestSyncRun() {
      if (!supabase) return;
      setIsLoadingRun(true);
      try {
        const { data } = await supabase
          .from('sync_runs')
          .select('*')
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (active && data) {
          setLatestRun(data as unknown as SyncRunRecord);
        }
      } catch {
        // Fall back gracefully
      } finally {
        if (active) setIsLoadingRun(false);
      }
    }
    fetchLatestSyncRun();
    return () => {
      active = false;
    };
  }, []);

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'success':
        return {
          bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          dot: 'bg-emerald-500',
          label: 'Healthy / Success',
        };
      case 'partial':
      case 'running':
        return {
          bg: 'bg-amber-50 text-amber-700 border-amber-200',
          dot: 'bg-amber-500',
          label: status === 'running' ? 'Sync Running...' : 'Partial Sync',
        };
      case 'failed':
      default:
        return {
          bg: 'bg-rose-50 text-rose-700 border-rose-200',
          dot: 'bg-rose-500',
          label: 'Sync Failed',
        };
    }
  };

  const badge = getStatusBadge(latestRun?.status);

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col items-center pt-6 sm:pt-10 pb-16 px-4 font-sans text-arena-charcoal">
      <header className="w-full text-center mb-5 sm:mb-8">
        <h1 className="text-3xl sm:text-5xl font-serif tracking-tight font-medium text-arena-charcoal">
          TV <span className="italic text-arena-terracotta font-semibold">Arena</span>
        </h1>
        <p className="text-[10px] sm:text-xs uppercase tracking-[0.22em] sm:tracking-[0.24em] text-arena-muted font-semibold mt-1 sm:mt-1.5">
          Global TV Engagement Intelligence
        </p>
      </header>

      {/* OPERATIONAL HEALTH CARD */}
      <main className="w-full max-w-xl bg-white border border-[#E9E1D3] rounded-[28px] p-6 sm:p-8 shadow-soft-card flex flex-col text-left mb-6 relative">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="absolute top-6 right-6 w-8 h-8 rounded-full flex items-center justify-center text-stone-400 hover:text-stone-800 hover:bg-stone-100 transition-colors cursor-pointer"
          >
            ✕
          </button>
        )}

        <div className="flex items-center justify-between pb-4 mb-5 border-b border-stone-100 pr-8">
          <div>
            <span className="text-[10px] sm:text-[11px] uppercase tracking-wider font-bold text-stone-400 block mb-0.5">
              Operations
            </span>
            <h2 className="font-serif text-xl sm:text-2xl font-semibold text-stone-900">
              Pipeline Operational Health
            </h2>
          </div>
          <div
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${badge.bg}`}
          >
            <span className={`w-2 h-2 rounded-full ${badge.dot} animate-pulse`} />
            <span>{badge.label}</span>
          </div>
        </div>

        {/* 2x2 Operator Metrics Grid */}
        <div className="grid grid-cols-2 gap-3 mb-5 font-tabular">
          <div className="bg-[#FAF7F2] p-4 rounded-2xl border border-stone-200/60">
            <span className="text-[10.5px] uppercase tracking-wider text-stone-400 font-semibold block mb-1">
              Last Sync Run
            </span>
            <div className="font-serif text-xl text-stone-900 font-medium">
              {formatRelativeTime(latestRun?.completed_at || latestRun?.started_at)}
            </div>
            <p className="text-[11px] text-stone-500 mt-0.5">
              {latestRun?.started_at ? new Date(latestRun.started_at).toUTCString() : 'No run recorded'}
            </p>
          </div>

          <div className="bg-[#FAF7F2] p-4 rounded-2xl border border-stone-200/60">
            <span className="text-[10.5px] uppercase tracking-wider text-stone-400 font-semibold block mb-1">
              Shows Updated
            </span>
            <div className="font-serif text-xl text-stone-900 font-medium">
              {latestRun
                ? `${latestRun.shows_updated} / ${latestRun.shows_total || latestRun.shows_updated + latestRun.shows_failed}`
                : '0 / 0'}
            </div>
            <p className="text-[11px] text-stone-500 mt-0.5">
              {latestRun?.shows_failed ? `${latestRun.shows_failed} failures` : 'All telemetry patched'}
            </p>
          </div>

          <div className="bg-[#FAF7F2] p-4 rounded-2xl border border-stone-200/60">
            <span className="text-[10.5px] uppercase tracking-wider text-stone-400 font-semibold block mb-1">
              Next Scheduled Run
            </span>
            <div className="font-serif text-xl text-arena-terracotta font-medium">
              in {countdown}
            </div>
            <p className="text-[11px] text-stone-500 mt-0.5">Nightly at 02:00 UTC</p>
          </div>

          <div className="bg-[#FAF7F2] p-4 rounded-2xl border border-stone-200/60">
            <span className="text-[10.5px] uppercase tracking-wider text-stone-400 font-semibold block mb-1">
              Execution Duration
            </span>
            <div className="font-serif text-xl text-stone-900 font-medium">
              {latestRun?.duration_ms
                ? `${(latestRun.duration_ms / 1000).toFixed(1)}s`
                : latestRun?.status === 'running'
                ? 'in progress...'
                : '—'}
            </div>
            <p className="text-[11px] text-stone-500 mt-0.5">
              Wiki fails: {latestRun?.wiki_failures ?? 0} · Reddit fails:{' '}
              {latestRun?.reddit_failures ?? 0}
            </p>
          </div>
        </div>

        {/* Error log if present */}
        {latestRun?.error_log && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-700 font-mono mb-4 overflow-x-auto">
            <span className="font-bold block mb-1">Operator Warning Log:</span>
            {latestRun.error_log}
          </div>
        )}

        <div className="text-[11px] text-stone-400 flex items-center justify-between pt-3 border-t border-stone-100">
          <span>Target database: Supabase PostgreSQL</span>
          <span>Pipeline: tv-arena-pipeline (Rust)</span>
        </div>
      </main>

      {/* SETUP GUIDE IF DATABASE EMPTY OR UNCONFIGURED */}
      {type === 'unconfigured' && (
        <main className="w-full max-w-2xl bg-[#FCFAF6] border border-[#E9E1D3] rounded-[28px] p-6 sm:p-10 shadow-soft-card flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-700 text-xl font-semibold mb-4">
            ⚡
          </div>
          <span className="text-[11px] uppercase tracking-wider font-semibold text-amber-800 bg-amber-50 px-3 py-1 rounded-full border border-amber-200 mb-3">
            Database Not Connected
          </span>
          <h2 className="text-2xl sm:text-3xl font-serif font-medium text-stone-900 mb-3">
            Connect Supabase to Stream Telemetry
          </h2>
          <p className="text-xs sm:text-sm text-stone-600 max-w-md leading-relaxed mb-6">
            Configure your Supabase credentials to view real streaming telemetry and intelligence.
          </p>

          <div className="w-full text-left bg-white border border-[#EBE4D8] rounded-2xl p-4 sm:p-5 mb-6 space-y-3 text-xs sm:text-sm text-stone-700">
            <div className="font-semibold text-stone-900 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-[#EFE9DF] text-stone-800 text-xs flex items-center justify-center font-bold">1</span>
              <span>Create or Open a Supabase Project</span>
            </div>
            <p className="text-xs text-stone-500 pl-7">
              Head to <a href="https://supabase.com" target="_blank" rel="noreferrer" className="text-brand-terracotta underline">supabase.com</a> and create your database project.
            </p>

            <div className="font-semibold text-stone-900 flex items-center gap-2 pt-2 border-t border-stone-100">
              <span className="w-5 h-5 rounded-full bg-[#EFE9DF] text-stone-800 text-xs flex items-center justify-center font-bold">2</span>
              <span>Run Database Migration & Initial Seed</span>
            </div>
            <p className="text-xs text-stone-500 pl-7 font-mono bg-stone-50 p-2 rounded border border-stone-200">
              supabase/schema.sql
            </p>

            <div className="font-semibold text-stone-900 flex items-center gap-2 pt-2 border-t border-stone-100">
              <span className="w-5 h-5 rounded-full bg-[#EFE9DF] text-stone-800 text-xs flex items-center justify-center font-bold">3</span>
              <span>Set Environment Variables</span>
            </div>
            <pre className="text-[11px] font-mono bg-[#2B2623] text-stone-200 p-3 rounded-xl ml-7 overflow-x-auto">
{`VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key`}
            </pre>
          </div>
        </main>
      )}

      {type === 'empty' && (
        <main className="w-full max-w-md bg-[#FCFAF6] border border-[#E9E1D3] rounded-[28px] p-8 shadow-soft-card text-center">
          <span className="text-xs uppercase tracking-wider font-semibold text-stone-500 bg-stone-100 px-3 py-1 rounded-full">
            0 Series Found
          </span>
          <h2 className="text-xl font-serif font-medium text-stone-900 mt-3 mb-2">Database Table Empty</h2>
          <p className="text-xs text-stone-500 leading-relaxed">
            Execute <code className="font-semibold">supabase/schema.sql</code> or run the Rust ingestion pipeline (<code className="font-semibold">cargo run -- seed</code> or <code className="font-semibold">cargo run -- sync</code>) to populate show data.
          </p>
        </main>
      )}
    </div>
  );
}
