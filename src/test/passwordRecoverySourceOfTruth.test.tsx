import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';

const mockAuth = vi.hoisted(() => ({
  user: null as any,
  session: null as any,
  loading: false,
  passwordRecovery: false,
  signIn: vi.fn(),
  signUp: vi.fn(),
  resetPassword: vi.fn(),
  updatePassword: vi.fn(),
  clearPasswordRecovery: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('../lib/auth', () => ({
  useAuth: () => mockAuth,
}));

vi.mock('../lib/supabase', async () => {
  const actual = await vi.importActual<typeof import('../lib/supabase')>('../lib/supabase');
  return {
    ...actual,
    supabase: null,
    fetchArenaSnapshot: vi.fn().mockResolvedValue({ series: [{ id: '1', slug: 'show-1', title: 'Show 1', buzz_score: 100, daily_dates: [], daily_series: [] }] }),
  };
});

describe('Password recovery single source of truth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.user = null;
    mockAuth.passwordRecovery = false;
  });

  it('when user is signed in and passwordRecovery is true, update-password mode opens and closing clears recovery flag', async () => {
    mockAuth.user = { id: 'user-1', email: 'test@example.com' };
    mockAuth.passwordRecovery = true;

    render(
      <MemoryRouter initialEntries={['/?password-reset=1']}>
        <App />
      </MemoryRouter>
    );

    // Modal should be open in update-password mode (give ample timeout for lazy-loaded AuthModal in CI)
    const heading = await screen.findByRole('heading', { name: /Choose a new password/i }, { timeout: 10000 });
    expect(heading).toBeInTheDocument();
    expect(screen.getByLabelText(/New password/i)).toBeInTheDocument();

    // Close modal
    const closeBtn = screen.getByRole('button', { name: /Close modal/i });
    fireEvent.click(closeBtn);

    // clearPasswordRecovery must be called
    expect(mockAuth.clearPasswordRecovery).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /Choose a new password/i })).not.toBeInTheDocument();
    });
  }, 15000);

  it('a recovery link with passwordRecovery: false does not open update-password mode', async () => {
    mockAuth.user = { id: 'user-1', email: 'test@example.com' };
    mockAuth.passwordRecovery = false;

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );

    // Wait for App shell to render
    await screen.findByRole('heading', { level: 1 });

    // Modal should NOT be open
    expect(screen.queryByRole('heading', { name: /Choose a new password/i })).not.toBeInTheDocument();
  }, 15000);
});
