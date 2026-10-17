import React from 'react';

export type DatabaseStatusType = 'unconfigured' | 'loading' | 'error' | 'empty';

interface DatabaseStatusCardProps {
  type: DatabaseStatusType;
  errorMessage?: string | null;
}

export function DatabaseStatusCard({ type, errorMessage }: DatabaseStatusCardProps) {
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
            Dummy mock data has been removed. Configure your Supabase credentials to view real streaming telemetry and intelligence.
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
            <p className="text-xs text-stone-500 pl-7">
              Execute <code className="text-stone-800 font-semibold">supabase/schema.sql</code> in the Supabase SQL Editor to initialize tables and seed data.
            </p>

            <div className="font-semibold text-stone-900 flex items-center gap-2 pt-2 border-t border-stone-100">
              <span className="w-5 h-5 rounded-full bg-[#EFE9DF] text-stone-800 text-xs flex items-center justify-center font-bold">3</span>
              <span>Set Environment Variables</span>
            </div>
            <p className="text-xs text-stone-500 pl-7">
              Add your credentials to <code className="text-stone-800 font-semibold">.env</code> in your project root:
            </p>
            <pre className="text-[11px] font-mono bg-[#2B2623] text-stone-200 p-3 rounded-xl ml-7 overflow-x-auto">
{`VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key`}
            </pre>
          </div>

          <p className="text-xs text-stone-400">
            Once configured, restart the Vite dev server to stream live series telemetry.
          </p>
        </main>
      )}

      {type === 'loading' && (
        <main className="w-full max-w-md bg-[#FCFAF6] border border-[#E9E1D3] rounded-[28px] p-10 shadow-soft-card flex flex-col items-center text-center">
          <div className="w-8 h-8 border-2 border-brand-terracotta border-t-transparent rounded-full animate-spin mb-4" />
          <h2 className="text-lg font-serif font-medium text-stone-800">Connecting to Supabase...</h2>
          <p className="text-xs text-stone-400 mt-1">Fetching live television series and telemetry</p>
        </main>
      )}

      {type === 'error' && (
        <main className="w-full max-w-md bg-rose-50 border border-rose-200 rounded-[28px] p-8 text-center">
          <span className="text-xs uppercase tracking-wider font-bold text-rose-800 bg-rose-100 px-3 py-1 rounded-full">
            Database Query Error
          </span>
          <p className="text-xs text-rose-700 mt-3 font-mono">{errorMessage || 'Unknown database error'}</p>
        </main>
      )}

      {type === 'empty' && (
        <main className="w-full max-w-md bg-[#FCFAF6] border border-[#E9E1D3] rounded-[28px] p-8 shadow-soft-card text-center">
          <span className="text-xs uppercase tracking-wider font-semibold text-stone-500 bg-stone-100 px-3 py-1 rounded-full">
            0 Series Found
          </span>
          <h2 className="text-xl font-serif font-medium text-stone-900 mt-3 mb-2">Database Table Empty</h2>
          <p className="text-xs text-stone-500 leading-relaxed">
            Your Supabase connection is active, but the <code className="font-semibold">series</code> table contains no records. Execute <code className="font-semibold">supabase/schema.sql</code> or run the Rust ingestion pipeline (<code className="font-semibold">cargo run -- seed</code> or <code className="font-semibold">cargo run -- sync</code>) to populate show data.
          </p>
        </main>
      )}
    </div>
  );
}
