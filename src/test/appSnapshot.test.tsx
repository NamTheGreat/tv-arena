import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';

vi.mock('../lib/supabase', () => ({ isSupabaseConfigured: false, supabase: null }));
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: null, signOut: vi.fn() }) }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('app snapshot fallback', () => {
  it('renders the static leaderboard when Supabase is unavailable', async () => {
    const snapshot = {
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
        current_7d_score: 125,
        previous_7d_score: 100,
        delta_pct: 25,
        rank: 1,
        updated_at: null,
        daily_series: [100, 125],
        daily_dates: ['2026-11-03', '2026-11-04'],
        events: [],
        is_breakout: false,
        breakout_reason: undefined,
      }],
    };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(snapshot), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);

    render(<MemoryRouter><App /></MemoryRouter>);

    expect(await screen.findByText('Show One')).toBeInTheDocument();
    expect(screen.getByText('125')).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledWith('/snapshot.json', { cache: 'no-store' });
  });
});
