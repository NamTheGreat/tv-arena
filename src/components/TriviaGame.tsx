// ponytail: self-contained game modes, deterministic daily challenge, fluid card transitions, and nailbiter scoring
import React, { useEffect, useMemo, useState } from 'react';
import { SeriesItem } from '../lib/supabase';
import { useCountUp } from '../lib/useCountUp';
import { triggerMilestoneConfetti } from '../lib/confetti';
import { generateDailyMatchupIndices, getTodayDateString } from '../lib/dailyChallenge';
import { GameOverModal } from './GameOverModal';

type GameMode = 'endless' | 'daily';
type DeckFilter = 'all' | 'streaming' | 'classics' | 'scifi';

interface TriviaGameProps {
  seriesList: SeriesItem[];
  onViewLeaderboard?: () => void;
  onOpenLearnToPlay?: () => void;
}

export function TriviaGame({
  seriesList,
  onViewLeaderboard,
  onOpenLearnToPlay,
}: TriviaGameProps) {
  const [gameMode, setGameMode] = useState<GameMode>('endless');
  const [deckFilter, setDeckFilter] = useState<DeckFilter>('all');

  // Filtered deck of candidate shows
  const activeDeck = useMemo(() => {
    if (seriesList.length === 0) return [];
    return seriesList.filter((s) => {
      if (deckFilter === 'streaming') {
        return ['Netflix', 'Apple TV+', 'HBO', 'FX / Hulu', 'Prime Video', 'Disney+'].some((n) =>
          s.network.includes(n)
        );
      }
      if (deckFilter === 'classics') {
        const yr = parseInt(s.release_years.slice(0, 4), 10);
        return (
          (!isNaN(yr) && yr <= 2018) ||
          ['The Sopranos', 'The Wire', 'Breaking Bad', 'Mad Men', 'Friends', 'The Office'].includes(
            s.title
          )
        );
      }
      if (deckFilter === 'scifi') {
        return (
          s.genre_group.includes('Sci-Fi') ||
          s.genre_group.includes('Mystery') ||
          s.genre_group.includes('Animation')
        );
      }
      return true;
    });
  }, [seriesList, deckFilter]);

  // Daily seed matchups
  const dailyIndices = useMemo(() => {
    if (activeDeck.length < 2) return [];
    return generateDailyMatchupIndices(activeDeck.length, 10);
  }, [activeDeck.length]);

  // Game state
  const [dailyRound, setDailyRound] = useState(0); // 0 to 9
  const [dailyScore, setDailyScore] = useState(0);
  const [knownIdx, setKnownIdx] = useState(0);
  const [challengerIdx, setChallengerIdx] = useState(1);
  const [streak, setStreak] = useState(0);
  const [recordedFinalStreak, setRecordedFinalStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(() => {
    return parseInt(localStorage.getItem('tv_arena_best_streak') || '0', 10);
  });
  const [revealed, setRevealed] = useState(false);
  const [lastGuessCorrect, setLastGuessCorrect] = useState<boolean | null>(null);
  const [guessHistory, setGuessHistory] = useState<boolean[]>([]);
  const [isSliding, setIsSliding] = useState(false);
  const [isGameOverModalOpen, setIsGameOverModalOpen] = useState(false);

  // Initialize or reset indices when deck changes
  useEffect(() => {
    if (activeDeck.length >= 2) {
      if (gameMode === 'daily' && dailyIndices.length >= 2) {
        setKnownIdx(dailyIndices[0]);
        setChallengerIdx(dailyIndices[1]);
        setDailyRound(0);
        setDailyScore(0);
      } else {
        setKnownIdx(0);
        setChallengerIdx(1 % activeDeck.length);
      }
      setRevealed(false);
      setLastGuessCorrect(null);
    }
  }, [deckFilter, gameMode, activeDeck.length, dailyIndices]);

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

  const advanceToNextRound = () => {
    if (activeDeck.length < 2) return;

    if (gameMode === 'daily') {
      const nextRound = dailyRound + 1;
      if (nextRound >= 10 || nextRound + 1 >= dailyIndices.length) {
        // Daily Run Completed!
        localStorage.setItem(`tv_arena_daily_${getTodayDateString()}`, String(dailyScore));
        setIsGameOverModalOpen(true);
        return;
      }
      setDailyRound(nextRound);
      setKnownIdx(dailyIndices[nextRound]);
      setChallengerIdx(dailyIndices[nextRound + 1]);
    } else {
      // Endless mode: challenger becomes new known
      const nextKnown = challengerIdx;
      let nextChallenger = Math.floor(Math.random() * activeDeck.length);
      if (nextChallenger === nextKnown) {
        nextChallenger = (nextKnown + 1) % activeDeck.length;
      }
      setKnownIdx(nextKnown);
      setChallengerIdx(nextChallenger);
    }

    setRevealed(false);
    setLastGuessCorrect(null);
  };

  const handleMakeGuess = (choice: 'higher' | 'lower') => {
    if (revealed || !knownShow || !challengerShow) return;

    const isHigher = challengerScore >= knownScore;
    const correct = (choice === 'higher' && isHigher) || (choice === 'lower' && !isHigher);
    const pts = isNailbiter ? 2 : 1;

    setRevealed(true);
    setLastGuessCorrect(correct);
    setGuessHistory((prev) => [...prev, correct]);

    if (correct) {
      if (gameMode === 'daily') {
        setDailyScore((s) => s + pts);
      } else {
        const nextStreak = streak + pts;
        setStreak(nextStreak);
        setRecordedFinalStreak(nextStreak);
        if (nextStreak > bestStreak) {
          setBestStreak(nextStreak);
          localStorage.setItem('tv_arena_best_streak', String(nextStreak));
        }
      }

      // Auto-slide advance after count-up settles
      setTimeout(() => {
        setIsSliding(true);
        setTimeout(() => {
          advanceToNextRound();
          setIsSliding(false);
        }, 320);
      }, 1250);
    } else {
      setRecordedFinalStreak(streak);
      if (gameMode === 'endless') {
        setStreak(0);
      }
      // Show Game Over / Run Ended modal
      setTimeout(() => {
        setIsGameOverModalOpen(true);
      }, 1100);
    }
  };

  const handlePlayAgain = () => {
    setIsGameOverModalOpen(false);
    setGuessHistory([]);
    setStreak(0);
    setRecordedFinalStreak(0);
    setDailyScore(0);
    setDailyRound(0);
    if (gameMode === 'daily' && dailyIndices.length >= 2) {
      setKnownIdx(dailyIndices[0]);
      setChallengerIdx(dailyIndices[1]);
    } else {
      setKnownIdx(0);
      setChallengerIdx(1 % activeDeck.length);
    }
    setRevealed(false);
    setLastGuessCorrect(null);
  };

  if (activeDeck.length < 2) {
    return (
      <div className="text-center py-12 text-sm text-arena-muted">
        Not enough shows in this deck category. Select a different theme filter above.
      </div>
    );
  }

  return (
    <main className="w-full max-w-3xl mx-auto pt-2 pb-1 sm:pt-4 sm:pb-2 overflow-hidden">
      {/* Mode & Deck Filter Selector Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-5 sm:mb-6">
        {/* Game Mode Pill */}
        <div className="inline-flex items-center bg-stone-100 p-1 rounded-full text-xs font-semibold">
          <button
            type="button"
            onClick={() => setGameMode('endless')}
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
            onClick={() => setGameMode('daily')}
            className={`px-3.5 py-1 rounded-full transition-colors cursor-pointer ${
              gameMode === 'daily'
                ? 'bg-white text-arena-terracotta shadow-sm font-bold'
                : 'text-arena-muted hover:text-arena-charcoal'
            }`}
          >
            Daily Run 🎯
          </button>
        </div>

        {/* Themed Deck Filters */}
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
      </div>

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
              <span className="font-serif text-base text-emerald-700 font-bold">{dailyScore}</span>
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
      {revealed && (
        <div className="mt-4 flex flex-col items-center">
          <button
            type="button"
            onClick={advanceToNextRound}
            className="inline-flex items-center justify-center px-8 sm:px-10 py-2.5 sm:py-3 rounded-full bg-arena-terracotta text-white font-medium text-xs sm:text-sm tracking-widest uppercase shadow-pill hover:bg-arena-terracottaHover transition-all cursor-pointer"
          >
            <span>Next Round</span>
            <span className="ml-2">→</span>
          </button>
          <div
            className={`mt-2 text-xs sm:text-[13px] font-medium ${
              lastGuessCorrect ? 'text-emerald-600' : 'text-rose-600'
            }`}
          >
            {lastGuessCorrect ? 'Correct!' : 'Wrong.'} {challengerShow?.title} drew{' '}
            {challengerScore.toLocaleString()} engagement.
          </div>
        </div>
      )}

      <div className="mt-2.5 flex items-center justify-center">
        <button
          type="button"
          onClick={advanceToNextRound}
          className="px-4 py-1.5 rounded-full bg-white/70 hover:bg-white border border-stone-200 text-stone-600 text-[11px] sm:text-xs transition-colors cursor-pointer"
        >
          Skip Round
        </button>
      </div>

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
        onClose={() => setIsGameOverModalOpen(false)}
        onViewLeaderboard={onViewLeaderboard}
      />
    </main>
  );
}
