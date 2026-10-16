import React, { useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured, SeriesItem, supabase } from './lib/supabase';
import { buildChartGeometry, buildMobileChartGeometry } from './lib/svgMath';

type TabKey = 'leaderboard' | 'arena' | 'charts' | 'guess';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('arena');
  const [seriesList, setSeriesList] = useState<SeriesItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(isSupabaseConfigured);
  const [dbError, setDbError] = useState<string | null>(null);

  // Arena 1v1 State
  const [leftSlug, setLeftSlug] = useState('');
  const [rightSlug, setRightSlug] = useState('');
  const [leftSearch, setLeftSearch] = useState('');
  const [rightSearch, setRightSearch] = useState('');
  const [leftDropdownOpen, setLeftDropdownOpen] = useState(false);
  const [rightDropdownOpen, setRightDropdownOpen] = useState(false);

  // Leaderboard Filter State
  const [platformFilter, setPlatformFilter] = useState<string>('ALL');
  const [genreFilter, setGenreFilter] = useState<string>('ALL');

  // Charts State
  const [chartRange, setChartRange] = useState<'7D' | '30D' | '90D' | 'All-Time'>('7D');

  // Guess Trivia State
  const [guessMode, setGuessMode] = useState<'premieres' | 'finales'>('premieres');
  const [knownIdx, setKnownIdx] = useState<number>(0);
  const [challengerIdx, setChallengerIdx] = useState<number>(1);
  const [revealed, setRevealed] = useState<boolean>(false);
  const [lastGuessCorrect, setLastGuessCorrect] = useState<boolean | null>(null);
  const [streak, setStreak] = useState<number>(0);
  const [bestStreak, setBestStreak] = useState<number>(() => {
    return Number(localStorage.getItem('tv_arena_best_streak') || '0');
  });

  // Load live data from Supabase if configured
  useEffect(() => {
    async function loadFromSupabase() {
      if (!supabase) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setDbError(null);
      const { data, error } = await supabase
        .from('series')
        .select('*')
        .order('viewers_premiere_28d', { ascending: false });

      if (error) {
        setDbError(error.message);
        setIsLoading(false);
        return;
      }

      if (data && data.length > 0) {
        const { data: telemetryData } = await supabase
          .from('series_daily_telemetry')
          .select('series_id, daily_viewers, recorded_date')
          .order('recorded_date', { ascending: true });

        const telemetryMap = new Map<string, number[]>();
        if (telemetryData) {
          for (const row of telemetryData) {
            const arr = telemetryMap.get(row.series_id) || [];
            arr.push(Number(row.daily_viewers));
            telemetryMap.set(row.series_id, arr);
          }
        }

        const mapped: SeriesItem[] = data.map((row: any) => ({
          ...row,
          viewers_premiere_28d: Number(row.viewers_premiere_28d || 0),
          viewers_finale: Number(row.viewers_finale || 0),
          delta_pct: Number(row.delta_pct || 0),
          daily_series: telemetryMap.get(row.id) || [],
        }));

        setSeriesList(mapped);
        setLeftSlug(mapped[0].slug);
        setLeftSearch(mapped[0].title);
        if (mapped.length > 1) {
          setRightSlug(mapped[1].slug);
          setRightSearch(mapped[1].title);
          setChallengerIdx(1);
        }
      }
      setIsLoading(false);
    }
    loadFromSupabase();
  }, []);

  // Arena Contenders
  const leftShow = useMemo(() => {
    if (seriesList.length === 0) return null;
    return seriesList.find((s) => s.slug === leftSlug) || seriesList[0];
  }, [seriesList, leftSlug]);

  const rightShow = useMemo(() => {
    if (seriesList.length === 0) return null;
    return (
      seriesList.find((s) => s.slug === rightSlug) ||
      (seriesList.length > 1 ? seriesList[1] : seriesList[0])
    );
  }, [seriesList, rightSlug]);

  const arenaStats = useMemo(() => {
    if (!leftShow || !rightShow) return null;
    const total = Math.max(1, leftShow.viewers_premiere_28d + rightShow.viewers_premiere_28d);
    const leftPct = Number(((leftShow.viewers_premiere_28d / total) * 100).toFixed(1));
    const rightPct = Number((100 - leftPct).toFixed(1));
    const leftLeads = leftShow.viewers_premiere_28d >= rightShow.viewers_premiere_28d;
    const winner = leftLeads ? leftShow : rightShow;
    const loser = leftLeads ? rightShow : leftShow;
    const diff = Math.abs(leftShow.viewers_premiere_28d - rightShow.viewers_premiere_28d);
    const diffPct = ((diff / Math.max(1, loser.viewers_premiere_28d)) * 100).toFixed(1);
    return { leftPct, rightPct, leftLeads, winner, diff, diffPct };
  }, [leftShow, rightShow]);

  const selectTrendingBattle = (aSlug: string, bSlug: string) => {
    const a = seriesList.find((s) => s.slug === aSlug);
    const b = seriesList.find((s) => s.slug === bSlug);
    if (a && b) {
      setLeftSlug(a.slug);
      setRightSlug(b.slug);
      setLeftSearch(a.title);
      setRightSearch(b.title);
      setActiveTab('arena');
    }
  };

  // Leaderboard filtered list
  const rankedShows = useMemo(() => {
    return [...seriesList]
      .filter((s) => (platformFilter === 'ALL' ? true : s.network === platformFilter))
      .filter((s) => (genreFilter === 'ALL' ? true : s.genre_group.includes('Sci-Fi')))
      .sort((a, b) => b.viewers_premiere_28d - a.viewers_premiere_28d);
  }, [seriesList, platformFilter, genreFilter]);

  const maxLeaderboardViewers = rankedShows[0]?.viewers_premiere_28d || 1;

  // Guess Trivia Handlers
  const knownShow = seriesList.length > 0 ? seriesList[knownIdx % seriesList.length] : null;
  const challengerShow =
    seriesList.length > 0 ? seriesList[challengerIdx % seriesList.length] : null;
  const knownScore = knownShow
    ? guessMode === 'premieres'
      ? knownShow.viewers_premiere_28d
      : knownShow.viewers_finale
    : 0;
  const challengerScore = challengerShow
    ? guessMode === 'premieres'
      ? challengerShow.viewers_premiere_28d
      : challengerShow.viewers_finale
    : 0;

  const makeGuess = (choice: 'higher' | 'lower') => {
    if (revealed || !knownShow || !challengerShow) return;
    const isHigher = challengerScore >= knownScore;
    const correct = (choice === 'higher' && isHigher) || (choice === 'lower' && !isHigher);
    setRevealed(true);
    setLastGuessCorrect(correct);
    if (correct) {
      const nextStreak = streak + 1;
      setStreak(nextStreak);
      if (nextStreak > bestStreak) {
        setBestStreak(nextStreak);
        localStorage.setItem('tv_arena_best_streak', String(nextStreak));
      }
    } else {
      setStreak(0);
    }
  };

  const nextTriviaRound = () => {
    if (seriesList.length <= 1) return;
    const newKnown = challengerIdx;
    let nextChallenger = Math.floor(Math.random() * seriesList.length);
    if (nextChallenger === newKnown) {
      nextChallenger = (newKnown + 1) % seriesList.length;
    }
    setKnownIdx(newKnown);
    setChallengerIdx(nextChallenger);
    setRevealed(false);
    setLastGuessCorrect(null);
  };

  if (!isSupabaseConfigured) {
    return (
      <div className="w-full max-w-5xl mx-auto flex flex-col items-center pt-6 sm:pt-10 pb-16 px-4 font-sans text-arena-charcoal">
        <header className="w-full text-center mb-5 sm:mb-8">
          <h1 className="text-3xl sm:text-5xl font-serif tracking-tight font-medium text-arena-charcoal">
            TV <span className="italic text-arena-terracotta font-semibold">Arena</span>
          </h1>
          <p className="text-[10px] sm:text-xs uppercase tracking-[0.22em] sm:tracking-[0.24em] text-arena-muted font-semibold mt-1 sm:mt-1.5">
            Global Viewership Intelligence
          </p>
        </header>

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
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="w-full max-w-5xl mx-auto flex flex-col items-center pt-6 sm:pt-10 pb-16 px-4 font-sans text-arena-charcoal">
        <header className="w-full text-center mb-8">
          <h1 className="text-3xl sm:text-5xl font-serif tracking-tight font-medium text-arena-charcoal">
            TV <span className="italic text-arena-terracotta font-semibold">Arena</span>
          </h1>
        </header>
        <main className="w-full max-w-md bg-[#FCFAF6] border border-[#E9E1D3] rounded-[28px] p-10 shadow-soft-card flex flex-col items-center text-center">
          <div className="w-8 h-8 border-2 border-brand-terracotta border-t-transparent rounded-full animate-spin mb-4" />
          <h2 className="text-lg font-serif font-medium text-stone-800">Connecting to Supabase...</h2>
          <p className="text-xs text-stone-400 mt-1">Fetching live television series and telemetry</p>
        </main>
      </div>
    );
  }

  if (dbError) {
    return (
      <div className="w-full max-w-5xl mx-auto flex flex-col items-center pt-6 sm:pt-10 pb-16 px-4 font-sans text-arena-charcoal">
        <header className="w-full text-center mb-8">
          <h1 className="text-3xl sm:text-5xl font-serif tracking-tight font-medium text-arena-charcoal">
            TV <span className="italic text-arena-terracotta font-semibold">Arena</span>
          </h1>
        </header>
        <main className="w-full max-w-md bg-rose-50 border border-rose-200 rounded-[28px] p-8 text-center">
          <span className="text-xs uppercase tracking-wider font-bold text-rose-800 bg-rose-100 px-3 py-1 rounded-full">
            Database Query Error
          </span>
          <p className="text-xs text-rose-700 mt-3 font-mono">{dbError}</p>
        </main>
      </div>
    );
  }

  if (seriesList.length === 0 || !leftShow || !rightShow || !arenaStats) {
    return (
      <div className="w-full max-w-5xl mx-auto flex flex-col items-center pt-6 sm:pt-10 pb-16 px-4 font-sans text-arena-charcoal">
        <header className="w-full text-center mb-8">
          <h1 className="text-3xl sm:text-5xl font-serif tracking-tight font-medium text-arena-charcoal">
            TV <span className="italic text-arena-terracotta font-semibold">Arena</span>
          </h1>
        </header>
        <main className="w-full max-w-md bg-[#FCFAF6] border border-[#E9E1D3] rounded-[28px] p-8 shadow-soft-card text-center">
          <span className="text-xs uppercase tracking-wider font-semibold text-stone-500 bg-stone-100 px-3 py-1 rounded-full">
            0 Series Found
          </span>
          <h2 className="text-xl font-serif font-medium text-stone-900 mt-3 mb-2">Database Table Empty</h2>
          <p className="text-xs text-stone-500 leading-relaxed">
            Your Supabase connection is active, but the <code className="font-semibold">series</code> table contains no records. Execute <code className="font-semibold">supabase/schema.sql</code> or run the Rust ingestion pipeline (<code className="font-semibold">cargo run -- ingest</code>) to populate show data.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col items-center pt-6 sm:pt-10 pb-16 px-4 font-sans text-arena-charcoal">
      {/* Shared Brand Header */}
      <header className="w-full text-center mb-5 sm:mb-8">
        <h1 className="text-3xl sm:text-5xl font-serif tracking-tight font-medium text-arena-charcoal">
          TV <span className="italic text-arena-terracotta font-semibold">Arena</span>
        </h1>
        <p className="text-[10px] sm:text-xs uppercase tracking-[0.22em] sm:tracking-[0.24em] text-arena-muted font-semibold mt-1 sm:mt-1.5">
          Global Viewership Intelligence
        </p>
      </header>

      {/* Shared Navigation Pill */}
      <nav aria-label="Main Navigation" className="mb-6 sm:mb-12">
        <div className="inline-flex items-center bg-white/85 backdrop-blur-md p-1 sm:p-1.5 rounded-full border border-arena-border shadow-nav-pill">
          {(['leaderboard', 'arena', 'charts', 'guess'] as TabKey[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 sm:px-6 py-1.5 sm:py-2 text-[11px] sm:text-xs font-semibold tracking-wider uppercase rounded-full transition-all duration-200 ${
                activeTab === tab
                  ? 'text-white bg-arena-terracotta shadow-pill'
                  : 'text-arena-muted hover:text-arena-charcoal'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </nav>

      {/* ===================================================================
          SCREEN 1: ARENA (1v1 Head-to-Head Comparison)
         =================================================================== */}
      {activeTab === 'arena' && (
        <div className="w-full max-w-3xl flex flex-col items-center">
          {/* Search & Contender Selector */}
          <section className="w-full mb-5 sm:mb-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-4 relative items-center">
              {/* Left Input */}
              <div className="relative w-full">
                <input
                  type="text"
                  value={leftSearch}
                  onFocus={() => setLeftDropdownOpen(true)}
                  onBlur={() => setTimeout(() => setLeftDropdownOpen(false), 180)}
                  onChange={(e) => {
                    setLeftSearch(e.target.value);
                    setLeftDropdownOpen(true);
                  }}
                  placeholder="Type a series..."
                  className="w-full bg-arena-surface border border-arena-border text-arena-charcoal text-sm sm:text-base font-serif px-4 sm:px-5 py-2.5 sm:py-3.5 rounded-xl sm:rounded-2xl shadow-sm focus:border-arena-terracotta focus:ring-0 outline-none"
                />
                {leftDropdownOpen && (
                  <div className="absolute z-30 mt-2 w-full bg-arena-surface border border-arena-border rounded-2xl shadow-soft-card overflow-hidden">
                    {seriesList
                      .filter((s) => s.title.toLowerCase().includes(leftSearch.toLowerCase()))
                      .slice(0, 6)
                      .map((s) => (
                        <button
                          key={s.slug}
                          type="button"
                          onMouseDown={() => {
                            setLeftSlug(s.slug);
                            setLeftSearch(s.title);
                            setLeftDropdownOpen(false);
                          }}
                          className="w-full text-left px-4 py-2.5 hover:bg-arena-cream flex items-center justify-between text-sm font-serif"
                        >
                          <span className="font-semibold">{s.title}</span>
                          <span className="text-xs font-sans text-arena-muted">{s.network}</span>
                        </button>
                      ))}
                  </div>
                )}
              </div>

              {/* Clickable Swap Badge */}
              <button
                type="button"
                onClick={() => {
                  setLeftSlug(rightShow.slug);
                  setRightSlug(leftShow.slug);
                  setLeftSearch(rightShow.title);
                  setRightSearch(leftShow.title);
                }}
                title="Swap Contenders"
                className="hidden sm:flex absolute left-1/2 -translate-x-1/2 z-10 w-8 h-8 rounded-full bg-arena-cream border border-arena-border items-center justify-center text-arena-muted text-xs font-serif italic shadow-sm hover:border-arena-terracotta"
              >
                vs
              </button>

              {/* Right Input */}
              <div className="relative w-full">
                <input
                  type="text"
                  value={rightSearch}
                  onFocus={() => setRightDropdownOpen(true)}
                  onBlur={() => setTimeout(() => setRightDropdownOpen(false), 180)}
                  onChange={(e) => {
                    setRightSearch(e.target.value);
                    setRightDropdownOpen(true);
                  }}
                  placeholder="Type a series..."
                  className="w-full bg-arena-surface border border-arena-border text-arena-charcoal text-sm sm:text-base font-serif px-4 sm:px-5 py-2.5 sm:py-3.5 rounded-xl sm:rounded-2xl shadow-sm focus:border-arena-sage focus:ring-0 outline-none"
                />
                {rightDropdownOpen && (
                  <div className="absolute z-30 mt-2 w-full bg-arena-surface border border-arena-border rounded-2xl shadow-soft-card overflow-hidden">
                    {seriesList
                      .filter((s) => s.title.toLowerCase().includes(rightSearch.toLowerCase()))
                      .slice(0, 6)
                      .map((s) => (
                        <button
                          key={s.slug}
                          type="button"
                          onMouseDown={() => {
                            setRightSlug(s.slug);
                            setRightSearch(s.title);
                            setRightDropdownOpen(false);
                          }}
                          className="w-full text-left px-4 py-2.5 hover:bg-arena-cream flex items-center justify-between text-sm font-serif"
                        >
                          <span className="font-semibold">{s.title}</span>
                          <span className="text-xs font-sans text-arena-muted">{s.network}</span>
                        </button>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Main Comparison Card */}
          <main className="w-full bg-arena-surface border border-arena-border rounded-3xl p-5 sm:p-10 shadow-soft-card">
            <div className="flex items-center justify-between pb-4 sm:pb-6 mb-4 sm:mb-6 border-b border-arena-border/60 text-xs">
              <div className="flex items-center space-x-2">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                <span className="font-medium text-arena-muted uppercase tracking-wider text-[10px] sm:text-[11px]">
                  Metric: Global Premieres (First 28 Days)
                </span>
              </div>
              <div className="bg-arena-cream px-2.5 py-1 rounded-full border border-arena-border/80 text-arena-muted text-[10px] sm:text-[11px] font-medium">
                Season 1
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-4 items-end relative mb-4 sm:mb-6">
              <div className="text-left pr-2 sm:pr-4">
                <span className="block text-[10px] sm:text-[11px] uppercase tracking-wider font-semibold text-arena-muted mb-1 sm:mb-1.5">
                  {leftShow.network}
                </span>
                <h2 className="text-xl sm:text-3xl md:text-4xl font-serif font-bold text-arena-charcoal leading-tight">
                  {leftShow.title}
                </h2>
              </div>
              <div className="absolute left-1/2 bottom-1 sm:bottom-2 -translate-x-1/2 text-arena-muted/80 font-serif italic text-base sm:text-xl select-none">
                vs
              </div>
              <div className="text-right pl-2 sm:pl-4">
                <span className="block text-[10px] sm:text-[11px] uppercase tracking-wider font-semibold text-arena-muted mb-1 sm:mb-1.5">
                  {rightShow.network}
                </span>
                <h2 className="text-xl sm:text-3xl md:text-4xl font-serif font-bold text-arena-charcoal leading-tight">
                  {rightShow.title}
                </h2>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-4 items-center mb-4 sm:mb-6 pt-2 border-t border-arena-border/40 font-tabular">
              <div className="text-left">
                <div className="text-2xl sm:text-4xl md:text-5xl font-serif font-semibold">
                  {leftShow.viewers_premiere_28d.toLocaleString()}
                </div>
                <div className="text-[11px] sm:text-xs text-arena-muted font-medium mt-1 sm:mt-1.5">Household Viewers</div>
              </div>
              <div className="text-right">
                <div className="text-2xl sm:text-4xl md:text-5xl font-serif font-semibold">
                  {rightShow.viewers_premiere_28d.toLocaleString()}
                </div>
                <div className="text-[11px] sm:text-xs text-arena-muted font-medium mt-1 sm:mt-1.5">Household Viewers</div>
              </div>
            </div>

            {/* Tug of War Bar */}
            <div className="w-full my-4 sm:my-6">
              <div className="w-full h-3 sm:h-4 bg-arena-cream rounded-full overflow-hidden p-0.5 flex items-stretch border border-arena-border/70 shadow-inner">
                <div
                  className="h-full rounded-l-full transition-all duration-700 ease-out bg-arena-terracotta"
                  style={{ width: `${arenaStats.leftPct}%` }}
                />
                <div className="w-0.5 bg-arena-surface" />
                <div
                  className="h-full rounded-r-full transition-all duration-700 ease-out bg-arena-sage"
                  style={{ width: `${arenaStats.rightPct}%` }}
                />
              </div>
            </div>

            {/* Winner Footer */}
            <footer className="flex items-center justify-between pt-3 sm:pt-4 border-t border-arena-border/50 text-xs sm:text-sm gap-2">
              <div className="flex items-center space-x-2">
                <span className="flex h-2 w-2 relative">
                  <span
                    className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                      arenaStats.leftLeads ? 'bg-arena-terracotta' : 'bg-arena-sage'
                    }`}
                  />
                  <span
                    className={`relative inline-flex rounded-full h-2 w-2 ${
                      arenaStats.leftLeads ? 'bg-arena-terracotta' : 'bg-arena-sage'
                    }`}
                  />
                </span>
                <p className="font-serif font-semibold text-base sm:text-xl text-arena-charcoal leading-none">
                  {arenaStats.winner.title} leads
                </p>
              </div>
              <div className="text-[11px] sm:text-sm font-medium font-tabular text-arena-muted flex items-center">
                <span className="text-arena-charcoal font-semibold">
                  {arenaStats.diff.toLocaleString()}
                </span>
                <span className="ml-1">more</span>
                <span className="mx-1.5">·</span>
                <span
                  className={`font-semibold ${
                    arenaStats.leftLeads ? 'text-arena-terracotta' : 'text-arena-sage'
                  }`}
                >
                  +{arenaStats.diffPct}%
                </span>
              </div>
            </footer>
          </main>
        </div>
      )}

      {/* ===================================================================
          SCREEN 2: LEADERBOARD
         =================================================================== */}
      {activeTab === 'leaderboard' && (
        <main className="w-full max-w-4xl bg-white/90 backdrop-blur-xl rounded-[28px] sm:rounded-[32px] p-4 sm:p-10 shadow-card border border-[#EFEAE2]/90">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 pb-4 sm:pb-6 border-b border-[#F2ECE3]">
            <div className="flex items-center space-x-2 sm:space-x-2.5">
              <span className="inline-block w-2 sm:w-2.5 h-2 sm:h-2.5 rounded-full bg-brand-terracotta" />
              <span className="text-[10px] sm:text-xs uppercase tracking-wider font-semibold text-[#665D53]">
                Metric: Global Premieres (First 28 Days)
              </span>
            </div>
            <div className="flex items-center flex-wrap gap-1.5 sm:gap-2 text-[11px] sm:text-xs">
              <button
                onClick={() => setPlatformFilter(platformFilter === 'ALL' ? 'Netflix' : 'ALL')}
                className="bg-[#F6F1EA] text-[#3D372E] px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-full font-medium border border-[#E9E2D5]"
              >
                {platformFilter === 'ALL' ? 'All Platforms' : platformFilter}
              </button>
              <button
                onClick={() => setGenreFilter(genreFilter === 'ALL' ? 'SCI-FI' : 'ALL')}
                className="bg-white text-[#786E63] px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-full font-medium border border-[#E9E2D5]"
              >
                {genreFilter === 'ALL' ? 'All Genres' : 'Drama & Sci-Fi'}
              </button>
            </div>
          </div>

          <div className="mt-3 sm:mt-4 divide-y divide-[#F7F3ED]/75">
            {rankedShows.map((show, idx) => {
              const rank = idx + 1;
              const widthPct = Math.round((show.viewers_premiere_28d / maxLeaderboardViewers) * 100);
              const isSteady = Math.abs(show.delta_pct) < 0.5;
              const isUp = show.delta_pct > 0;

              return (
                <article
                  key={show.slug}
                  onClick={() => selectTrendingBattle(show.slug, rankedShows[(idx + 1) % rankedShows.length].slug)}
                  className={`ranking-row cursor-pointer relative overflow-hidden rounded-2xl py-2.5 sm:py-3.5 px-3 sm:px-4 my-1 sm:my-1.5 ${
                    rank === 1
                      ? 'bg-[#FBF7F0]/40 border border-[#F3ECE0]/80'
                      : 'hover:bg-[#FBF8F2] border border-transparent hover:border-[#EFE8DD]'
                  }`}
                >
                  <div
                    className={`absolute inset-y-0 left-0 rounded-2xl pointer-events-none ${
                      rank === 1 ? 'bar-highlight' : 'bar-subtle'
                    }`}
                    style={{ width: `${widthPct}%` }}
                  />
                  <div className="relative z-10 flex items-center justify-between gap-3 sm:gap-4">
                    <div className="flex items-center gap-3 sm:gap-5 min-w-0">
                      <div
                        className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-semibold text-xs sm:text-sm shrink-0 ${
                          rank === 1
                            ? 'bg-brand-terracotta text-white shadow-sm'
                            : 'bg-[#EFEAE1] text-[#696155]'
                        }`}
                      >
                        {rank}
                      </div>
                      <div className="min-w-0">
                        <h2 className="font-serif text-base sm:text-xl text-[#1E1A17] font-medium tracking-tight truncate">
                          {show.title}
                        </h2>
                        <p className="text-[11px] sm:text-xs text-[#8A8175] font-medium mt-0.5">{show.network}</p>
                      </div>
                    </div>

                    <div className="text-right shrink-0 font-tabular">
                      <div className="font-serif text-base sm:text-xl font-medium text-[#1E1A17]">
                        {show.viewers_premiere_28d.toLocaleString()}
                      </div>
                      {isSteady ? (
                        <div className="text-[10px] sm:text-xs font-medium text-[#A3998D] mt-0.5">
                          Steady
                        </div>
                      ) : (
                        <div
                          className={`text-[10px] sm:text-xs font-semibold flex items-center justify-end space-x-1 mt-0.5 ${
                            isUp ? 'text-brand-success' : 'text-brand-danger'
                          }`}
                        >
                          <span>{isUp ? '▲' : '▼'}</span>
                          <span>{Math.abs(show.delta_pct).toFixed(1)}%</span>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </main>
      )}

      {/* ===================================================================
          SCREEN 3: CHARTS (SVG Multi-Series Telemetry)
         =================================================================== */}
      {activeTab === 'charts' && (
        <section className="w-full max-w-5xl bg-[#FFFDF9]/95 backdrop-blur-md rounded-3xl p-5 sm:p-8 lg:p-10 shadow-soft border border-[#EDE5DA]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 pb-4 sm:pb-6 border-b border-stone-200/60">
            <div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-brand-terracotta" />
                <span className="text-[10px] sm:text-xs font-semibold tracking-widest uppercase text-stone-500">
                  Metric: Daily Active Household Viewers
                </span>
              </div>
              <p className="text-[10px] sm:text-xs text-stone-400 mt-0.5 sm:mt-1">
                Real-time syndicated streaming telemetry across primary global markets
              </p>
            </div>
            <div className="self-end sm:self-auto inline-flex items-center bg-[#F3EFE9] p-0.5 sm:p-1 rounded-full text-[10px] sm:text-xs font-medium border border-[#E7DFD5]">
              {(['7D', '30D', '90D', 'All-Time'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setChartRange(r)}
                  className={`px-2.5 sm:px-3.5 py-0.5 sm:py-1 rounded-full transition-colors ${
                    chartRange === r
                      ? 'bg-white text-stone-800 shadow-sm font-semibold'
                      : 'text-stone-500 hover:text-stone-900'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center justify-start sm:justify-center gap-x-3.5 sm:gap-x-6 gap-y-1.5 sm:gap-y-2.5 pt-4 sm:pt-6 pb-4 sm:pb-6 text-[10.5px] sm:text-xs font-medium text-stone-600">
            {seriesList.slice(0, 6).map((s) => (
              <div key={s.slug} className="flex items-center gap-1.5 sm:gap-2">
                <span
                  className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full"
                  style={{ backgroundColor: s.chart_color }}
                />
                <span className="text-stone-800 font-medium">{s.title}</span>
              </div>
            ))}
          </div>

          {/* Mobile SVG (viewBox="0 0 340 185") */}
          <div className="block sm:hidden relative w-full overflow-hidden mt-1 mb-6">
            <svg className="w-full h-auto select-none chart-group" viewBox="0 0 340 185">
              <line stroke="#ECE5DA" strokeDasharray="2 3" x1="35" x2="335" y1="20" y2="20" />
              <text fill="#A89F91" fontSize="9" textAnchor="end" x="30" y="23">1.60M</text>
              <line stroke="#ECE5DA" strokeDasharray="2 3" x1="35" x2="335" y1="55" y2="55" />
              <text fill="#A89F91" fontSize="9" textAnchor="end" x="30" y="58">1.20M</text>
              <line stroke="#ECE5DA" strokeDasharray="2 3" x1="35" x2="335" y1="91" y2="91" />
              <text fill="#A89F91" fontSize="9" textAnchor="end" x="30" y="94">800K</text>
              <line stroke="#ECE5DA" strokeDasharray="2 3" x1="35" x2="335" y1="126" y2="126" />
              <text fill="#A89F91" fontSize="9" textAnchor="end" x="30" y="129">400K</text>
              <line stroke="#DDD4C7" strokeWidth="1" x1="35" x2="335" y1="162" y2="162" />
              <text fill="#A89F91" fontSize="9" textAnchor="end" x="30" y="165">0</text>

              {['-6d', '-5d', '-4d', '-3d', '-2d', '-1d', 'now'].map((label, idx) => {
                const x = 35 + idx * 49;
                return (
                  <g key={label}>
                    <line stroke="#F4EDE4" x1={x} x2={x} y1="20" y2="162" />
                    <text fill="#999083" fontSize="8.5" textAnchor="middle" x={x} y="176">
                      {label}
                    </text>
                  </g>
                );
              })}

              {seriesList.slice(0, 6).map((show) => {
                const { pathD, points } = buildMobileChartGeometry(show.daily_series);
                return (
                  <g key={show.slug}>
                    <path
                      className="chart-line"
                      d={pathD}
                      fill="none"
                      stroke={show.chart_color}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                    />
                    {points.map((pt, i) => (
                      <circle
                        key={i}
                        cx={pt.x}
                        cy={pt.y}
                        fill={show.chart_color}
                        r={i === 6 ? 3.5 : 2.5}
                      />
                    ))}
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Desktop SVG (viewBox="0 0 1000 420") */}
          <div className="hidden sm:block relative w-full overflow-hidden mt-1 mb-8">
            <svg className="w-full h-auto select-none chart-group" viewBox="0 0 1000 420">
              <line stroke="#ECE5DA" strokeDasharray="3 4" x1="75" x2="960" y1="40" y2="40" />
              <text fill="#A89F91" fontSize="11" textAnchor="end" x="65" y="44">1.60M</text>
              <line stroke="#ECE5DA" strokeDasharray="3 4" x1="75" x2="960" y1="115" y2="115" />
              <text fill="#A89F91" fontSize="11" textAnchor="end" x="65" y="119">1.20M</text>
              <line stroke="#ECE5DA" strokeDasharray="3 4" x1="75" x2="960" y1="190" y2="190" />
              <text fill="#A89F91" fontSize="11" textAnchor="end" x="65" y="194">800K</text>
              <line stroke="#ECE5DA" strokeDasharray="3 4" x1="75" x2="960" y1="265" y2="265" />
              <text fill="#A89F91" fontSize="11" textAnchor="end" x="65" y="269">400K</text>
              <line stroke="#DDD4C7" strokeWidth="1.25" x1="75" x2="960" y1="340" y2="340" />
              <text fill="#A89F91" fontSize="11" textAnchor="end" x="65" y="344">0</text>

              {['-6d', '-5d', '-4d', '-3d', '-2d', '-1d', 'now'].map((label, idx) => {
                const x = 85 + idx * 145;
                return (
                  <g key={label}>
                    <line stroke="#F4EDE4" x1={x} x2={x} y1="40" y2="340" />
                    <text fill="#999083" fontSize="12" textAnchor="middle" x={x} y="375">
                      {label}
                    </text>
                  </g>
                );
              })}

              {seriesList.slice(0, 6).map((show) => {
                const { pathD, points } = buildChartGeometry(show.daily_series);
                return (
                  <g key={show.slug}>
                    <path
                      className="chart-line"
                      d={pathD}
                      fill="none"
                      stroke={show.chart_color}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2.5"
                    />
                    {points.map((pt, i) => (
                      <circle
                        key={i}
                        cx={pt.x}
                        cy={pt.y}
                        fill={show.chart_color}
                        r={i === 6 ? 4.5 : 3.5}
                      />
                    ))}
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Cumulative Horizontal Volume Bars */}
          <div className="pt-4 sm:pt-6 border-t border-stone-200/60 space-y-3 sm:space-y-4">
            <div className="flex items-center justify-between text-[11px] sm:text-xs mb-2 sm:mb-3 text-stone-500 font-medium">
              <span>Cumulative Period Totals ({chartRange})</span>
              <span>Total Measured Households</span>
            </div>
            {seriesList.slice(0, 3).map((show) => {
              const pct = ((show.viewers_premiere_28d / 10000000) * 100).toFixed(1);
              return (
                <div key={show.slug} className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4">
                  <div className="flex items-center justify-between sm:w-44 shrink-0">
                    <span className="text-sm md:text-base font-medium text-stone-800 font-serif">
                      {show.title}
                    </span>
                    <span className="sm:hidden text-xs font-medium text-stone-700 font-tabular">
                      {show.viewers_premiere_28d.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex-1 bg-[#F1EAE0] h-2.5 sm:h-3 rounded-full overflow-hidden p-0.5">
                    <div
                      className="h-full bg-[#C66A3D] rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="hidden sm:inline-block w-24 text-right text-xs md:text-sm font-medium text-stone-700 font-tabular">
                    {show.viewers_premiere_28d.toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ===================================================================
          SCREEN 4: GUESS TRIVIA
         =================================================================== */}
      {activeTab === 'guess' && (
        <main className="w-full max-w-3xl mx-auto py-2 sm:py-4">
          <div className="flex items-center justify-center space-x-6 mb-5 sm:mb-7 text-xs font-medium tracking-[0.2em] uppercase text-stone-500">
            <div className="flex items-center space-x-2">
              <span>Streak</span>
              <span className="font-serif text-base text-stone-900 font-bold">{streak}</span>
            </div>
            <span className="inline-block w-1 h-1 rounded-full bg-stone-300" />
            <div className="flex items-center space-x-2">
              <span>Best</span>
              <span className="font-serif text-base text-stone-900 font-bold">{bestStreak}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 md:gap-7 items-stretch">
            {/* Left Card: KNOWN */}
            <article className="bg-[#F8FAF6]/90 backdrop-blur-sm rounded-[24px] sm:rounded-[28px] p-5 sm:p-7 md:p-8 border border-stone-200/70 shadow-soft-card flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3 sm:mb-4">
                  <span className="text-[10px] tracking-[0.22em] uppercase font-bold text-stone-400">
                    Known
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-stone-100 text-stone-500">
                    Benchmark
                  </span>
                </div>
                <h2 className="text-2xl sm:text-3xl md:text-4xl font-serif font-medium text-stone-900">
                  {knownShow?.title}
                </h2>
                <p className="text-xs text-stone-400 font-medium mt-1">{knownShow?.network}</p>
              </div>
              <div className="mt-8 sm:mt-14 pt-4 border-t border-stone-100/80 font-tabular">
                <div className="text-3xl sm:text-4xl md:text-[42px] font-serif font-medium text-stone-900">
                  {knownScore.toLocaleString()}
                </div>
                <p className="text-[10px] sm:text-[11px] uppercase tracking-wider text-stone-400 font-medium mt-1">
                  Household Viewers
                </p>
              </div>
            </article>

            {/* Right Card: CHALLENGER */}
            <article className="bg-[#F8FAF6]/90 backdrop-blur-sm rounded-[24px] sm:rounded-[28px] p-5 sm:p-7 md:p-8 border border-stone-200/70 shadow-soft-card flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3 sm:mb-4">
                  <span className="text-[10px] tracking-[0.22em] uppercase font-bold text-stone-400">
                    Challenger
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      revealed
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    {revealed ? 'Revealed' : 'Guess Now'}
                  </span>
                </div>
                <h2 className="text-2xl sm:text-3xl md:text-4xl font-serif font-medium text-stone-900">
                  {challengerShow?.title}
                </h2>
                <p className="text-xs text-stone-400 font-medium mt-1">{challengerShow?.network}</p>
              </div>

              <div className="mt-8 sm:mt-14 pt-4 border-t border-stone-100/80 font-tabular">
                {revealed ? (
                  <>
                    <div className="text-3xl sm:text-4xl md:text-[42px] font-serif font-medium text-stone-900">
                      {challengerScore.toLocaleString()}
                    </div>
                    <p className="text-[10px] sm:text-[11px] uppercase tracking-wider text-stone-400 font-medium mt-1">
                      Household Viewers
                    </p>
                  </>
                ) : (
                  <div className="flex gap-2.5 sm:gap-3">
                    <button
                      onClick={() => makeGuess('higher')}
                      className="flex-1 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl bg-brand-terracotta text-white text-xs font-semibold uppercase tracking-wider hover:bg-brand-terracottaHover transition"
                    >
                      ▲ Higher
                    </button>
                    <button
                      onClick={() => makeGuess('lower')}
                      className="flex-1 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl bg-stone-200 text-stone-800 text-xs font-semibold uppercase tracking-wider hover:bg-stone-300 transition"
                    >
                      ▼ Lower
                    </button>
                  </div>
                )}
              </div>
            </article>
          </div>

          {/* Next Button & Feedback */}
          <div className="mt-6 sm:mt-8 flex flex-col items-center">
            <button
              onClick={nextTriviaRound}
              className="inline-flex items-center justify-center px-8 sm:px-10 py-2.5 sm:py-3 rounded-full bg-brand-terracotta text-white font-medium text-xs sm:text-sm tracking-widest uppercase shadow-pill hover:bg-brand-terracottaHover transition-all"
            >
              <span>Next</span>
              <span className="ml-2">→</span>
            </button>
            {revealed && (
              <div
                className={`mt-3 sm:mt-4 text-xs sm:text-[13px] font-medium ${
                  lastGuessCorrect ? 'text-emerald-600' : 'text-rose-600'
                }`}
              >
                {lastGuessCorrect ? 'Correct.' : 'Wrong.'} {challengerShow?.title} drew{' '}
                {challengerScore.toLocaleString()}.
              </div>
            )}
          </div>

          <div className="mt-6 sm:mt-8 flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs text-stone-500">
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-stone-400 mr-1">
              Trivia Modes:
            </span>
            <button
              onClick={() => setGuessMode('premieres')}
              className={`px-3 sm:px-4 py-1 sm:py-1.5 rounded-full border ${
                guessMode === 'premieres' ? 'bg-white font-semibold' : 'bg-white/60'
              }`}
            >
              Global Premieres
            </button>
            <button
              onClick={() => setGuessMode('finales')}
              className={`px-3 sm:px-4 py-1 sm:py-1.5 rounded-full border ${
                guessMode === 'finales' ? 'bg-white font-semibold' : 'bg-white/60'
              }`}
            >
              Season Finales
            </button>
            <button
              onClick={nextTriviaRound}
              className="px-3 sm:px-4 py-1 sm:py-1.5 rounded-full bg-white/70 hover:bg-white border"
            >
              Skip Show
            </button>
          </div>
        </main>
      )}

      {/* Shared Trending Battles Footer */}
      <footer className="mt-8 sm:mt-10 flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 text-xs text-arena-muted">
        <span className="text-[10px] sm:text-[11px] uppercase tracking-wider font-semibold">Trending Battles:</span>
        <button
          onClick={() => selectTrendingBattle('the-last-of-us', 'fallout')}
          className="px-2.5 sm:px-3.5 py-1 sm:py-1.5 bg-white/70 hover:bg-white rounded-full border border-arena-border transition-colors text-[11px] sm:text-xs"
        >
          The Last of Us vs Fallout
        </button>
        <button
          onClick={() => selectTrendingBattle('succession', 'the-bear')}
          className="px-2.5 sm:px-3.5 py-1 sm:py-1.5 bg-white/70 hover:bg-white rounded-full border border-arena-border transition-colors text-[11px] sm:text-xs"
        >
          Succession vs The Bear
        </button>
        <button
          onClick={() => selectTrendingBattle('severance', 'silo')}
          className="px-2.5 sm:px-3.5 py-1 sm:py-1.5 bg-white/70 hover:bg-white rounded-full border border-arena-border transition-colors text-[11px] sm:text-xs"
        >
          Severance vs Silo
        </button>
      </footer>
    </div>
  );
}
