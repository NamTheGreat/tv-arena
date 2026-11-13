// ponytail: self-contained game modes, database-driven daily challenges, verified server scores, and leaderboard panels
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SeriesItem } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useCountUp } from '../lib/useCountUp';
import { triggerMilestoneConfetti } from '../lib/confetti';
import {
  fetchDailyDeck,
  fetchMyDailyScore,
  fetchDailyLeaderboard,
  fetchStreakLeaderboard,
  getTodayDateString,
  isCorrectDailyAnswer,
  LeaderboardEntry,
  submitDailyScore,
  readStoredDailyResult,
  storeDailyResult,
  StoredDailyResult,
} from '../lib/dailyChallenge';
import { GameOverModal } from './GameOverModal';
import { DailyResultCard } from './DailyResultCard';
import { drawNextEndlessIndex, shuffledIndexes } from '../lib/endlessGame';
import { useDailyChallenge } from '../lib/useDailyChallenge';
import { useEndlessGame } from '../lib/useEndlessGame';
import { useTriviaGameState } from '../lib/triviaGameState';

type GameMode = 'endless' | 'daily';
type DeckFilter = 'all' | 'streaming' | 'classics' | 'scifi';

interface TriviaGameProps {
  seriesList: SeriesItem[];
  onViewLeaderboard?: () => void;
  onOpenAuth?: () => void;
  onOpenLearnToPlay?: () => void;
}

export function TriviaGame({
  seriesList,
  onViewLeaderboard,
  onOpenAuth,
  onOpenLearnToPlay,
}: TriviaGameProps) {
  const { user, loading: authLoading } = useAuth();
  const [gameMode, setGameMode] = useState<GameMode>('endless');
  const [deckFilter, setDeckFilter] = useState<DeckFilter>('all');
  const [dailySubView, setDailySubView] = useState<'play' | 'leaderboard'>('play');
  const [leaderboardTab, setLeaderboardTab] = useState<'daily' | 'streak'>('daily');
  const { todayStr, setTodayStr, challengeNumber, dailyRunDateRef } = useDailyChallenge(gameMode === 'daily');

  // Daily Challenge state
  const [dailyDeckIds, setDailyDeckIds] = useState<string[] | null>(null);
  const [isLoadingDailyDeck, setIsLoadingDailyDeck] = useState(true);
  const [dailyDeckError, setDailyDeckError] = useState(false);
  const [isSubmittingScore, setIsSubmittingScore] = useState(false);
  const [dailyResult, setDailyResult] = useState<StoredDailyResult | null>(null);
  const [dailySubmissionError, setDailySubmissionError] = useState<string | null>(null);
  const [retryDailyAnswers, setRetryDailyAnswers] = useState<('higher' | 'lower')[] | null>(null);
  const [isCheckingDailyResult, setIsCheckingDailyResult] = useState(true);
  const [dailyStatusUnavailable, setDailyStatusUnavailable] = useState(false);
  const [dailyStartBlocked, setDailyStartBlocked] = useState(false);
  const [dailyCheckAttempt, setDailyCheckAttempt] = useState(0);
  const deckDateRef = useRef<string>(todayStr);
  const dailyFinishedRef = useRef(false);
  const dailySubmissionInFlightRef = useRef(false);
  const dailyTransferAttemptRef = useRef<string | null>(null);
  const dailyAutoAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dailySlideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dailyFinishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gameOverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tabIdRef = useRef(`${Date.now()}-${Math.random()}`);
  const clearGameTimers = () => {
    if (dailyAutoAdvanceTimerRef.current) clearTimeout(dailyAutoAdvanceTimerRef.current);
    if (dailySlideTimerRef.current) clearTimeout(dailySlideTimerRef.current);
    if (dailyFinishTimerRef.current) clearTimeout(dailyFinishTimerRef.current);
    if (gameOverTimerRef.current) clearTimeout(gameOverTimerRef.current);
    dailyAutoAdvanceTimerRef.current = null;
    dailySlideTimerRef.current = null;
    dailyFinishTimerRef.current = null;
    gameOverTimerRef.current = null;
  };

  useEffect(() => () => {
    clearGameTimers();
  }, []);

  // Leaderboard data
  const [dailyLeaderboardData, setDailyLeaderboardData] = useState<LeaderboardEntry[]>([]);
  const [streakLeaderboardData, setStreakLeaderboardData] = useState<LeaderboardEntry[]>([]);
  const [isLoadingLeaderboard, setIsLoadingLeaderboard] = useState(false);

  // Load daily challenge deck from Supabase
  useEffect(() => {
    dailyFinishedRef.current = false;
    setDailyResult(null);
  }, [todayStr]);

  const dailyLockKey = `tv_arena_daily_active_${todayStr}`;
  const releaseDailyTabLock = () => {
    try {
      const active = JSON.parse(localStorage.getItem(dailyLockKey) || 'null') as
        | { owner?: string }
        | null;
      if (active?.owner === tabIdRef.current) localStorage.removeItem(dailyLockKey);
    } catch {
      localStorage.removeItem(dailyLockKey);
    }
  };

  const startDailyGame = () => {
    clearGameTimers();
    const currentDate = getTodayDateString();
    dailyRunDateRef.current = currentDate;
    if (currentDate !== todayStr) {
      setTodayStr(currentDate);
      setDailyResult(null);
    }
    setDailyStartBlocked(false);
    if (!user && !authLoading) {
      const storedResult = readStoredDailyResult(currentDate);
      if (storedResult) {
        setDailyResult(storedResult);
        setGameMode('daily');
        return;
      }
      try {
        const lockKey = `tv_arena_daily_active_${currentDate}`;
        const active = JSON.parse(localStorage.getItem(lockKey) || 'null') as
          | { owner?: string; expiresAt?: number }
          | null;
        if (active?.owner !== tabIdRef.current && (active?.expiresAt || 0) > Date.now()) {
          setDailyStartBlocked(true);
          setGameMode('daily');
          return;
        }
        localStorage.setItem(
          lockKey,
          JSON.stringify({ owner: tabIdRef.current, expiresAt: Date.now() + 2 * 60 * 60 * 1000 })
        );
        const confirmed = JSON.parse(localStorage.getItem(lockKey) || 'null') as
          | { owner?: string }
          | null;
        if (confirmed?.owner !== tabIdRef.current) setDailyStartBlocked(true);
      } catch {
        // Completion is still persisted after play, even if active-tab locking is unavailable.
      }
    }
    setGameMode('daily');
  };

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === `tv_arena_daily_${todayStr}`) {
        const result = readStoredDailyResult(todayStr);
        if (result) setDailyResult(result);
      }
    };
    const releaseOnClose = () => releaseDailyTabLock();
    window.addEventListener('storage', handleStorage);
    window.addEventListener('beforeunload', releaseOnClose);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('beforeunload', releaseOnClose);
      releaseDailyTabLock();
    };
  }, [todayStr]);

  useEffect(() => {
    let active = true;
    async function checkPlayed() {
      if (authLoading) return;
      setIsCheckingDailyResult(true);
      setDailyStatusUnavailable(false);
      const localResult = readStoredDailyResult(todayStr);
      if (!user) {
        if (active) setDailyResult(localResult);
        if (active) setIsCheckingDailyResult(false);
        return;
      }

      const serverResult = await fetchMyDailyScore(todayStr);
      if (active) {
        if (serverResult.unavailable) {
          setDailyStatusUnavailable(true);
        } else if (serverResult.score !== null) {
          const result = localResult ?? {
            date: todayStr,
            score: serverResult.score,
            correctness: [],
            completedAt: new Date().toISOString(),
            verified: true,
          };
          setDailyResult({ ...result, score: serverResult.score, verified: true });
        } else {
          setDailyResult(localResult);
        }
        setIsCheckingDailyResult(false);
      }
    }
    checkPlayed();
    return () => {
      active = false;
    };
  }, [authLoading, dailyCheckAttempt, todayStr, user]);

  useEffect(() => {
    let active = true;
    async function loadDeck() {
      setIsLoadingDailyDeck(true);
      setDailyDeckError(false);
      setDailyDeckIds(null);
      try {
        const deck = await fetchDailyDeck(todayStr);
        if (active) {
          if (deck && deck.length >= 2) {
            deckDateRef.current = todayStr;
            setDailyDeckIds(deck);
          } else {
            setDailyDeckIds(null);
            setDailyDeckError(true);
          }
          setIsLoadingDailyDeck(false);
        }
      } catch {
        if (active) {
          setDailyDeckIds(null);
          setDailyDeckError(true);
          setIsLoadingDailyDeck(false);
        }
      }
    }
    loadDeck();
    return () => {
      active = false;
    };
  }, [todayStr]);

  // Load leaderboards when switching to leaderboard sub-view
  useEffect(() => {
    if (dailySubView !== 'leaderboard') return;
    let active = true;
    async function loadLeaderboards() {
      setIsLoadingLeaderboard(true);
      try {
        const [daily, streak] = await Promise.all([
          fetchDailyLeaderboard(todayStr),
          fetchStreakLeaderboard(),
        ]);
        if (active) {
          setDailyLeaderboardData(daily);
          setStreakLeaderboardData(streak);
          setIsLoadingLeaderboard(false);
        }
      } catch {
        if (active) {
          setIsLoadingLeaderboard(false);
        }
      }
    }
    loadLeaderboards();
    return () => {
      active = false;
    };
  }, [dailySubView, todayStr]);

  // Filtered deck for endless mode
  const endlessDeck = useEndlessGame(seriesList, deckFilter);

  // Daily deck resolved from daily_challenges table
  const dailyDeckShows = useMemo(() => {
    if (!dailyDeckIds || dailyDeckIds.length < 2) return [];
    return dailyDeckIds
      .map((id) => seriesList.find((s) => s.id === id))
      .filter((s): s is SeriesItem => Boolean(s));
  }, [dailyDeckIds, seriesList]);

  // Active deck based on game mode
  const activeDeck = gameMode === 'daily' ? dailyDeckShows : endlessDeck;

  // Game state
  const [game, dispatchGame] = useTriviaGameState(Number(localStorage.getItem('tv_arena_best_streak') || 0));
  const {
    dailyRound, dailyScore, knownIdx, challengerIdx, endlessBag, streak, recordedFinalStreak,
    bestStreak, revealed, lastGuessCorrect, guessHistory, userAnswers, isSliding, isGameOverModalOpen,
  } = game;

  // Initialize or reset indices when deck changes
  useEffect(() => {
    if (activeDeck.length >= 2) {
      if (gameMode === 'daily') {
        dispatchGame({ type: 'initialize-daily' });
      } else {
        const bag = shuffledIndexes(activeDeck.length);
        dispatchGame({ type: 'initialize-endless', knownIdx: bag[0], challengerIdx: bag[1], endlessBag: bag.slice(2) });
      }
    }
  }, [deckFilter, gameMode, activeDeck, todayStr]);

  // Current shows
  const knownShow = activeDeck[knownIdx % Math.max(1, activeDeck.length)] || null;
  const challengerShow = activeDeck[challengerIdx % Math.max(1, activeDeck.length)] || null;
  const knownScore = knownShow?.buzz_score || 0;
  const challengerScore = challengerShow?.buzz_score || 0;

  // Nailbiter difficulty multiplier (within 8% gap)
  const isNailbiter = useMemo(() => {
    if (knownScore <= 0 || challengerScore <= 0) return false;
    const diff = Math.abs(challengerScore - knownScore);
    const maxVal = Math.max(knownScore, challengerScore);
    return diff / maxVal <= 0.08;
  }, [knownScore, challengerScore]);

  // Count-up suspense hook
  const displayedScore = useCountUp(challengerScore, 900, revealed);

  // Confetti on milestone streaks
  useEffect(() => {
    if (streak > 0 && streak % 5 === 0 && lastGuessCorrect) {
      triggerMilestoneConfetti();
    }
  }, [streak, lastGuessCorrect]);

  const submitCompletedDailyRun = async (
    result: StoredDailyResult,
    completedAnswers: ('higher' | 'lower')[]
  ) => {
    if (dailySubmissionInFlightRef.current) return;
    dailySubmissionInFlightRef.current = true;
    setIsSubmittingScore(true);
    setDailySubmissionError(null);
    setRetryDailyAnswers(completedAnswers);
    const submission = await submitDailyScore(result.date, completedAnswers);
    if (submission.success) {
      dispatchGame({ type: 'server-score', score: submission.score });
      const verifiedResult = { ...result, score: submission.score, verified: true };
      storeDailyResult(verifiedResult);
      setDailyResult(verifiedResult);
      setRetryDailyAnswers(null);
      setIsSubmittingScore(false);
      dailySubmissionInFlightRef.current = false;
      return;
    }

    // A rejected retry may mean an earlier request succeeded. Read the user's
    // own RLS-protected row before asking them to retry.
    const serverResult = await fetchMyDailyScore(result.date);
    if (serverResult.score !== null) {
      const verifiedResult = { ...result, score: serverResult.score, verified: true };
      storeDailyResult(verifiedResult);
      setDailyResult(verifiedResult);
      setRetryDailyAnswers(null);
      setDailySubmissionError(null);
    } else if (serverResult.unavailable) {
      setDailySubmissionError("We couldn't verify whether your score was saved. Please retry.");
    } else if (/already submitted/i.test(submission.error)) {
      setDailySubmissionError("Your score was already submitted, but we couldn't load it. Please retry.");
    } else if (/challenge|deck|expired/i.test(submission.error)) {
      setDailySubmissionError("The daily challenge expired before your score could be saved.");
    } else {
      setDailySubmissionError("Your score could not be saved. Please retry.");
    }
    setIsSubmittingScore(false);
    dailySubmissionInFlightRef.current = false;
  };

  useEffect(() => {
    if (
      authLoading ||
      !user ||
      isCheckingDailyResult ||
      isSubmittingScore ||
      !dailyResult ||
      dailyResult.verified ||
      !dailyResult.answers?.length ||
      dailyResult.date !== todayStr
    ) return;
    const transferAttemptKey = `${user.id}:${dailyResult.date}`;
    if (dailyTransferAttemptRef.current === transferAttemptKey) return;
    dailyTransferAttemptRef.current = transferAttemptKey;
    void submitCompletedDailyRun(dailyResult, dailyResult.answers);
  }, [authLoading, dailyResult, isCheckingDailyResult, isSubmittingScore, todayStr, user]);

  const retryDailySubmission = () => {
    if (dailyResult && retryDailyAnswers && user) {
      void submitCompletedDailyRun(dailyResult, retryDailyAnswers);
    }
  };

  const finishDailyRun = async (
    completedAnswers: ('higher' | 'lower')[],
    completedCorrectness: boolean[]
  ) => {
    if (dailyFinishedRef.current) return;
    dailyFinishedRef.current = true;
    releaseDailyTabLock();
    const challengeDate = deckDateRef.current || dailyRunDateRef.current || todayStr;
    const currentDate = getTodayDateString();
    const midnightPassed = challengeDate !== currentDate;

    const result: StoredDailyResult = {
      date: challengeDate,
      score: completedCorrectness.filter(Boolean).length,
      correctness: completedCorrectness,
      answers: completedAnswers,
      completedAt: new Date().toISOString(),
      verified: false,
    };
    storeDailyResult(result);
    setDailyResult(result);
    setDailySubmissionError(null);

    if (user && !midnightPassed) {
      await submitCompletedDailyRun(result, completedAnswers);
    }
  };

  const advanceToNextRound = () => {
    if (activeDeck.length < 2) return;
    clearGameTimers();

    if (gameMode === 'daily') {
      const nextRound = dailyRound + 1;
      if (nextRound >= 10 || nextRound + 1 >= activeDeck.length) {
        finishDailyRun(userAnswers, guessHistory);
        return;
      }
      dispatchGame({ type: 'advance-daily', round: nextRound });
    } else {
      const next = drawNextEndlessIndex(endlessBag, activeDeck.length, challengerIdx);
      if (next.index < 0) return;
      dispatchGame({ type: 'advance-endless', knownIdx: challengerIdx, challengerIdx: next.index, endlessBag: next.bag });
    }

  };

  const handleMakeGuess = (choice: 'higher' | 'lower') => {
    if (revealed || !knownShow || !challengerShow) return;

    const correct = gameMode === 'daily'
      ? isCorrectDailyAnswer(choice, knownScore, challengerScore)
      : (choice === 'higher' && challengerScore >= knownScore) ||
        (choice === 'lower' && challengerScore < knownScore);
    const pts = gameMode === 'daily' ? 1 : isNailbiter ? 2 : 1;

    const updatedCorrectness = [...guessHistory, correct];
    const updatedAnswers = [...userAnswers, choice];
    dispatchGame({ type: 'answer', correct, answer: choice, mode: gameMode, points: pts });

    if (correct && gameMode === 'endless') {
      const nextStreak = streak + pts;
      if (nextStreak > bestStreak) {
        localStorage.setItem('tv_arena_best_streak', String(nextStreak));
      }
    }

    if (correct) {
      // Check if daily run is complete on 10th round
      if (gameMode === 'daily' && dailyRound >= 9) {
        dailyFinishTimerRef.current = setTimeout(() => {
          dailyFinishTimerRef.current = null;
          finishDailyRun(updatedAnswers, updatedCorrectness);
        }, 1250);
        return;
      }

      // Auto-slide advance after count-up settles
      dailyAutoAdvanceTimerRef.current = setTimeout(() => {
        dailyAutoAdvanceTimerRef.current = null;
        dispatchGame({ type: 'sliding', value: true });
        dailySlideTimerRef.current = setTimeout(() => {
          dailySlideTimerRef.current = null;
          advanceToNextRound();
          dispatchGame({ type: 'sliding', value: false });
        }, 320);
      }, 1250);
    } else {
      if (gameMode === 'endless') {
        gameOverTimerRef.current = setTimeout(() => {
          gameOverTimerRef.current = null;
          dispatchGame({ type: 'game-over', value: true });
        }, 1100);
      } else {
        // Daily mode continues through all 10 rounds or opens modal on final round
        if (dailyRound >= 9) {
          dailyFinishTimerRef.current = setTimeout(() => {
            dailyFinishTimerRef.current = null;
            finishDailyRun(updatedAnswers, updatedCorrectness);
          }, 1100);
        }
      }
    }
  };

  const handlePlayAgain = () => {
    const bag = shuffledIndexes(activeDeck.length);
    dispatchGame({ type: 'reset' });
    dispatchGame({ type: 'initialize-endless', knownIdx: bag[0], challengerIdx: bag[1], endlessBag: bag.slice(2) });
  };

  return (
    <main className="w-full max-w-3xl mx-auto pt-2 pb-1 sm:pt-4 sm:pb-2 overflow-hidden">
      {/* Mode & Deck Filter Selector Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-5 sm:mb-6">
        {/* Game Mode Pill */}
        <div className="inline-flex items-center bg-stone-100 p-1 rounded-full text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              clearGameTimers();
              releaseDailyTabLock();
              dailyRunDateRef.current = null;
              setTodayStr(getTodayDateString());
              setGameMode('endless');
            }}
            className={`px-3.5 py-1 rounded-full transition-colors cursor-pointer ${
              gameMode === 'endless'
                ? 'bg-white text-arena-charcoal shadow-sm'
                : 'text-arena-muted hover:text-arena-charcoal'
            }`}
          >
            Endless Streak
          </button>
          <button
            type="button"
            onClick={startDailyGame}
            className={`px-3.5 py-1 rounded-full transition-colors cursor-pointer ${
              gameMode === 'daily'
                ? 'bg-white text-arena-terracotta shadow-sm font-bold'
                : 'text-arena-muted hover:text-arena-charcoal'
            }`}
          >
            Daily Run #{challengeNumber} 🎯
          </button>
        </div>

        {/* Themed Deck Filters (Only in endless mode) */}
        {gameMode === 'endless' ? (
          <div className="flex flex-wrap items-center justify-center gap-1.5 text-[11px] font-semibold text-stone-500">
            {[
              { id: 'all', label: 'All' },
              { id: 'streaming', label: 'Streaming' },
              { id: 'classics', label: 'Classics' },
              { id: 'scifi', label: 'Sci-Fi' },
            ].map((deck) => (
              <button
                key={deck.id}
                type="button"
                onClick={() => setDeckFilter(deck.id as DeckFilter)}
                className={`px-2.5 py-0.5 rounded-full border transition-colors cursor-pointer ${
                  deckFilter === deck.id
                    ? 'border-arena-terracotta bg-arena-terracotta/10 text-arena-terracotta'
                    : 'border-stone-200 hover:border-stone-300 text-stone-500'
                }`}
              >
                {deck.label}
              </button>
            ))}
          </div>
        ) : (
          /* Daily Sub-View Switcher */
          <div className="inline-flex items-center bg-stone-100 p-0.5 rounded-full text-[11px] font-semibold">
            <button
              type="button"
              onClick={() => setDailySubView('play')}
              className={`px-3 py-1 rounded-full transition-colors cursor-pointer ${
                dailySubView === 'play'
                  ? 'bg-white text-stone-900 shadow-sm'
                  : 'text-stone-500 hover:text-stone-900'
              }`}
            >
              Play Challenge
            </button>
            <button
              type="button"
              onClick={() => setDailySubView('leaderboard')}
              className={`px-3 py-1 rounded-full transition-colors cursor-pointer ${
                dailySubView === 'leaderboard'
                  ? 'bg-white text-arena-terracotta shadow-sm font-bold'
                  : 'text-stone-500 hover:text-stone-900'
              }`}
            >
              Leaderboard 🏆
            </button>
          </div>
        )}
      </div>

      {/* DAILY LEADERBOARD PANEL */}
      {gameMode === 'daily' && dailySubView === 'leaderboard' ? (
        <section className="bg-white/90 backdrop-blur-sm rounded-[28px] p-6 sm:p-8 border border-stone-200/80 shadow-soft-card">
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-stone-100">
            <div>
              <h2 className="font-serif text-xl sm:text-2xl font-semibold text-stone-900">
                Verified Leaderboards
              </h2>
              <p className="text-xs text-stone-500 mt-0.5">
                {leaderboardTab === 'daily'
                  ? `Today's Daily Challenge #${challengeNumber} (${todayStr})`
                  : 'All-Time Consecutive Daily Streaks'}
              </p>
            </div>
            <div className="inline-flex items-center bg-stone-100 p-0.5 rounded-full text-xs font-semibold">
              <button
                type="button"
                onClick={() => setLeaderboardTab('daily')}
                className={`px-3 py-1 rounded-full transition-colors cursor-pointer ${
                  leaderboardTab === 'daily'
                    ? 'bg-white text-arena-terracotta shadow-sm font-bold'
                    : 'text-stone-500 hover:text-stone-900'
                }`}
              >
                Daily
              </button>
              <button
                type="button"
                onClick={() => setLeaderboardTab('streak')}
                className={`px-3 py-1 rounded-full transition-colors cursor-pointer ${
                  leaderboardTab === 'streak'
                    ? 'bg-white text-arena-terracotta shadow-sm font-bold'
                    : 'text-stone-500 hover:text-stone-900'
                }`}
              >
                Streaks
              </button>
            </div>
          </div>

          {isLoadingLeaderboard ? (
            <div className="py-12 text-center text-sm text-stone-400">Loading verified ranks...</div>
          ) : (
            <div className="divide-y divide-stone-100">
              {((leaderboardTab === 'daily' ? dailyLeaderboardData : streakLeaderboardData) || []).length ===
              0 ? (
                <div className="py-10 text-center text-sm text-stone-500">
                  No verified scores yet for this board.{' '}
                  <button
                    type="button"
                    onClick={() => setDailySubView('play')}
                    className="text-arena-terracotta font-semibold hover:underline"
                  >
                    Be the first to play!
                  </button>
                </div>
              ) : (
                (leaderboardTab === 'daily' ? dailyLeaderboardData : streakLeaderboardData).map(
                  (entry) => (
                    <div
                      key={`${entry.username}-${entry.rank}`}
                      className="py-3 flex items-center justify-between text-sm"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`w-6 text-center font-serif font-bold text-xs ${
                            entry.rank === 1
                              ? 'text-amber-600'
                              : entry.rank === 2
                              ? 'text-stone-400'
                              : entry.rank === 3
                              ? 'text-amber-800'
                              : 'text-stone-400'
                          }`}
                        >
                          #{entry.rank}
                        </span>
                        <span className="font-medium text-stone-800">@{entry.username}</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs font-tabular">
                        <span className="text-stone-500">
                          Streak: <strong className="text-stone-800">{entry.streak}</strong>
                        </span>
                        <span className="font-semibold px-2 py-0.5 rounded-full bg-arena-terracotta/10 text-arena-terracotta">
                          {leaderboardTab === 'daily' ? `${entry.score}/10` : `${entry.score}d`}
                        </span>
                      </div>
                    </div>
                  )
                )
              )}
            </div>
          )}
        </section>
      ) : gameMode === 'daily' && dailyResult && dailySubView === 'play' ? (
        <DailyResultCard
          result={dailyResult}
          isAuthenticated={Boolean(user)}
          isSubmitting={isSubmittingScore}
          submissionError={dailySubmissionError}
          onRetry={retryDailySubmission}
          onOpenAuth={onOpenAuth}
          todayDateStr={todayStr}
          onPlayToday={() => {
            dailyRunDateRef.current = null;
            const current = getTodayDateString();
            setTodayStr(current);
            setDailyResult(null);
            setDailyStartBlocked(false);
          }}
        />
      ) : gameMode === 'daily' && isCheckingDailyResult ? (
        <div className="text-center py-12 text-sm text-arena-muted">Checking today's challenge status…</div>
      ) : gameMode === 'daily' && user && dailyStatusUnavailable ? (
        <div className="text-center py-12 text-sm text-arena-muted">
          <p>We couldn't verify whether today's challenge was already submitted.</p>
          <button type="button" onClick={() => setDailyCheckAttempt((attempt) => attempt + 1)} className="mt-3 text-arena-terracotta font-semibold">Retry verification</button>
        </div>
      ) : gameMode === 'daily' && dailyStartBlocked ? (
        <div className="text-center py-12 text-sm text-arena-muted">Today's anonymous challenge is already active in another tab. Finish it there or close that tab and try again.</div>
      ) : gameMode === 'daily' && isLoadingDailyDeck ? (
        <div className="text-center py-12 text-sm text-arena-muted">Loading today's challenge…</div>
      ) : gameMode === 'daily' && !isLoadingDailyDeck && (dailyDeckError || activeDeck.length < 2) ? (
        /* CLEAN EMPTY STATE: Today's Challenge Isn't Ready */
        <div className="w-full max-w-xl mx-auto py-12 px-6 text-center bg-white/80 backdrop-blur rounded-[28px] border border-stone-200/80 shadow-soft-card my-6">
          <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-700 mx-auto flex items-center justify-center font-serif text-xl mb-4 border border-amber-200/60">
            🎯
          </div>
          <h2 className="font-serif text-2xl text-stone-900 font-semibold mb-2">
            Today's Challenge Isn't Ready
          </h2>
          <p className="text-sm text-stone-600 leading-relaxed max-w-md mx-auto mb-6">
            {`The daily deck for ${todayStr} is being prepared. Check back shortly or test your knowledge in Endless Streak mode!`}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => {
                clearGameTimers();
                dailyRunDateRef.current = null;
                setTodayStr(getTodayDateString());
                setGameMode('endless');
              }}
              className="px-5 py-2.5 rounded-full bg-arena-terracotta hover:bg-arena-terracottaHover text-white text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer"
            >
              Play Endless Streak
            </button>
            <button
              type="button"
              onClick={() => {
                setIsLoadingDailyDeck(true);
                fetchDailyDeck(todayStr).then((deck) => {
                  if (deck && deck.length >= 2) {
                    setDailyDeckIds(deck);
                    setDailyDeckError(false);
                  }
                  setIsLoadingDailyDeck(false);
                });
              }}
              className="px-4 py-2.5 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold transition-colors cursor-pointer"
            >
              Refresh
            </button>
          </div>
        </div>
      ) : activeDeck.length < 2 ? (
        <div className="text-center py-12 text-sm text-arena-muted">
          Not enough eligible shows in this deck category. Try a different filter or come back after more data is available.
        </div>
      ) : (
        /* GAMEPLAY SECTION */
        <>
          {/* Progress / Streak Header */}
          <div className="flex items-center justify-center space-x-6 mb-5 sm:mb-7 text-xs font-medium tracking-[0.2em] uppercase text-stone-500">
            {gameMode === 'daily' ? (
              <>
                <div className="flex items-center space-x-2">
                  <span>Daily Round</span>
                  <span className="font-serif text-base text-stone-900 font-bold">
                    {dailyRound + 1} / 10
                  </span>
                </div>
                <span className="inline-block w-1 h-1 rounded-full bg-stone-300" />
                <div className="flex items-center space-x-2">
                  <span>Score</span>
                  <span className="font-serif text-base text-emerald-700 font-bold">
                    {dailyScore}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center space-x-2">
                  <span>Streak</span>
                  <span className="font-serif text-base text-stone-900 font-bold">{streak}</span>
                </div>
                <span className="inline-block w-1 h-1 rounded-full bg-stone-300" />
                <div className="flex items-center space-x-2">
                  <span>Best</span>
                  <span className="font-serif text-base text-stone-900 font-bold">{bestStreak}</span>
                </div>
              </>
            )}
          </div>

          {/* Cards Grid with fluid slide animation */}
          <div
            className={`grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 md:gap-7 items-stretch transition-transform duration-300 ease-in-out ${
              isSliding ? '-translate-x-8 opacity-40' : 'translate-x-0 opacity-100'
            }`}
          >
            {/* Left Card: KNOWN BENCHMARK */}
            <article className="bg-[#F8FAF6]/90 backdrop-blur-sm rounded-[24px] sm:rounded-[28px] p-5 sm:p-7 md:p-8 border border-stone-200/70 shadow-soft-card flex flex-col justify-between transition-all">
              <div>
                <div className="flex items-center justify-between mb-3 sm:mb-4">
                  <span className="text-[10px] tracking-[0.22em] uppercase font-bold text-stone-400">
                    Known
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-stone-100 text-stone-700">
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
                  Engagement Index
                </p>
              </div>
            </article>

            {/* Right Card: CHALLENGER */}
            <article
              className={`bg-[#F8FAF6]/90 backdrop-blur-sm rounded-[24px] sm:rounded-[28px] p-5 sm:p-7 md:p-8 border shadow-soft-card flex flex-col justify-between transition-all ${
                revealed && lastGuessCorrect === false
                  ? 'animate-shake animate-strike border-rose-300'
                  : revealed && lastGuessCorrect === true
                  ? 'border-emerald-300 bg-emerald-50/20'
                  : 'border-stone-200/70'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3 sm:mb-4">
                  <span className="text-[10px] tracking-[0.22em] uppercase font-bold text-stone-400">
                    Challenger
                  </span>
                  <div className="flex items-center gap-1.5">
                    {isNailbiter && !revealed && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20 animate-pulse">
                        ⚡ 2x Nailbiter
                      </span>
                    )}
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold transition-colors ${
                        revealed
                          ? lastGuessCorrect
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-rose-50 text-rose-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {revealed ? (lastGuessCorrect ? '✓ Correct' : '✕ Strike') : 'Guess Now'}
                    </span>
                  </div>
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
                      {displayedScore.toLocaleString()}
                    </div>
                    <p className="text-[10px] sm:text-[11px] uppercase tracking-wider text-stone-400 font-medium mt-1">
                      Engagement Index
                    </p>
                  </>
                ) : (
                  <div className="flex gap-2.5 sm:gap-3">
                    <button
                      type="button"
                      onClick={() => handleMakeGuess('higher')}
                      className="flex-1 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl bg-arena-terracotta text-white text-xs font-semibold uppercase tracking-wider hover:bg-arena-terracottaHover transition-transform active:scale-95 shadow-sm cursor-pointer"
                    >
                      ▲ Higher
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMakeGuess('lower')}
                      className="flex-1 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl bg-stone-200 text-stone-800 text-xs font-semibold uppercase tracking-wider hover:bg-stone-300 transition-transform active:scale-95 shadow-sm cursor-pointer"
                    >
                      ▼ Lower
                    </button>
                  </div>
                )}
              </div>
            </article>
          </div>

          {/* Controls & Feedback */}
          <div className="mt-6 sm:mt-8 flex flex-col items-center">
            {revealed && (
              <button
                type="button"
                onClick={advanceToNextRound}
                className="inline-flex items-center justify-center px-8 sm:px-10 py-2.5 sm:py-3 rounded-full bg-arena-terracotta text-white font-medium text-xs sm:text-sm tracking-widest uppercase shadow-pill hover:bg-arena-terracottaHover transition-all cursor-pointer"
              >
                <span>{dailyRound >= 9 ? 'Complete Run' : 'Next Round'}</span>
                <span className="ml-2">→</span>
              </button>
            )}

            {revealed && (
              <div
                role="status"
                aria-live="polite"
                aria-atomic="true"
                className={`mt-3 sm:mt-4 text-xs sm:text-[13px] font-medium ${
                  lastGuessCorrect ? 'text-emerald-600' : 'text-rose-600'
                }`}
              >
                {lastGuessCorrect ? 'Correct!' : 'Wrong.'} {challengerShow?.title} drew{' '}
                {challengerScore.toLocaleString()} engagement.
              </div>
            )}
          </div>

          {gameMode === 'endless' && <div className="mt-2.5 flex items-center justify-center">
            <button
              type="button"
              onClick={advanceToNextRound}
              className="px-4 py-1.5 rounded-full bg-white/70 hover:bg-white border border-stone-200 text-stone-600 text-[11px] sm:text-xs transition-colors cursor-pointer"
            >
              Skip Round
            </button>
          </div>}
        </>
      )}

      {/* GameOver / Completion Modal */}
      <GameOverModal
        isOpen={isGameOverModalOpen}
        mode={gameMode}
        streak={recordedFinalStreak || streak}
        bestStreak={bestStreak}
        knownTitle={knownShow?.title || 'Unknown'}
        challengerTitle={challengerShow?.title || 'Unknown'}
        knownScore={knownScore}
        challengerScore={challengerScore}
        guessHistory={guessHistory}
        onPlayAgain={handlePlayAgain}
        onClose={() => dispatchGame({ type: 'game-over', value: false })}
        onViewLeaderboard={onViewLeaderboard}
      />
    </main>
  );
}
