import { describe, expect, it } from 'vitest';
import { initialTriviaGameState, triviaGameReducer } from '../lib/triviaGameState';

describe('trivia game state transitions', () => {
  it('records daily answers and advances short-deck rounds atomically', () => {
    let state = initialTriviaGameState();
    for (let round = 0; round < 3; round += 1) {
      state = triviaGameReducer(state, {
        type: 'answer', correct: round !== 1, answer: round === 1 ? 'lower' : 'higher', mode: 'daily', points: 1,
      });
      if (round < 2) state = triviaGameReducer(state, { type: 'advance-daily', round: round + 1 });
    }

    expect(state.dailyScore).toBe(2);
    expect(state.guessHistory).toEqual([true, false, true]);
    expect(state.userAnswers).toEqual(['higher', 'lower', 'higher']);
    expect(state.dailyRound).toBe(2);
    expect(state.knownIdx).toBe(2);
    expect(state.challengerIdx).toBe(3);
  });

  it('keeps nailbiter streaks and final score transitions consistent', () => {
    let state = triviaGameReducer(initialTriviaGameState(4), {
      type: 'answer', correct: true, answer: 'higher', mode: 'endless', points: 2,
    });
    expect(state).toMatchObject({ streak: 2, recordedFinalStreak: 2, bestStreak: 4 });

    state = triviaGameReducer(state, {
      type: 'answer', correct: false, answer: 'lower', mode: 'endless', points: 1,
    });
    expect(state).toMatchObject({ streak: 0, recordedFinalStreak: 2, bestStreak: 4 });
  });

  it('accepts the server score as the final daily score', () => {
    const state = triviaGameReducer({ ...initialTriviaGameState(), dailyScore: 6 }, {
      type: 'server-score', score: 4,
    });
    expect(state.dailyScore).toBe(4);
  });
});
