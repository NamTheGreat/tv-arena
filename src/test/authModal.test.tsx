import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const { signIn, signUp, resetPassword, updatePassword, clearPasswordRecovery } = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  resetPassword: vi.fn(),
  updatePassword: vi.fn(),
  clearPasswordRecovery: vi.fn(),
}));

vi.mock('../lib/auth', () => ({
  useAuth: () => ({ signIn, signUp, resetPassword, updatePassword, clearPasswordRecovery }),
}));

import { AuthModal } from '../components/AuthModal';

describe('AuthModal password requirements', () => {
  beforeEach(() => {
    signIn.mockReset();
    signUp.mockReset();
    resetPassword.mockReset();
    updatePassword.mockReset();
    clearPasswordRecovery.mockReset();
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

  it('does not render Turnstile when the site key is absent and explains email confirmation', async () => {
    signUp.mockResolvedValue({ error: null, needsEmailConfirmation: true });
    render(<AuthModal isOpen onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));
    expect(screen.queryByLabelText('Security check')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'player@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'longpassword' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    await waitFor(() => expect(signUp).toHaveBeenCalledWith('player@example.com', 'longpassword', undefined));
    expect(await screen.findByRole('status')).toHaveTextContent('Check your email to confirm your account');
  });

  it('sends a password reset email and accepts a recovery password', async () => {
    resetPassword.mockResolvedValue({ error: null });
    updatePassword.mockResolvedValue({ error: null });
    const onClose = vi.fn();
    const { rerender } = render(<AuthModal isOpen onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'player@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    await waitFor(() => expect(resetPassword).toHaveBeenCalledWith('player@example.com', undefined));
    expect(await screen.findByRole('status')).toHaveTextContent('password reset link is on its way');

    rerender(<AuthModal isOpen onClose={onClose} initialMode="update-password" />);
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'newpassword' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
    await waitFor(() => expect(updatePassword).toHaveBeenCalledWith('newpassword'));
    expect(clearPasswordRecovery).toHaveBeenCalledOnce();
  });
});
