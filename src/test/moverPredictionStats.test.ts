import { describe, expect, it } from 'vitest';
import { summarizeMoverPredictions } from '../lib/moverPredictionStats';

describe('weekly mover prediction profile stats', () => {
  it('counts graded top-three picks and earned points, excluding pending picks', () => {
    expect(summarizeMoverPredictions([
      { points: 3 },
      { points: 1 },
      { points: 0 },
      { points: null },
    ])).toEqual({ graded: 3, topThree: 2, points: 4 });
  });
});
