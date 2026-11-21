import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';

let mockUser: any = null;
const mockSignIn = vi.fn().mockImplementation(async () => {
  return { error: null };
});

vi.mock('../lib/supabase', () => ({ isSupabaseConfigured: false, supabase: null }));
vi.mock('../lib/auth', () => ({
  useAuth: () => ({
    user: mockUser,
    signIn: mockSignIn,
    signUp: vi.fn(),
    resetPassword: vi.fn(),
    updatePassword: vi.fn(),
    signOut: vi.fn(),
    clearPasswordRecovery: vi.fn(),
  }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  mockUser = null;
  mockSignIn.mockClear();
});

const sampleSnapshot = {
  generated_at: new Date().toISOString(),
  series: [{
    id: 'series-1',
    tmdb_id: 1,
    slug: 'show-one',
    title: 'Show One',
    network: 'Network One',
    network_group: 'Network One',
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

describe('watchlist auth modal close navigation', () => {
  it('redirects to the leaderboard route when closing auth modal on /watchlist as a guest', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(sampleSnapshot), { status: 200 })));

    render(
      <MemoryRouter initialEntries={['/watchlist']}>
        <App />
      </MemoryRouter>
    );

    // Initial view: Watchlist sign in prompt
    expect(await screen.findByText('Sign in to use your watchlist')).toBeInTheDocument();

    // Click Sign In to open modal
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    // Click Continue as Guest
    const continueAsGuestBtn = await screen.findByRole('button', { name: 'Continue as Guest' });
    fireEvent.click(continueAsGuestBtn);

    // Expect to be redirected to leaderboard route where Show One is rendered
    expect(await screen.findByText('Show One')).toBeInTheDocument();
  });

  it('keeps user on /watchlist after successful sign in', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(sampleSnapshot), { status: 200 })));

    const { container } = render(
      <MemoryRouter initialEntries={['/watchlist']}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText('Sign in to use your watchlist')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    const emailInput = screen.getByPlaceholderText('you@domain.com');
    const passwordInput = screen.getByPlaceholderText('••••••••');
    fireEvent.change(emailInput, { target: { value: 'user@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });

    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submitBtn).not.toBeNull();
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    // Wait for auth modal to finish processing
    expect(mockSignIn).toHaveBeenCalledWith('user@example.com', 'password123', undefined);

    // Modal closes with reason: 'success', so user should NOT be redirected to leaderboard (Show One should not be in the DOM)
    expect(screen.queryByText('Show One')).not.toBeInTheDocument();
  });
});
