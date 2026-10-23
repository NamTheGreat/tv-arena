import React, { Suspense, useEffect, useMemo, useState } from 'react';
import {
  Routes,
  Route,
  useNavigate,
  useLocation,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { isSupabaseConfigured, SeriesItem, supabase } from './lib/supabase';
import { useAuth } from './lib/auth';
import { ArenaStats } from './components/ArenaContenders';
import { ChartRange } from './components/TrajectoryChart';
import { DatabaseStatusCard } from './components/DatabaseStatusCard';
import { UserProfileDropdown } from './components/UserProfileDropdown';

const AuthModal = React.lazy(() =>
  import('./components/AuthModal').then((m) => ({ default: m.AuthModal }))
);
const MethodologyModal = React.lazy(() =>
  import('./components/MethodologyModal').then((m) => ({ default: m.MethodologyModal }))
);
const LearnToPlayModal = React.lazy(() =>
  import('./components/LearnToPlayModal').then((m) => ({ default: m.LearnToPlayModal }))
);

// Route components code-split with React.lazy
const LeaderboardTable = React.lazy(() =>
  import('./components/LeaderboardTable').then((m) => ({ default: m.LeaderboardTable }))
);
const ArenaContenders = React.lazy(() =>
  import('./components/ArenaContenders').then((m) => ({ default: m.ArenaContenders }))
);
const TrajectoryChart = React.lazy(() =>
  import('./components/TrajectoryChart').then((m) => ({ default: m.TrajectoryChart }))
);
const TriviaGame = React.lazy(() =>
  import('./components/TriviaGame').then((m) => ({ default: m.TriviaGame }))
);
const ShowDetailView = React.lazy(() =>
  import('./components/ShowDetailView').then((m) => ({ default: m.ShowDetailView }))
);
const NotFoundView = React.lazy(() =>
  import('./components/NotFoundView').then((m) => ({ default: m.NotFoundView }))
);

type TabKey = 'leaderboard' | 'arena' | 'charts' | 'guess';

function RouteLoadingFallback() {
  return (
    <div className="w-full max-w-4xl mx-auto py-16 flex flex-col items-center justify-center animate-pulse">
      <div className="w-9 h-9 rounded-full border-2 border-arena-border border-t-arena-terracotta animate-spin mb-3" />
      <span className="text-[11px] uppercase tracking-widest font-semibold text-arena-muted">
        Loading Arena Stage...
      </span>
    </div>
  );
}

// Wrapper for Leaderboard Route (/)
function LeaderboardRouteWrapper({
  seriesList,
  platformFilter,
  genreFilter,
  availablePlatforms,
  availableGenres,
  setPlatformFilter,
  setGenreFilter,
}: {
  seriesList: SeriesItem[];
  platformFilter: string;
  genreFilter: string;
  availablePlatforms: string[];
  availableGenres: string[];
  setPlatformFilter: (p: string) => void;
  setGenreFilter: (g: string) => void;
}) {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = 'TV Arena — Viewership Leaderboard';
  }, []);

  const rankedShows = useMemo(() => {
    return [...seriesList]
      .filter((s) => (platformFilter === 'ALL' ? true : s.network === platformFilter))
      .filter((s) => (genreFilter === 'ALL' ? true : s.genre_group === genreFilter))
      .sort((a, b) => {
        const scoreA = Number(a.buzz_score || 0);
        const scoreB = Number(b.buzz_score || 0);
        return scoreB - scoreA;
      });
  }, [seriesList, platformFilter, genreFilter]);

  const maxScore = useMemo(() => {
    const top = rankedShows[0];
    if (!top) return 1;
    return Number(top.buzz_score || 1);
  }, [rankedShows]);

  return (
    <LeaderboardTable
      rankedShows={rankedShows}
      platformFilter={platformFilter}
      genreFilter={genreFilter}
      availablePlatforms={availablePlatforms}
      availableGenres={availableGenres}
      maxLeaderboardViewers={maxScore}
      setPlatformFilter={setPlatformFilter}
      setGenreFilter={setGenreFilter}
      onSelectBattle={(a, b) => navigate(`/arena/${a}/${b}`)}
    />
  );
}

// Wrapper for Arena Route (/arena, /arena/:a/:b)
function ArenaRouteWrapper({ seriesList }: { seriesList: SeriesItem[] }) {
  const { a, b } = useParams<{ a?: string; b?: string }>();
  const navigate = useNavigate();

  const [leftSearch, setLeftSearch] = useState('');
  const [rightSearch, setRightSearch] = useState('');
  const [leftDropdownOpen, setLeftDropdownOpen] = useState(false);
  const [rightDropdownOpen, setRightDropdownOpen] = useState(false);

  const validLeft = a ? seriesList.find((s) => s.slug === a) : null;
  const validRight = b ? seriesList.find((s) => s.slug === b) : null;

  const leftShow = validLeft || seriesList[0] || null;
  const rightShow =
    validRight || (seriesList.length > 1 ? seriesList[1] : seriesList[0]) || null;

  // Clean URL if invalid, unmatching, or missing slugs
  useEffect(() => {
    if (seriesList.length < 2) return;
    const defaultA = seriesList[0].slug;
    const defaultB = seriesList[1].slug;

    if (!a || !b || !validLeft || !validRight || leftShow.slug === rightShow.slug) {
      navigate(`/arena/${leftShow?.slug || defaultA}/${rightShow?.slug || defaultB}`, {
        replace: true,
      });
    }
  }, [a, b, validLeft, validRight, leftShow, rightShow, seriesList, navigate]);

  useEffect(() => {
    if (leftShow && rightShow) {
      document.title = `${leftShow.title} vs ${rightShow.title} — TV Arena Battle`;
      setLeftSearch(leftShow.title);
      setRightSearch(rightShow.title);
    }
  }, [leftShow, rightShow]);

  const arenaStats: ArenaStats | null = useMemo(() => {
    if (!leftShow || !rightShow) return null;
    const scoreA = Number(leftShow.buzz_score || 0);
    const scoreB = Number(rightShow.buzz_score || 0);
    const total = Math.max(1, scoreA + scoreB);
    const leftPct = Number(((scoreA / total) * 100).toFixed(1));
    const rightPct = Number((100 - leftPct).toFixed(1));
    const leftLeads = scoreA >= scoreB;
    const winner = leftLeads ? leftShow : rightShow;
    const loser = leftLeads ? rightShow : leftShow;
    const loserScore = Number(loser.buzz_score || 0);
    const diff = Math.abs(scoreA - scoreB);
    const diffPct = `${((diff / Math.max(1, loserScore)) * 100).toFixed(1)}%`;
    return { leftPct, rightPct, leftLeads, winner, diff, diffPct };
  }, [leftShow, rightShow]);

  if (!leftShow || !rightShow || !arenaStats) {
    return <RouteLoadingFallback />;
  }

  return (
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
        setLeftSearch(show.title);
        navigate(`/arena/${show.slug}/${rightShow.slug}`);
      }}
      onSelectRightShow={(show) => {
        setRightSearch(show.title);
        navigate(`/arena/${leftShow.slug}/${show.slug}`);
      }}
      onSwapShows={() => {
        setLeftSearch(rightShow.title);
        setRightSearch(leftShow.title);
        navigate(`/arena/${rightShow.slug}/${leftShow.slug}`);
      }}
      arenaStats={arenaStats}
    />
  );
}

// Wrapper for Charts Route (/charts, /charts/:slug) with ?range= URL state
function ChartsRouteWrapper({ seriesList }: { seriesList: SeriesItem[] }) {
  const { slug } = useParams<{ slug?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const rangeParam = searchParams.get('range') as ChartRange | null;
  const validRanges: ChartRange[] = ['7D', '30D', '90D', 'All-Time'];
  const chartRange: ChartRange =
    rangeParam && validRanges.includes(rangeParam) ? rangeParam : '30D';

  const setChartRange = (range: ChartRange) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('range', range);
        return next;
      },
      { replace: true }
    );
  };

  useEffect(() => {
    if (slug) {
      const show = seriesList.find((s) => s.slug === slug);
      document.title = show
        ? `${show.title} — Engagement Trajectory | TV Arena`
        : 'TV Arena — Multi-Series Trajectory';
    } else {
      document.title = 'TV Arena — Multi-Series Trajectory';
    }
  }, [slug, seriesList]);

  return (
    <TrajectoryChart
      seriesList={seriesList}
      chartRange={chartRange}
      setChartRange={setChartRange}
      focusedSlug={slug}
    />
  );
}

// Wrapper for Guess Route (/guess, /guess/daily)
function GuessRouteWrapper({
  seriesList,
  isDaily = false,
  onOpenLearnToPlay,
}: {
  seriesList: SeriesItem[];
  isDaily?: boolean;
  onOpenLearnToPlay: () => void;
}) {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = isDaily
      ? 'TV Arena — Daily Challenge 🎯'
      : 'TV Arena — Guess Trivia';
  }, [isDaily]);

  return (
    <TriviaGame
      seriesList={seriesList}
      onViewLeaderboard={() => navigate('/')}
      onOpenLearnToPlay={onOpenLearnToPlay}
    />
  );
}

export default function App() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isMethodologyOpen, setIsMethodologyOpen] = useState(false);
  const [isLearnModalOpen, setIsLearnModalOpen] = useState(false);
  const [seriesList, setSeriesList] = useState<SeriesItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(isSupabaseConfigured);
  const [dbError, setDbError] = useState<string | null>(null);

  // Leaderboard Filter State
  const [platformFilter, setPlatformFilter] = useState<string>('ALL');
  const [genreFilter, setGenreFilter] = useState<string>('ALL');

  // Guess Best Streak from local storage for User Profile Header
  const bestStreak = Number(localStorage.getItem('tv_arena_best_streak') || '0');

  // Determine active tab from URL pathname
  const activeTab: TabKey = useMemo(() => {
    if (location.pathname.startsWith('/arena')) return 'arena';
    if (location.pathname.startsWith('/charts')) return 'charts';
    if (location.pathname.startsWith('/guess')) return 'guess';
    return 'leaderboard';
  }, [location.pathname]);

  // Load live data from Supabase if configured
  useEffect(() => {
    async function loadFromSupabase() {
      if (!supabase) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setDbError(null);
      // Query authoritative SQL leaderboard view with fallback to series table
      let { data, error } = await (supabase as any)
        .from('series_leaderboard')
        .select('*');

      if (error || !data || data.length === 0) {
        const fallback = await supabase
          .from('series')
          .select('*')
          .order('buzz_score', { ascending: false });
        data = fallback.data as any;
        error = fallback.error;
      }

      if (error) {
        setDbError(error.message);
        setIsLoading(false);
        return;
      }

      if (data && data.length > 0) {
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        const startDateStr = ninetyDaysAgo.toISOString().split('T')[0];
        const chartedIds = data.slice(0, 10).map((s: any) => s.id);

        // Query dynamic daily scores view with fallback to raw telemetry
        let { data: telemetryData } = await (supabase as any)
          .from('series_daily_scores')
          .select('series_id, daily_score, recorded_date')
          .in('series_id', chartedIds)
          .gte('recorded_date', startDateStr)
          .order('recorded_date', { ascending: true });

        if (!telemetryData || telemetryData.length === 0) {
          const fallbackTelemetry = await supabase
            .from('series_daily_telemetry')
            .select('series_id, daily_score, recorded_date')
            .in('series_id', chartedIds)
            .gte('recorded_date', startDateStr)
            .order('recorded_date', { ascending: true });
          telemetryData = fallbackTelemetry.data as any;
        }

        const telemetryValuesMap = new Map<string, number[]>();
        const telemetryDatesMap = new Map<string, string[]>();
        if (telemetryData) {
          for (const row of telemetryData) {
            const arr = telemetryValuesMap.get(row.series_id) || [];
            arr.push(Number(row.daily_score ?? 0));
            telemetryValuesMap.set(row.series_id, arr);

            const dateArr = telemetryDatesMap.get(row.series_id) || [];
            dateArr.push(String(row.recorded_date));
            telemetryDatesMap.set(row.series_id, dateArr);
          }
        }

        const mapped: SeriesItem[] = data.map((row: any) => ({
          ...row,
          buzz_score: Number(
            row.current_7d_score ?? row.buzz_score ?? 0
          ),
          delta_pct: Number(row.delta_pct || 0),
          daily_series: telemetryValuesMap.get(row.id) || [Number(row.current_7d_score ?? row.buzz_score ?? 0)],
          daily_dates: telemetryDatesMap.get(row.id) || [],
        }));

        setSeriesList(mapped);
      }
      setIsLoading(false);
    }
    loadFromSupabase();
  }, []);

  // Available platforms and genres dynamically derived from dataset
  const availablePlatforms = useMemo(() => {
    const set = new Set<string>();
    for (const s of seriesList) {
      if (s.network) set.add(s.network);
    }
    return ['ALL', ...Array.from(set).sort()];
  }, [seriesList]);

  const availableGenres = useMemo(() => {
    const set = new Set<string>();
    for (const s of seriesList) {
      if (s.genre_group) set.add(s.genre_group);
    }
    return ['ALL', ...Array.from(set).sort()];
  }, [seriesList]);

  // If Supabase is unconfigured or returns an error, render the clear setup card
  if (!isSupabaseConfigured || dbError) {
    return (
      <DatabaseStatusCard
        type={!isSupabaseConfigured ? 'unconfigured' : 'error'}
        errorMessage={dbError}
      />
    );
  }

  // Loading state while initially fetching live database rows
  if (isLoading && seriesList.length === 0) {
    return (
      <div className="min-h-screen bg-arena-sand flex flex-col items-center justify-center p-4">
        <header className="w-full text-center mb-6">
          <h1 className="text-3xl sm:text-5xl font-serif tracking-tight font-medium text-arena-charcoal">
            TV <span className="italic text-arena-terracotta font-semibold">Arena</span>
          </h1>
          <p className="text-[10px] sm:text-xs uppercase tracking-[0.22em] text-arena-muted font-semibold mt-1">
            Global TV Engagement Intelligence
          </p>
        </header>
        <div className="inline-flex items-center gap-3 px-5 py-3 rounded-full bg-white/80 border border-arena-border shadow-sm text-arena-muted text-xs font-medium animate-pulse">
          <div className="w-4 h-4 rounded-full border-2 border-arena-border border-t-arena-terracotta animate-spin" />
          <span>Synchronizing live television metrics...</span>
        </div>
      </div>
    );
  }

  const navItems = [
    { label: 'Leaderboard', tabKey: 'leaderboard' as TabKey, path: '/' },
    { label: 'Contenders', tabKey: 'arena' as TabKey, path: '/arena' },
    { label: 'Charts', tabKey: 'charts' as TabKey, path: '/charts' },
    { label: 'Guess', tabKey: 'guess' as TabKey, path: '/guess' },
  ];

  return (
    <div className="min-h-screen bg-arena-sand flex flex-col items-center justify-start py-4 sm:py-10 px-3 sm:px-6 text-arena-charcoal">
      {/* Top Floating User Profile Header */}
      <div className="w-full max-w-4xl flex items-center justify-end mb-3 sm:mb-4 px-2">
        <UserProfileDropdown
          user={user}
          bestStreak={bestStreak}
          onSelectTab={(tab) => {
            if (tab === 'leaderboard') navigate('/');
            else navigate(`/${tab}`);
          }}
          onOpenAuth={() => setIsAuthModalOpen(true)}
          onSignOut={signOut}
          onOpenMethodology={() => setIsMethodologyOpen(true)}
          onOpenLearnToPlay={() => setIsLearnModalOpen(true)}
        />
      </div>

      {/* Shared Brand Header */}
      <header className="w-full text-center mb-5 sm:mb-8">
        <h1
          onClick={() => navigate('/')}
          className="text-3xl sm:text-5xl font-serif tracking-tight font-medium text-arena-charcoal cursor-pointer"
        >
          TV <span className="italic text-arena-terracotta font-semibold">Arena</span>
        </h1>
        <p className="text-[10px] sm:text-xs uppercase tracking-[0.22em] sm:tracking-[0.24em] text-arena-muted font-semibold mt-1 sm:mt-1.5">
          Global TV Engagement Intelligence
        </p>
      </header>

      {/* Shared Navigation Pill */}
      <nav aria-label="Main Navigation" className="mb-6 sm:mb-12">
        <div className="inline-flex items-center bg-white/85 backdrop-blur-md p-1 sm:p-1.5 rounded-full border border-arena-border shadow-nav-pill">
          {navItems.map((item) => (
            <button
              key={item.tabKey}
              onClick={() => navigate(item.path)}
              className={`px-3 sm:px-6 py-1.5 sm:py-2 text-[11px] sm:text-xs font-semibold tracking-wider uppercase rounded-full transition-all duration-200 cursor-pointer ${
                activeTab === item.tabKey
                  ? 'text-white bg-arena-terracotta shadow-pill'
                  : 'text-arena-muted hover:text-arena-charcoal'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Code-Split Route Views */}
      <Suspense fallback={<RouteLoadingFallback />}>
        <Routes>
          <Route
            path="/"
            element={
              <LeaderboardRouteWrapper
                seriesList={seriesList}
                platformFilter={platformFilter}
                genreFilter={genreFilter}
                availablePlatforms={availablePlatforms}
                availableGenres={availableGenres}
                setPlatformFilter={setPlatformFilter}
                setGenreFilter={setGenreFilter}
              />
            }
          />
          <Route
            path="/arena"
            element={<ArenaRouteWrapper seriesList={seriesList} />}
          />
          <Route
            path="/arena/:a/:b"
            element={<ArenaRouteWrapper seriesList={seriesList} />}
          />
          <Route
            path="/charts"
            element={<ChartsRouteWrapper seriesList={seriesList} />}
          />
          <Route
            path="/charts/:slug"
            element={<ChartsRouteWrapper seriesList={seriesList} />}
          />
          <Route
            path="/guess"
            element={
              <GuessRouteWrapper
                seriesList={seriesList}
                isDaily={false}
                onOpenLearnToPlay={() => setIsLearnModalOpen(true)}
              />
            }
          />
          <Route
            path="/guess/daily"
            element={
              <GuessRouteWrapper
                seriesList={seriesList}
                isDaily={true}
                onOpenLearnToPlay={() => setIsLearnModalOpen(true)}
              />
            }
          />
          <Route
            path="/show/:slug"
            element={<ShowDetailView seriesList={seriesList} />}
          />
          <Route path="*" element={<NotFoundView />} />
        </Routes>
      </Suspense>

      {/* Shared Trending Battles Footer */}
      <footer className="mt-8 sm:mt-10 flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 text-xs text-arena-muted">
        <span className="text-[10px] sm:text-[11px] uppercase tracking-wider font-semibold">
          Trending Battles:
        </span>
        <button
          onClick={() => navigate('/arena/the-last-of-us/fallout')}
          className="px-2.5 sm:px-3.5 py-1 sm:py-1.5 bg-white/70 hover:bg-white rounded-full border border-arena-border transition-colors text-[11px] sm:text-xs cursor-pointer"
        >
          The Last of Us vs Fallout
        </button>
        <button
          onClick={() => navigate('/arena/succession/the-bear')}
          className="px-2.5 sm:px-3.5 py-1 sm:py-1.5 bg-white/70 hover:bg-white rounded-full border border-arena-border transition-colors text-[11px] sm:text-xs cursor-pointer"
        >
          Succession vs The Bear
        </button>
        <button
          onClick={() => navigate('/arena/severance/silo')}
          className="px-2.5 sm:px-3.5 py-1 sm:py-1.5 bg-white/70 hover:bg-white rounded-full border border-arena-border transition-colors text-[11px] sm:text-xs cursor-pointer"
        >
          Severance vs Silo
        </button>
      </footer>

      {/* Minimalist Learn to Play Button positioned below Trending Battles as requested */}
      <div className="mt-2.5 sm:mt-3 flex items-center justify-center">
        <button
          type="button"
          onClick={() => setIsLearnModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-white/75 hover:bg-white border border-stone-200/90 hover:border-stone-300 text-stone-600 hover:text-stone-900 text-[11px] sm:text-xs font-medium tracking-wide shadow-sm transition-all duration-150 cursor-pointer hover:shadow"
        >
          <svg className="w-3.5 h-3.5 text-arena-terracotta" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-4m0-4h.01" />
          </svg>
          <span>Learn to Play</span>
        </button>
      </div>

      <Suspense fallback={null}>
        {isAuthModalOpen && (
          <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
        )}
        {isMethodologyOpen && (
          <MethodologyModal
            isOpen={isMethodologyOpen}
            onClose={() => setIsMethodologyOpen(false)}
          />
        )}
        {isLearnModalOpen && (
          <LearnToPlayModal
            isOpen={isLearnModalOpen}
            onClose={() => setIsLearnModalOpen(false)}
          />
        )}
      </Suspense>
    </div>
  );
}
