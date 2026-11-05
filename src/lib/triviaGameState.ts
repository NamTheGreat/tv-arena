import { useReducer } from 'react';

export interface TriviaGameState {
  dailyRound: number;
  dailyScore: number;
  knownIdx: number;
  challengerIdx: number;
  endlessBag: number[];
  streak: number;
  recordedFinalStreak: number;
  bestStreak: number;
  revealed: boolean;
  lastGuessCorrect: boolean | null;
  guessHistory: boolean[];
  userAnswers: ('higher' | 'lower')[];
  isSliding: boolean;
  isGameOverModalOpen: boolean;
}

export type TriviaGameAction =
  | { type: 'initialize-daily' }
  | { type: 'initialize-endless'; knownIdx: number; challengerIdx: number; endlessBag: number[] }
  | { type: 'answer'; correct: boolean; answer: 'higher' | 'lower'; mode: 'daily' | 'endless'; points: number }
  | { type: 'server-score'; score: number }
  | { type: 'advance-daily'; round: number }
  | { type: 'advance-endless'; knownIdx: number; challengerIdx: number; endlessBag: number[] }
  | { type: 'sliding'; value: boolean }
  | { type: 'game-over'; value: boolean }
  | { type: 'reset' };

export function initialTriviaGameState(bestStreak = 0): TriviaGameState {
  return {
    dailyRound: 0,
    dailyScore: 0,
    knownIdx: 0,
    challengerIdx: 1,
    endlessBag: [],
    streak: 0,
    recordedFinalStreak: 0,
    bestStreak,
    revealed: false,
    lastGuessCorrect: null,
    guessHistory: [],
    userAnswers: [],
    isSliding: false,
    isGameOverModalOpen: false,
  };
}

export function triviaGameReducer(state: TriviaGameState, action: TriviaGameAction): TriviaGameState {
  switch (action.type) {
    case 'initialize-daily':
      return { ...state, dailyRound: 0, dailyScore: 0, knownIdx: 0, challengerIdx: 1, guessHistory: [], userAnswers: [], revealed: false, lastGuessCorrect: null, isGameOverModalOpen: false };
    case 'initialize-endless':
      return { ...state, knownIdx: action.knownIdx, challengerIdx: action.challengerIdx, endlessBag: action.endlessBag, revealed: false, lastGuessCorrect: null };
    case 'answer': {
      const nextStreak = action.correct ? state.streak + action.points : 0;
      return {
        ...state,
        revealed: true,
        lastGuessCorrect: action.correct,
        guessHistory: [...state.guessHistory, action.correct],
        userAnswers: [...state.userAnswers, action.answer],
        dailyScore: action.mode === 'daily' && action.correct ? state.dailyScore + action.points : state.dailyScore,
        streak: action.mode === 'endless' ? nextStreak : state.streak,
        recordedFinalStreak: action.mode === 'endless' && action.correct ? nextStreak : action.mode === 'endless' ? state.streak : state.recordedFinalStreak,
        bestStreak: action.mode === 'endless' && action.correct ? Math.max(state.bestStreak, nextStreak) : state.bestStreak,
      };
    }
    case 'server-score':
      return { ...state, dailyScore: action.score };
    case 'advance-daily':
      return { ...state, dailyRound: action.round, knownIdx: action.round, challengerIdx: action.round + 1, revealed: false, lastGuessCorrect: null };
    case 'advance-endless':
      return { ...state, knownIdx: action.knownIdx, challengerIdx: action.challengerIdx, endlessBag: action.endlessBag, revealed: false, lastGuessCorrect: null };
    case 'sliding':
      return { ...state, isSliding: action.value };
    case 'game-over':
      return { ...state, isGameOverModalOpen: action.value };
    case 'reset':
      return { ...initialTriviaGameState(state.bestStreak), challengerIdx: 1, isSliding: state.isSliding };
  }
}

export function useTriviaGameState(bestStreak: number) {
  return useReducer(triviaGameReducer, bestStreak, initialTriviaGameState);
}
