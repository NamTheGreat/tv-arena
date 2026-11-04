import { describe, expect, it, vi } from 'vitest';
import { fetchArenaSnapshot } from '../lib/snapshot';

const validSnapshot = {
  generated_at: '2026-11-05T00:00:00.000Z',
  series: [{
    id: 'series-1',
    tmdb_id: 1,
    slug: 'show-one',
    title: 'Show One',
    network: 'Network One',
    genre_group: 'Drama',
    release_years: '2024–2025',
    chart_color: '#ffffff',
    wiki_slug: 'Show_One',
    reddit_query: 'Show One',
    buzz_score: 125,
    delta_pct: 25,
    updated_at: null,
    daily_series: [100, 125],
    daily_dates: ['2026-11-03', '2026-11-04'],
  }],
};

describe('static arena snapshot', () => {
  it('loads validated leaderboard and history without a Supabase client', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(validSnapshot), { status: 200 }));

    await expect(fetchArenaSnapshot(fetcher)).resolves.toEqual(validSnapshot);
    expect(fetcher).toHaveBeenCalledWith('/snapshot.json', { cache: 'no-store' });
  });

  it('falls back when the snapshot is absent, invalid, or unreachable', async () => {
    const invalid = vi.fn().mockResolvedValue(new Response(JSON.stringify({ series: [{}] }), { status: 200 }));
    const unavailable = vi.fn().mockRejectedValue(new Error('offline'));

    await expect(fetchArenaSnapshot(invalid)).resolves.toBeNull();
    await expect(fetchArenaSnapshot(unavailable)).resolves.toBeNull();
  });
});
