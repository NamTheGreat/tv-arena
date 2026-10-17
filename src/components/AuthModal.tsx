// ponytail: native HTML form with Supabase auth; no bulky UI component library
import React, { useState } from 'react';
import { useAuth } from '../lib/auth';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsSubmitting(true);

    if (mode === 'signin') {
      const { error } = await signIn(email, password);
      if (error) {
        setErrorMsg(error.message);
      } else {
        onClose();
      }
    } else {
      const { error } = await signUp(email, password);
      if (error) {
        setErrorMsg(error.message);
      } else {
        setSuccessMsg('Account created! You are now signed in.');
        setTimeout(() => onClose(), 1200);
      }
    }
    setIsSubmitting(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-arena-surface border border-arena-border rounded-3xl p-6 sm:p-7 shadow-soft-card flex flex-col relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-arena-muted hover:text-arena-charcoal text-lg leading-none"
          aria-label="Close modal"
        >
          ✕
        </button>

        <div className="text-center mb-5">
          <h2 className="text-2xl font-serif font-medium text-arena-charcoal">
            {mode === 'signin' ? 'Sign In to TV Arena' : 'Create Arena Account'}
          </h2>
          <p className="text-xs text-arena-muted mt-1">
            {mode === 'signin'
              ? 'Track your highest streaks and daily rankings'
              : 'Join the Arena and compete on the leaderboard'}
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-stone-100 p-1 rounded-full mb-4 text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setMode('signin');
              setErrorMsg(null);
            }}
            className={`flex-1 py-1.5 rounded-full transition-colors ${
              mode === 'signin'
                ? 'bg-white text-arena-charcoal shadow-sm'
                : 'text-arena-muted hover:text-arena-charcoal'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('signup');
              setErrorMsg(null);
            }}
            className={`flex-1 py-1.5 rounded-full transition-colors ${
              mode === 'signup'
                ? 'bg-white text-arena-charcoal shadow-sm'
                : 'text-arena-muted hover:text-arena-charcoal'
            }`}
          >
            Sign Up
          </button>
        </div>

        {errorMsg && (
          <div className="mb-3 px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="mb-3 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs">
            {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="block text-[11px] uppercase font-bold tracking-wider text-arena-muted mb-1">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@domain.com"
              className="w-full bg-white border border-arena-border px-3.5 py-2.5 rounded-xl text-sm outline-none focus:border-arena-terracotta"
            />
          </div>

          <div>
            <label className="block text-[11px] uppercase font-bold tracking-wider text-arena-muted mb-1">
              Password
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-white border border-arena-border px-3.5 py-2.5 rounded-xl text-sm outline-none focus:border-arena-terracotta"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-2 py-2.5 rounded-full bg-arena-terracotta text-white font-semibold text-xs tracking-wider uppercase hover:bg-arena-terracottaHover transition-colors disabled:opacity-50"
          >
            {isSubmitting
              ? 'Connecting...'
              : mode === 'signin'
              ? 'Sign In'
              : 'Create Account'}
          </button>
        </form>

        <div className="mt-4 pt-3 border-t border-arena-border/50 text-center">
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-arena-muted hover:text-arena-charcoal underline"
          >
            Continue as Guest
          </button>
        </div>
      </div>
    </div>
  );
}
