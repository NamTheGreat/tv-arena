import { describe, it, expect } from 'vitest';
import {
  getDailySeed,
  generateDailyMatchupIndices,
  getTodayDateString,
  getDailyChallengeNumber,
  readStoredDailyResult,
  storeDailyResult,
} from '../lib/dailyChallenge';

describe('dailyChallenge helpers', () => {
  it('returns valid YYYY-MM-DD for getTodayDateString', () => {
    const today = getTodayDateString();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('produces deterministic seed for identical dates', () => {
    const seed1 = getDailySeed('2026-10-23');
    const seed2 = getDailySeed('2026-10-23');
    const seedOther = getDailySeed('2026-10-24');

    expect(seed1).toBe(seed2);
    expect(seed1).not.toBe(seedOther);
  });

  it('generates requested total rounds without consecutive duplicate matchup indices', () => {
    const indices = generateDailyMatchupIndices(12, 10);
    // 10 rounds needs 11 shows (known + 10 challengers)
    expect(indices.length).toBe(11);

    for (let i = 0; i < indices.length - 1; i++) {
      expect(indices[i]).not.toBe(indices[i + 1]);
      expect(indices[i]).toBeGreaterThanOrEqual(0);
      expect(indices[i]).toBeLessThan(12);
    }
  });

  it('calculates correct daily challenge number since launch', () => {
    expect(getDailyChallengeNumber('2026-10-15')).toBe(1);
    expect(getDailyChallengeNumber('2026-10-16')).toBe(2);
    expect(getDailyChallengeNumber('2026-10-23')).toBe(9);
    // Dates prior to launch are floored at 1
    expect(getDailyChallengeNumber('2026-10-01')).toBe(1);
  });

  it('persists a completed anonymous result under its UTC date', () => {
    const result = {
      date: '2026-11-04',
      score: 7,
      correctness: [true, true, false, true, true, true, false, true, false, true],
      completedAt: '2026-11-04T12:00:00.000Z',
      verified: false,
    };
    storeDailyResult(result);
    expect(readStoredDailyResult(result.date)).toEqual(result);
    expect(readStoredDailyResult('2026-11-05')).toBeNull();
  });

  it('treats the legacy numeric completion key as already played', () => {
    localStorage.setItem('tv_arena_daily_2026-11-04', '6');
    expect(readStoredDailyResult('2026-11-04')).toMatchObject({
      date: '2026-11-04',
      score: 6,
      verified: false,
    });
  });

});
