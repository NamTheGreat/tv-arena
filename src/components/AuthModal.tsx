// ponytail: native HTML form and Supabase auth; no UI component dependency
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/auth';

export type AuthModalMode = 'signin' | 'signup' | 'reset' | 'update-password';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: AuthModalMode;
}

interface TurnstileApi {
  render: (container: HTMLElement, options: {
    sitekey: string;
    callback: (token: string) => void;
    'expired-callback': () => void;
    'error-callback': () => void;
  }) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

function TurnstileWidget({
  siteKey,
  resetKey,
  onToken,
  onError,
}: {
  siteKey: string;
  resetKey: number;
  onToken: (token: string) => void;
  onError: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const onErrorRef = useRef(onError);

  onTokenRef.current = onToken;
  onErrorRef.current = onError;

  useEffect(() => {
    let active = true;
    const renderWidget = () => {
      if (!active || !window.turnstile || !containerRef.current || widgetIdRef.current) return;
      try {
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(''),
          'error-callback': () => {
            onTokenRef.current('');
            onErrorRef.current();
          },
        });
      } catch {
        onErrorRef.current();
      }
    };

    const existing = document.querySelector<HTMLScriptElement>('script[data-tv-arena-turnstile]');
    if (window.turnstile) {
      renderWidget();
    } else {
      const script = existing ?? document.createElement('script');
      script.addEventListener('load', renderWidget, { once: true });
      script.addEventListener('error', () => active && onErrorRef.current(), { once: true });
      if (!existing) {
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        script.dataset.tvArenaTurnstile = 'true';
        document.head.appendChild(script);
      }
    }

    return () => {
      active = false;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [siteKey]);

  useEffect(() => {
    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
    }
  }, [resetKey]);

  return <div ref={containerRef} aria-label="Security check" />;
}

export function AuthModal({ isOpen, onClose, initialMode = 'signin' }: AuthModalProps) {
  const { signIn, signUp, resetPassword, updatePassword, clearPasswordRecovery } = useAuth();
  const [mode, setMode] = useState<AuthModalMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaWidgetError, setCaptchaWidgetError] = useState(false);
  const [widgetResetKey, setWidgetResetKey] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() ?? '';

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setErrorMsg(null);
      setSuccessMsg(null);
      setCaptchaToken('');
    }
  }, [initialMode, isOpen]);

  const handleCaptchaError = useCallback(() => setCaptchaWidgetError(true), []);
  const handleCaptchaToken = useCallback((token: string) => {
    setCaptchaToken(token);
    if (token) setCaptchaWidgetError(false);
  }, []);

  if (!isOpen) return null;

  const switchMode = (nextMode: AuthModalMode) => {
    setMode(nextMode);
    setPassword('');
    setCaptchaToken('');
    setCaptchaWidgetError(false);
    setWidgetResetKey((value) => value + 1);
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (siteKey && mode !== 'update-password' && !captchaToken) {
      setErrorMsg(captchaWidgetError ? 'The security check failed to load. Please try again.' : 'Complete the security check to continue.');
      return;
    }

    setIsSubmitting(true);
    const token = siteKey ? captchaToken : undefined;
    try {
      if (mode === 'signin') {
        const { error } = await signIn(email, password, token);
        if (error) setErrorMsg(error.message);
        else onClose();
      } else if (mode === 'signup') {
        const { error, needsEmailConfirmation } = await signUp(email, password, token);
        if (error) {
          setErrorMsg(error.message);
        } else if (needsEmailConfirmation) {
          setSuccessMsg('Check your email to confirm your account before signing in.');
        } else {
          setSuccessMsg('Account created! You are now signed in.');
          window.setTimeout(onClose, 1200);
        }
      } else if (mode === 'reset') {
        const { error } = await resetPassword(email, token);
        if (error) setErrorMsg(error.message);
        else setSuccessMsg('If an account exists for that email, a password reset link is on its way.');
      } else {
        const { error } = await updatePassword(password);
        if (error) {
          setErrorMsg(error.message);
        } else {
          setSuccessMsg('Password updated.');
          clearPasswordRecovery();
          window.setTimeout(onClose, 900);
        }
      }
    } catch {
      setErrorMsg('Could not complete that request. Check your connection and try again.');
    } finally {
      if (mode !== 'update-password' && siteKey) {
        setCaptchaToken('');
        setWidgetResetKey((value) => value + 1);
      }
      setIsSubmitting(false);
    }
  };

  const title = mode === 'signin'
    ? 'Sign In to TV Arena'
    : mode === 'signup'
      ? 'Create Arena Account'
      : mode === 'reset'
        ? 'Reset your password'
        : 'Choose a new password';

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-arena-surface border border-arena-border rounded-3xl p-6 sm:p-7 shadow-soft-card flex flex-col relative"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 text-arena-muted hover:text-arena-charcoal text-lg leading-none"
          aria-label="Close modal"
        >
          ✕
        </button>

        <div className="text-center mb-5">
          <h2 className="text-2xl font-serif font-medium text-arena-charcoal">{title}</h2>
          <p className="text-xs text-arena-muted mt-1">
            {mode === 'signin'
              ? 'Track your highest streaks and daily rankings'
              : mode === 'signup'
                ? 'Join the Arena and compete on the leaderboard'
                : mode === 'reset'
                  ? 'We will email you a secure link to choose a new password.'
                  : 'Choose a password with at least 8 characters.'}
          </p>
        </div>

        {(mode === 'signin' || mode === 'signup') ? (
          <div className="flex bg-stone-100 p-1 rounded-full mb-4 text-xs font-semibold">
            {(['signin', 'signup'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => switchMode(tab)}
                className={`flex-1 py-1.5 rounded-full transition-colors ${mode === tab ? 'bg-white text-arena-charcoal shadow-sm' : 'text-arena-muted hover:text-arena-charcoal'}`}
              >
                {tab === 'signin' ? 'Sign In' : 'Sign Up'}
              </button>
            ))}
          </div>
        ) : (
          <button type="button" onClick={() => switchMode('signin')} className="mb-4 text-xs text-arena-muted underline">
            Back to sign in
          </button>
        )}

        {errorMsg && <div role="alert" className="mb-3 px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">{errorMsg}</div>}
        {successMsg && <div role="status" className="mb-3 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs">{successMsg}</div>}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {mode !== 'update-password' && (
            <div>
              <label htmlFor="auth-email" className="block text-[11px] uppercase font-bold tracking-wider text-arena-muted mb-1">Email</label>
              <input
                id="auth-email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@domain.com"
                autoComplete="email"
                className="w-full bg-white border border-arena-border px-3.5 py-2.5 rounded-xl text-sm outline-none focus:border-arena-terracotta"
              />
            </div>
          )}

          {mode !== 'reset' && (
            <div>
              <label htmlFor="auth-password" className="block text-[11px] uppercase font-bold tracking-wider text-arena-muted mb-1">
                {mode === 'update-password' ? 'New password' : 'Password'}
              </label>
              <input
                id="auth-password"
                type="password"
                required
                minLength={mode === 'signin' ? undefined : 8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                aria-describedby={mode === 'signin' ? undefined : 'password-requirement'}
                className="w-full bg-white border border-arena-border px-3.5 py-2.5 rounded-xl text-sm outline-none focus:border-arena-terracotta"
              />
              {mode !== 'signin' && <p id="password-requirement" className="mt-1 text-[11px] text-arena-muted">Use at least 8 characters.</p>}
            </div>
          )}

          {mode === 'signin' && (
            <button type="button" onClick={() => switchMode('reset')} className="self-end text-xs text-arena-muted hover:text-arena-charcoal underline">
              Forgot password?
            </button>
          )}

          {siteKey && mode !== 'update-password' && (
            <div className="min-h-[66px]">
              <TurnstileWidget
                siteKey={siteKey}
                resetKey={widgetResetKey}
                onToken={handleCaptchaToken}
                onError={handleCaptchaError}
              />
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-2 py-2.5 rounded-full bg-arena-terracotta text-white font-semibold text-xs tracking-wider uppercase hover:bg-arena-terracottaHover transition-colors disabled:opacity-50"
          >
            {isSubmitting
              ? 'Connecting...'
              : mode === 'signin'
                ? 'Sign In'
                : mode === 'signup'
                  ? 'Create Account'
                  : mode === 'reset'
                    ? 'Send reset link'
                    : 'Update password'}
          </button>
        </form>

        <div className="mt-4 pt-3 border-t border-arena-border/50 text-center">
          <button type="button" onClick={onClose} className="text-xs text-arena-muted hover:text-arena-charcoal underline">
            Continue as Guest
          </button>
        </div>
      </div>
    </div>
  );
}
