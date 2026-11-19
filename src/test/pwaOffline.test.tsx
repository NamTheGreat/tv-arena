import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { isSnapshot, fetchArenaSnapshot } from '../lib/snapshot';
import { submitDailyScore } from '../lib/dailyChallenge';
import { OfflineBanner } from '../components/OfflineBanner';
import { SeriesItem } from '../lib/supabase';

function makeValidSeries(id: string): SeriesItem {
  return {
    id,
    tmdb_id: 101,
    slug: id,
    title: id.toUpperCase(),
    network: 'Netflix',
    network_group: 'Netflix',
    genre_group: 'Drama',
    release_years: '2023–present',
    chart_color: '#C66A3D',
    wiki_slug: id,
    reddit_query: id,
    buzz_score: 50000,
    current_7d_score: 50000,
    previous_7d_score: 40000,
    rank: 1,
    delta_pct: 25.0,
    updated_at: '2026-11-17T00:00:00Z',
    events: [],
    is_breakout: false,
    daily_series: [50000],
    daily_dates: ['2026-11-17'],
  };
}

describe('Offline Snapshot Validation & Startup Fallback', () => {
  it('accepts valid cached snapshots when offline even if beyond 36-hour window', () => {
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const snapshot = {
      generated_at: fortyEightHoursAgo,
      series: [makeValidSeries('severance')],
    };

    // When online, 48 hours is considered stale
    expect(isSnapshot(snapshot, Date.now(), false)).toBe(false);

    // When offline, last valid snapshot is readable with honest indicator
    expect(isSnapshot(snapshot, Date.now(), true)).toBe(true);
  });

  it('rejects corrupted or structurally invalid snapshots regardless of offline mode', () => {
    // Missing required fields
    const corruptedSnapshot = {
      generated_at: new Date().toISOString(),
      series: [{ title: 'Incomplete Show' }],
    };
    expect(isSnapshot(corruptedSnapshot, Date.now(), true)).toBe(false);

    // Future timestamp
    const futureSnapshot = {
      generated_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      series: [makeValidSeries('future-show')],
    };
    expect(isSnapshot(futureSnapshot, Date.now(), true)).toBe(false);
  });

  it('fetches offline snapshot cleanly using fetchArenaSnapshot', async () => {
    const mockSnapshot = {
      generated_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      series: [makeValidSeries('silo')],
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockSnapshot,
    }) as unknown as typeof fetch;

    const result = await fetchArenaSnapshot(mockFetch, Date.now(), true);
    expect(result).not.toBeNull();
    expect(result?.series[0].id).toBe('silo');
  });
});

describe('Offline Honest UI & Mutation Guards', () => {
  let originalOnLine: boolean;

  beforeEach(() => {
    originalOnLine = navigator.onLine;
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', {
      value: originalOnLine,
      configurable: true,
    });
  });

  it('renders OfflineBanner when offline with snapshot generation time', () => {
    const sampleDate = '2026-11-17T01:00:00Z';
    render(<OfflineBanner isOnline={false} snapshotTime={sampleDate} />);

    expect(screen.getByTestId('offline-banner')).toBeInTheDocument();
    expect(screen.getByText(/Offline Mode/i)).toBeInTheDocument();
    expect(screen.getByText(/Displaying cached snapshot from/i)).toBeInTheDocument();
    expect(screen.getByText(/Score submissions, watchlist edits, and live updates are disabled/i)).toBeInTheDocument();
  });

  it('does not render OfflineBanner when online', () => {
    const { container } = render(<OfflineBanner isOnline={true} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('rejects daily score submissions when offline without pretending to save', async () => {
    Object.defineProperty(navigator, 'onLine', {
      value: false,
      configurable: true,
    });

    const result = await submitDailyScore('2026-11-17', ['higher', 'lower']);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('You are offline');
    }
  });
});
