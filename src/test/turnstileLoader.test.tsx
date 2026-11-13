import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { AuthModal } from '../components/AuthModal';

const mockAuth = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  resetPassword: vi.fn(),
  updatePassword: vi.fn(),
  clearPasswordRecovery: vi.fn(),
}));

vi.mock('../lib/auth', () => ({
  useAuth: () => mockAuth,
}));

describe('Turnstile script loader idempotency and widget lifecycle', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'test-site-key-1234');
    document.head.innerHTML = '';
    delete (window as any).turnstile;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    document.head.innerHTML = '';
    delete (window as any).turnstile;
  });

  it('opening and closing modal quickly several times creates only one script tag and does not invoke unmounted callbacks', async () => {
    let capturedCallback: ((token: string) => void) | null = null;
    const mockTurnstile = {
      render: vi.fn((_container, options) => {
        capturedCallback = options.callback;
        return 'widget-id-1';
      }),
      reset: vi.fn(),
      remove: vi.fn(),
    };

    // Open and close the modal 5 times in rapid succession
    for (let i = 0; i < 5; i++) {
      const { unmount } = render(<AuthModal isOpen={true} onClose={vi.fn()} />);
      unmount();
    }

    // Now open it and keep it mounted
    const { unmount: finalUnmount } = render(<AuthModal isOpen={true} onClose={vi.fn()} />);

    // Check script tags in document.head
    const scripts = document.querySelectorAll('script[data-tv-arena-turnstile]');
    expect(scripts.length).toBe(1);

    // Simulate script load completing
    (window as any).turnstile = mockTurnstile;
    const scriptEl = scripts[0] as HTMLScriptElement;
    await act(async () => {
      scriptEl.dispatchEvent(new Event('load'));
    });

    expect(mockTurnstile.render).toHaveBeenCalled();

    // Now unmount the modal
    finalUnmount();
    expect(mockTurnstile.remove).toHaveBeenCalledWith('widget-id-1');

    // Simulate an async callback firing after unmount
    if (capturedCallback) {
      expect(() => {
        act(() => {
          capturedCallback!('stale-token');
        });
      }).not.toThrow();
    }
  });

  it('Turnstile is a no-op when VITE_TURNSTILE_SITE_KEY is not set', () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '');
    render(<AuthModal isOpen={true} onClose={vi.fn()} />);

    const scripts = document.querySelectorAll('script[data-tv-arena-turnstile]');
    expect(scripts.length).toBe(0);
  });
});
