import { describe, it, expect } from 'vitest';
import { formatRelativeTime, getNext0200UtcCountdown } from '../components/DatabaseStatusCard';

describe('DatabaseStatusCard & Operational Health helpers', () => {
  describe('formatRelativeTime', () => {
    it('returns "never" for missing timestamp', () => {
      expect(formatRelativeTime(null)).toBe('never');
      expect(formatRelativeTime(undefined)).toBe('never');
    });

    it('returns "just now" for timestamps within the last minute', () => {
      const now = new Date().toISOString();
      expect(formatRelativeTime(now)).toBe('just now');
    });

    it('formats minutes ago', () => {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      expect(formatRelativeTime(tenMinutesAgo)).toBe('10m ago');
    });

    it('formats hours ago', () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
      expect(formatRelativeTime(threeHoursAgo)).toBe('3h ago');
    });

    it('formats days ago', () => {
      const twoDaysAgo = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
      expect(formatRelativeTime(twoDaysAgo)).toBe('2d ago');
    });
  });

  describe('getNext0200UtcCountdown', () => {
    it('returns a formatted countdown string matching Xh Ym', () => {
      const countdown = getNext0200UtcCountdown();
      expect(countdown).toMatch(/^\d+h \d+m$/);
    });
  });
});
