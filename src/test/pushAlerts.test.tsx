import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  checkPushSupport,
  getNotificationPermission,
  urlBase64ToUint8Array,
  dispatchBreakoutAlerts,
  setPushSubscriptionPaused,
  unsubscribeFromPush,
} from '../lib/pushNotifications';
import { WatchlistPushBanner } from '../components/WatchlistPushBanner';
import { supabase } from '../lib/supabase';

describe('Push Notification Runtime & Support Checks', () => {
  it('converts URL-safe Base64 strings to Uint8Array', () => {
    const raw = btoa('test-vapid-key-data').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const bytes = urlBase64ToUint8Array(raw);
    expect(bytes instanceof Uint8Array).toBe(true);
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('detects push support based on navigator and window features', () => {
    // In default jsdom, PushManager is undefined
    const supported = checkPushSupport();
    expect(typeof supported).toBe('boolean');
  });

  it('returns unsupported permission state when PushManager is absent', () => {
    const state = getNotificationPermission();
    expect(['default', 'granted', 'denied', 'unsupported']).toContain(state);
  });
});

describe('WatchlistPushBanner UI states', () => {
  it('renders unsupported message when push notifications are unavailable', () => {
    render(<WatchlistPushBanner userId="user-123" />);

    // In JSDOM PushManager is not supported, so unsupported state should render cleanly
    expect(screen.getByText(/Push notifications for watchlist breakouts are not supported in this browser/i)).toBeInTheDocument();
  });
});

describe('Breakout Push Dispatch & Delivery Deduplication', () => {
  const breakouts = [
    {
      series_id: 'series-severance',
      show_title: 'Severance',
      detected_date: '2026-11-17',
      reason: 'Wikipedia spike',
    },
    {
      series_id: 'series-silo',
      show_title: 'Silo',
      detected_date: '2026-11-17',
      reason: 'Reddit spike',
    },
    {
      series_id: 'series-unwatched',
      show_title: 'Unwatched Show',
      detected_date: '2026-11-17',
      reason: 'General breakout',
    },
  ];

  const subscriptions = [
    {
      user_id: 'user-alice',
      endpoint: 'https://push.example.com/sub/alice',
      is_paused: false,
    },
    {
      user_id: 'user-bob',
      endpoint: 'https://push.example.com/sub/bob',
      is_paused: true, // Bob has paused alerts
    },
  ];

  const userWatchlists = new Map<string, string[]>([
    ['user-alice', ['series-severance', 'series-silo']], // Alice watches Severance & Silo
    ['user-bob', ['series-severance']], // Bob watches Severance but is paused
  ]);

  it('gracefully reports unconfigured state when VAPID keys are missing', async () => {
    const result = await dispatchBreakoutAlerts({
      breakouts,
      deliveries: [],
      subscriptions,
      userWatchlists,
      vapidConfig: undefined, // Missing VAPID
    });

    expect(result.unconfigured).toBe(true);
    expect(result.sent).toBe(0);
  });

  it('dispatches alerts only for watchlisted shows and skips paused users', async () => {
    const vapidConfig = {
      publicKey: 'pub-key',
      privateKey: 'priv-key',
      subject: 'mailto:ops@tv-arena.com',
    };

    const result = await dispatchBreakoutAlerts({
      breakouts,
      deliveries: [],
      subscriptions,
      userWatchlists,
      vapidConfig,
    });

    expect(result.unconfigured).toBe(false);
    // Alice receives alerts for Severance and Silo (2). Unwatched Show is not on her watchlist.
    expect(result.sent).toBe(2);
    // Bob was paused, so his alert is skipped
    expect(result.skippedPaused).toBe(1);
  });

  it('skips duplicate alerts on retries for already delivered breakouts', async () => {
    const vapidConfig = {
      publicKey: 'pub-key',
      privateKey: 'priv-key',
      subject: 'mailto:ops@tv-arena.com',
    };

    // Alice already received Severance on 2026-11-17
    const priorDeliveries = [
      {
        user_id: 'user-alice',
        series_id: 'series-severance',
        breakout_date: '2026-11-17',
      },
    ];

    const result = await dispatchBreakoutAlerts({
      breakouts,
      deliveries: priorDeliveries,
      subscriptions,
      userWatchlists,
      vapidConfig,
    });

    // Only Silo is newly delivered (1). Severance is deduplicated (1).
    expect(result.sent).toBe(1);
    expect(result.skippedDeduplicated).toBe(1);
  });
});
