import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { summarizeSecondary, hasSecondarySignals, type SecondaryObservation } from '../lib/secondarySignals';

const mocks = vi.hoisted(() => ({ fetchSecondarySignals: vi.fn() }));
vi.mock('../lib/secondarySignals', async (orig) => ({
  ...(await orig<typeof import('../lib/secondarySignals')>()),
  fetchSecondarySignals: mocks.fetchSecondarySignals,
}));

import { SecondarySignals } from '../components/SecondarySignals';

const obs = (over: Partial<SecondaryObservation>): SecondaryObservation => ({
  recorded_date: '2026-11-23', social_mentions: null, imdb_rating: null, imdb_votes: null, imdb_episode: null, ...over,
});

describe('summarizeSecondary', () => {
  it('returns nothing for empty or all-null data', () => {
    expect(hasSecondarySignals(summarizeSecondary([]))).toBe(false);
    expect(hasSecondarySignals(summarizeSecondary([obs({})]))).toBe(false);
  });

  it('compares the latest mentions with the recent average and ignores gaps', () => {
    const rows = [
      obs({ recorded_date: '2026-11-23', social_mentions: 300 }),
      obs({ recorded_date: '2026-11-22', social_mentions: 100 }),
      obs({ recorded_date: '2026-11-20', social_mentions: 200 }), // 21st is a gap, not a zero
    ];
    const { mentions } = summarizeSecondary(rows);
    expect(mentions).toEqual({ latest: 300, date: '2026-11-23', previousAverage: 150, changePct: 100 });
  });

  it('handles a single observation without inventing a baseline', () => {
    const { mentions } = summarizeSecondary([obs({ social_mentions: 50 })]);
    expect(mentions).toMatchObject({ latest: 50, previousAverage: null, changePct: null });
  });

  it('builds a per-episode rating trajectory using each episode once', () => {
    const rows = [
      obs({ recorded_date: '2026-11-23', imdb_rating: 8.9, imdb_votes: 1200, imdb_episode: 'S02E03' }),
      obs({ recorded_date: '2026-11-22', imdb_rating: 8.8, imdb_episode: 'S02E03' }),
      obs({ recorded_date: '2026-11-16', imdb_rating: 8.1, imdb_episode: 'S02E02' }),
      obs({ recorded_date: '2026-11-09', imdb_rating: 7.6, imdb_episode: 'S02E01' }),
    ];
    const s = summarizeSecondary(rows);
    expect(s.rating).toMatchObject({ latest: 8.9, episode: 'S02E03', votes: 1200, previous: 8.1, previousEpisode: 'S02E02' });
    expect(s.ratingTrajectory.map((p) => [p.label, p.rating])).toEqual([['S02E01', 7.6], ['S02E02', 8.1], ['S02E03', 8.9]]);
  });
});

describe('SecondarySignals', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders mentions and rating next to the core score', async () => {
    mocks.fetchSecondarySignals.mockResolvedValue([
      obs({ recorded_date: '2026-11-23', social_mentions: 3000, imdb_rating: 8.7, imdb_votes: 2100, imdb_episode: 'S02E05' }),
      obs({ recorded_date: '2026-11-22', social_mentions: 1000 }),
    ]);
    render(<SecondarySignals seriesId="s1" />);
    expect(await screen.findByText('Secondary signals')).toBeTruthy();
    expect(screen.getByText(/X mentions on 2026-11-23/)).toBeTruthy();
    expect(screen.getByText(/\+200% vs/)).toBeTruthy();
    expect(screen.getByText(/IMDb episode rating \(S02E05\)/)).toBeTruthy();
    expect(screen.getByText('8.7')).toBeTruthy();
    expect(screen.getByText(/do not change it/)).toBeTruthy();
  });

  it('renders nothing when the show has no secondary data or the query fails', async () => {
    mocks.fetchSecondarySignals.mockResolvedValueOnce([]);
    const { container, unmount } = render(<SecondarySignals seriesId="s1" />);
    await Promise.resolve();
    expect(container.textContent).toBe('');
    unmount();
    mocks.fetchSecondarySignals.mockRejectedValueOnce(new Error('column does not exist'));
    const second = render(<SecondarySignals seriesId="s2" />);
    await Promise.resolve();
    expect(second.container.textContent).toBe('');
  });
});
