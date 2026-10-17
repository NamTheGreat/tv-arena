import React, { useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured, SeriesItem, supabase } from './lib/supabase';
import { useAuth } from './lib/auth';
import { ArenaContenders, ArenaStats } from './components/ArenaContenders';
import { LeaderboardTable } from './components/LeaderboardTable';
import { ChartRange, TrajectoryChart } from './components/TrajectoryChart';
import { TriviaGame } from './components/TriviaGame';
import { DatabaseStatusCard } from './components/DatabaseStatusCard';
import { AuthModal } from './components/AuthModal';

type TabKey = 'leaderboard' | 'arena' | 'charts' | 'guess';

export default function App() {
  const { user, signOut } = useAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
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
  const [chartRange, setChartRange] = useState<ChartRange>('7D');

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
        // Query recent telemetry (last 90 days) scoped to top charted/cumulative shows to respect Supabase row limits
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        const startDateStr = ninetyDaysAgo.toISOString().split('T')[0];
        const chartedIds = data.slice(0, 10).map((s: any) => s.id);

        const { data: telemetryData } = await supabase
          .from('series_daily_telemetry')
          .select('series_id, daily_viewers, recorded_date')
          .in('series_id', chartedIds)
          .gte('recorded_date', startDateStr)
          .order('recorded_date', { ascending: true });

        const telemetryValuesMap = new Map<string, number[]>();
        const telemetryDatesMap = new Map<string, string[]>();
        if (telemetryData) {
          for (const row of telemetryData) {
            const arr = telemetryValuesMap.get(row.series_id) || [];
            arr.push(Number(row.daily_viewers));
            telemetryValuesMap.set(row.series_id, arr);

            const dateArr = telemetryDatesMap.get(row.series_id) || [];
            dateArr.push(String(row.recorded_date));
            telemetryDatesMap.set(row.series_id, dateArr);
          }
        }

        const mapped: SeriesItem[] = data.map((row: any) => ({
          ...row,
          viewers_premiere_28d: Number(row.viewers_premiere_28d || 0),
          viewers_finale: Number(row.viewers_finale || 0),
          delta_pct: Number(row.delta_pct || 0),
          daily_series: telemetryValuesMap.get(row.id) || [],
          daily_dates: telemetryDatesMap.get(row.id) || [],
        }));

        setSeriesList(mapped);
        setLeftSlug(mapped[0].slug);
        setLeftSearch(mapped[0].title);
        if (mapped.length > 1) {
          setRightSlug(mapped[1].slug);
          setRightSearch(mapped[1].title);
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

  const arenaStats: ArenaStats | null = useMemo(() => {
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

  // Available platforms and genres dynamically derived from dataset
  const availablePlatforms = useMemo(() => {
    const set = new Set<string>();
    for (const s of seriesList) {
      if (s.network) set.add(s.network);
    }
    return ['ALL', ...Array.from(set)];
  }, [seriesList]);

  const availableGenres = useMemo(() => {
    const set = new Set<string>();
    for (const s of seriesList) {
      if (s.genre_group) set.add(s.genre_group);
    }
    return ['ALL', ...Array.from(set)];
  }, [seriesList]);

  // Leaderboard filtered list
  const rankedShows = useMemo(() => {
    return [...seriesList]
      .filter((s) => (platformFilter === 'ALL' ? true : s.network === platformFilter))
      .filter((s) => (genreFilter === 'ALL' ? true : s.genre_group === genreFilter))
      .sort((a, b) => b.viewers_premiere_28d - a.viewers_premiere_28d);
  }, [seriesList, platformFilter, genreFilter]);

  const maxLeaderboardViewers = rankedShows[0]?.viewers_premiere_28d || 1;

  if (!isSupabaseConfigured) {
    return <DatabaseStatusCard type="unconfigured" />;
  }

  if (isLoading) {
    return <DatabaseStatusCard type="loading" />;
  }

  if (dbError) {
    return <DatabaseStatusCard type="error" errorMessage={dbError} />;
  }

  if (seriesList.length === 0 || !leftShow || !rightShow || !arenaStats) {
    return <DatabaseStatusCard type="empty" />;
  }

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col items-center pt-6 sm:pt-10 pb-16 px-4 font-sans text-arena-charcoal">
      {/* Shared Brand Header & User Auth Bar */}
      <header className="w-full text-center mb-5 sm:mb-8 relative">
        <div className="w-full flex justify-end mb-2">
          {user ? (
            <div className="inline-flex items-center gap-2 bg-white/80 border border-arena-border px-3 py-1 rounded-full text-xs text-arena-charcoal shadow-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-medium max-w-[140px] truncate">
                {user.email?.split('@')[0]}
              </span>
              <button
                type="button"
                onClick={() => signOut()}
                className="text-arena-muted hover:text-arena-terracotta text-[10px] uppercase font-semibold ml-1 transition-colors"
              >
                Log out
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsAuthModalOpen(true)}
              className="inline-flex items-center gap-1.5 bg-white/80 border border-arena-border hover:border-arena-terracotta px-3 py-1 rounded-full text-xs text-arena-charcoal shadow-sm transition-colors"
            >
              <span className="w-2 h-2 rounded-full bg-stone-300" />
              <span className="font-medium">Sign In</span>
            </button>
          )}
        </div>

        <h1 className="text-3xl sm:text-5xl font-serif tracking-tight font-medium text-arena-charcoal">
          TV <span className="italic text-arena-terracotta font-semibold">Arena</span>
        </h1>
        <p className="text-[10px] sm:text-xs uppercase tracking-[0.22em] sm:tracking-[0.24em] text-arena-muted font-semibold mt-1 sm:mt-1.5">
          Global TV Engagement Intelligence
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

      {/* SCREEN 1: ARENA (1v1 Head-to-Head Comparison) */}
      {activeTab === 'arena' && (
        <ArenaContenders
          seriesList={seriesList}
          leftShow={leftShow}
          rightShow={rightShow}
          leftSearch={leftSearch}
          rightSearch={rightSearch}
          leftDropdownOpen={leftDropdownOpen}
          rightDropdownOpen={rightDropdownOpen}
          setLeftSearch={setLeftSearch}
          setRightSearch={setRightSearch}
          setLeftDropdownOpen={setLeftDropdownOpen}
          setRightDropdownOpen={setRightDropdownOpen}
          onSelectLeftShow={(show) => {
            setLeftSlug(show.slug);
            setLeftSearch(show.title);
          }}
          onSelectRightShow={(show) => {
            setRightSlug(show.slug);
            setRightSearch(show.title);
          }}
          onSwapShows={() => {
            setLeftSlug(rightShow.slug);
            setRightSlug(leftShow.slug);
            setLeftSearch(rightShow.title);
            setRightSearch(leftShow.title);
          }}
          arenaStats={arenaStats}
        />
      )}

      {/* SCREEN 2: LEADERBOARD */}
      {activeTab === 'leaderboard' && (
        <LeaderboardTable
          rankedShows={rankedShows}
          platformFilter={platformFilter}
          genreFilter={genreFilter}
          availablePlatforms={availablePlatforms}
          availableGenres={availableGenres}
          maxLeaderboardViewers={maxLeaderboardViewers}
          setPlatformFilter={setPlatformFilter}
          setGenreFilter={setGenreFilter}
          onSelectBattle={selectTrendingBattle}
        />
      )}

      {/* SCREEN 3: CHARTS (SVG Multi-Series Telemetry) */}
      {activeTab === 'charts' && (
        <TrajectoryChart
          seriesList={seriesList}
          chartRange={chartRange}
          setChartRange={setChartRange}
        />
      )}

      {/* SCREEN 4: GUESS TRIVIA */}
      {activeTab === 'guess' && (
        <TriviaGame seriesList={seriesList} />
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

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </div>
  );
}
