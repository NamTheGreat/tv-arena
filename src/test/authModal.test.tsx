import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const { signIn, signUp } = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock('../lib/auth', () => ({
  useAuth: () => ({ signIn, signUp }),
}));

import { AuthModal } from '../components/AuthModal';

describe('AuthModal password requirements', () => {
  beforeEach(() => {
    signIn.mockReset();
    signUp.mockReset();
  });

  it('requires at least 8 characters when creating an account', () => {
    render(<AuthModal isOpen onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));

    const password = screen.getByPlaceholderText('••••••••');
    expect(password).toHaveAttribute('minLength', '8');
    expect(screen.getByText('Use at least 8 characters.')).toBeInTheDocument();
  });

  it('does not apply the new minimum to existing account sign-in', () => {
    render(<AuthModal isOpen onClose={vi.fn()} />);

    expect(screen.getByPlaceholderText('••••••••')).not.toHaveAttribute('minLength');
  });
});
