import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, act } from '@testing-library/react';
import nightlySyncWorkflow from '../../.github/workflows/nightly-sync.yml?raw';
import {
  formatRelativeTime,
  getNextSyncCountdown,
  getNext0200UtcCountdown,
  NIGHTLY_SYNC_UTC_HOUR,
  NIGHTLY_SYNC_SCHEDULE_TEXT,
  DatabaseStatusCard,
} from '../components/DatabaseStatusCard';

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

  describe('Sync Schedule Alignment with Nightly Workflow', () => {
    it('aligns NIGHTLY_SYNC_UTC_HOUR with .github/workflows/nightly-sync.yml cron schedule', () => {
      const cronMatch = nightlySyncWorkflow.match(/cron:\s*['"]([^'"]+)['"]/);
      expect(cronMatch).not.toBeNull();

      const cronExpression = cronMatch![1];
      const [, hourStr] = cronExpression.split(/\s+/);
      const cronHour = parseInt(hourStr, 10);

      expect(NIGHTLY_SYNC_UTC_HOUR).toBe(cronHour);
      expect(NIGHTLY_SYNC_SCHEDULE_TEXT).toBe(`Nightly at 0${cronHour}:00 UTC`);
    });
  });

  describe('getNextSyncCountdown across midnight and day boundaries', () => {
    it('calculates remaining time when current time is before sync on the same UTC day', () => {
      // 05:45:00 UTC -> 15 minutes before 06:00:00 UTC
      const date = new Date(Date.UTC(2026, 0, 15, 5, 45, 0, 0)).getTime();
      expect(getNextSyncCountdown(date, 6)).toBe('0h 15m');
    });

    it('calculates remaining time across midnight UTC', () => {
      // 23:30:00 UTC -> 6 hours 30 minutes until 06:00:00 UTC tomorrow
      const date = new Date(Date.UTC(2026, 0, 15, 23, 30, 0, 0)).getTime();
      expect(getNextSyncCountdown(date, 6)).toBe('6h 30m');
    });

    it('calculates remaining time immediately after sync hour passes', () => {
      // 06:01:00 UTC -> 23 hours 59 minutes until 06:00:00 UTC tomorrow
      const date = new Date(Date.UTC(2026, 0, 15, 6, 1, 0, 0)).getTime();
      expect(getNextSyncCountdown(date, 6)).toBe('23h 59m');
    });

    it('calculates 24h 0m when exactly on sync hour', () => {
      // 06:00:00 UTC -> 24 hours until tomorrow's run
      const date = new Date(Date.UTC(2026, 0, 15, 6, 0, 0, 0)).getTime();
      expect(getNextSyncCountdown(date, 6)).toBe('24h 0m');
    });

    it('retains backwards compatibility via getNext0200UtcCountdown alias', () => {
      const countdown = getNext0200UtcCountdown();
      expect(countdown).toMatch(/^\d+h \d+m$/);
    });
  });

  describe('Visibility and Sleep Wake Recalculation', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('recalculates countdown immediately upon tab foregrounding (visibilitychange)', () => {
      // Set initial time to 05:00:00 UTC (1h 0m remaining)
      const initialTime = new Date(Date.UTC(2026, 0, 15, 5, 0, 0, 0)).getTime();
      vi.setSystemTime(initialTime);

      render(<DatabaseStatusCard type="healthy" />);
      expect(screen.getByText('in 1h 0m')).toBeInTheDocument();
      expect(screen.getByText(NIGHTLY_SYNC_SCHEDULE_TEXT)).toBeInTheDocument();

      // Simulate tab backgrounding and 30 minutes passing without interval firing
      const laterTime = new Date(Date.UTC(2026, 0, 15, 5, 30, 0, 0)).getTime();
      vi.setSystemTime(laterTime);

      // Trigger visibility change to visible
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      });

      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });

      // Countdown should update immediately without waiting for interval
      expect(screen.getByText('in 0h 30m')).toBeInTheDocument();
    });

    it('recalculates countdown on window focus', () => {
      // Set initial time to 04:00:00 UTC (2h 0m remaining)
      const initialTime = new Date(Date.UTC(2026, 0, 15, 4, 0, 0, 0)).getTime();
      vi.setSystemTime(initialTime);

      render(<DatabaseStatusCard type="healthy" />);
      expect(screen.getByText('in 2h 0m')).toBeInTheDocument();

      // Advance time by 45 minutes
      const laterTime = new Date(Date.UTC(2026, 0, 15, 4, 45, 0, 0)).getTime();
      vi.setSystemTime(laterTime);

      act(() => {
        window.dispatchEvent(new Event('focus'));
      });

      expect(screen.getByText('in 1h 15m')).toBeInTheDocument();
    });
  });
});
