// ponytail: fluid card transitions and native canvas FX; zero heavy animation libraries
import React, { useEffect, useState } from 'react';
import { SeriesItem } from '../lib/supabase';
import { useCountUp } from '../lib/useCountUp';
import { triggerMilestoneConfetti } from '../lib/confetti';
import { GameOverModal } from './GameOverModal';

interface TriviaGameProps {
  knownShow: SeriesItem | null;
  challengerShow: SeriesItem | null;
  knownScore: number;
  challengerScore: number;
  streak: number;
  bestStreak: number;
  revealed: boolean;
  lastGuessCorrect: boolean | null;
  onMakeGuess: (choice: 'higher' | 'lower') => void;
  onNextRound: () => void;
}

export function TriviaGame({
  knownShow,
  challengerShow,
  knownScore,
  challengerScore,
  streak,
  bestStreak,
  revealed,
  lastGuessCorrect,
  onMakeGuess,
  onNextRound,
}: TriviaGameProps) {
  const displayedScore = useCountUp(challengerScore, 900, revealed);
  const [isSliding, setIsSliding] = useState(false);
  const [isGameOverModalOpen, setIsGameOverModalOpen] = useState(false);
  const [guessHistory, setGuessHistory] = useState<boolean[]>([]);

  // Trigger milestone confetti on streak multiples of 5
  useEffect(() => {
    if (streak > 0 && streak % 5 === 0 && lastGuessCorrect) {
      triggerMilestoneConfetti();
    }
  }, [streak, lastGuessCorrect]);

  // Track guess history and handle game over
  useEffect(() => {
    if (revealed && lastGuessCorrect !== null) {
      setGuessHistory((prev) => [...prev, lastGuessCorrect]);

      if (lastGuessCorrect) {
        // Auto-advance with slide transition after count-up settles
        const timer = setTimeout(() => {
          setIsSliding(true);
          setTimeout(() => {
            onNextRound();
            setIsSliding(false);
          }, 350);
        }, 1300);
        return () => clearTimeout(timer);
      } else {
        // Show Game Over modal on strike
        const timer = setTimeout(() => {
          setIsGameOverModalOpen(true);
        }, 1100);
        return () => clearTimeout(timer);
      }
    }
  }, [revealed, lastGuessCorrect]);

  const handlePlayAgain = () => {
    setIsGameOverModalOpen(false);
    setGuessHistory([]);
    onNextRound();
  };

  return (
    <main className="w-full max-w-3xl mx-auto py-2 sm:py-4 overflow-hidden">
      {/* Streak Header */}
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
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold transition-colors ${
                  revealed
                    ? lastGuessCorrect
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-rose-100 text-rose-800'
                    : 'bg-amber-50 text-amber-700'
                }`}
              >
                {revealed ? (lastGuessCorrect ? '✓ Correct' : '✕ Strike') : 'Guess Now'}
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
                  onClick={() => onMakeGuess('higher')}
                  className="flex-1 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl bg-arena-terracotta text-white text-xs font-semibold uppercase tracking-wider hover:bg-arena-terracottaHover transition-transform active:scale-95"
                >
                  ▲ Higher
                </button>
                <button
                  type="button"
                  onClick={() => onMakeGuess('lower')}
                  className="flex-1 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl bg-stone-200 text-stone-800 text-xs font-semibold uppercase tracking-wider hover:bg-stone-300 transition-transform active:scale-95"
                >
                  ▼ Lower
                </button>
              </div>
            )}
          </div>
        </article>
      </div>

      {/* Manual Controls & Feedback */}
      <div className="mt-6 sm:mt-8 flex flex-col items-center">
        {revealed && (
          <button
            type="button"
            onClick={onNextRound}
            className="inline-flex items-center justify-center px-8 sm:px-10 py-2.5 sm:py-3 rounded-full bg-arena-terracotta text-white font-medium text-xs sm:text-sm tracking-widest uppercase shadow-pill hover:bg-arena-terracottaHover transition-all"
          >
            <span>Next</span>
            <span className="ml-2">→</span>
          </button>
        )}

        {revealed && (
          <div
            className={`mt-3 sm:mt-4 text-xs sm:text-[13px] font-medium ${
              lastGuessCorrect ? 'text-emerald-600' : 'text-rose-600'
            }`}
          >
            {lastGuessCorrect ? 'Correct!' : 'Wrong.'} {challengerShow?.title} drew{' '}
            {challengerScore.toLocaleString()} engagement.
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-center">
        <button
          type="button"
          onClick={onNextRound}
          className="px-4 py-1.5 rounded-full bg-white/70 hover:bg-white border border-stone-200 text-stone-600 text-[11px] sm:text-xs transition-colors"
        >
          Skip Show
        </button>
      </div>

      {/* Wordle-Style Game Over Modal */}
      <GameOverModal
        isOpen={isGameOverModalOpen}
        streak={streak}
        bestStreak={bestStreak}
        knownTitle={knownShow?.title || 'Unknown'}
        challengerTitle={challengerShow?.title || 'Unknown'}
        guessHistory={guessHistory}
        onPlayAgain={handlePlayAgain}
        onClose={() => setIsGameOverModalOpen(false)}
      />
    </main>
  );
}
