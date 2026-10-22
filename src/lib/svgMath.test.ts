import { describe, it, expect } from 'vitest';
import { calculateEventX } from './svgMath';

describe('calculateEventX', () => {
  const startDate = '2026-10-01';
  const endDate = '2026-10-11'; // 10 days span

  it('maps startDate to exact X_START on desktop and mobile', () => {
    expect(calculateEventX(startDate, startDate, endDate, false)).toBe(85);
    expect(calculateEventX(startDate, startDate, endDate, true)).toBe(35);
  });

  it('maps endDate to exact max X coordinate on desktop and mobile', () => {
    expect(calculateEventX(endDate, startDate, endDate, false)).toBe(955);
    expect(calculateEventX(endDate, startDate, endDate, true)).toBe(329);
  });

  it('maps midpoint date accurately', () => {
    const midDate = '2026-10-06'; // exactly 5 days in (50%)
    expect(calculateEventX(midDate, startDate, endDate, false)).toBe(85 + 435); // 520
    expect(calculateEventX(midDate, startDate, endDate, true)).toBe(35 + 147); // 182
  });

  it('returns null when event is before startDate (outside chart window)', () => {
    expect(calculateEventX('2026-09-30', startDate, endDate, false)).toBeNull();
  });

  it('returns null when event is after endDate (outside chart window)', () => {
    expect(calculateEventX('2026-10-12', startDate, endDate, false)).toBeNull();
  });

  it('returns null for invalid dates or inverted window', () => {
    expect(calculateEventX('invalid-date', startDate, endDate)).toBeNull();
    expect(calculateEventX(startDate, endDate, startDate)).toBeNull();
  });
});
