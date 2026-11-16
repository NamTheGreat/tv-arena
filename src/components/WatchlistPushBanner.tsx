import React, { useEffect, useState } from 'react';
import {
  checkPushSupport,
  getNotificationPermission,
  subscribeToPush,
  setPushSubscriptionPaused,
  unsubscribeFromPush,
  PushPermissionState,
} from '../lib/pushNotifications';
import { supabase } from '../lib/supabase';

interface WatchlistPushBannerProps {
  userId?: string;
}

export function WatchlistPushBanner({ userId }: WatchlistPushBannerProps) {
  const [support] = useState<boolean>(() => checkPushSupport());
  const [permission, setPermission] = useState<PushPermissionState>(() => getNotificationPermission());
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || !supabase || !support) return;

    let active = true;
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('user_push_subscriptions')
          .select('endpoint, is_paused')
          .eq('user_id', userId)
          .maybeSingle();

        if (!active) return;
        if (!error && data) {
          setEndpoint(data.endpoint);
          setIsPaused(data.is_paused);
        }
      } catch {
        // Ignore load errors
      }
    })();

    return () => {
      active = false;
    };
  }, [userId, support]);

  if (!userId) return null;

  if (!support) {
    return (
      <div className="mb-4 rounded-2xl bg-stone-50 border border-stone-200/70 p-3.5 text-xs text-stone-500 flex items-center justify-between">
        <span>Push notifications for watchlist breakouts are not supported in this browser.</span>
        <span className="text-[10px] uppercase font-semibold text-stone-400">Unsupported</span>
      </div>
    );
  }

  if (permission === 'denied') {
    return (
      <div className="mb-4 rounded-2xl bg-amber-50/70 border border-amber-200/70 p-3.5 text-xs text-amber-900 flex items-center justify-between">
        <span>Breakout alerts are blocked in your browser settings. Unblock permissions to receive alerts.</span>
        <span className="text-[10px] uppercase font-semibold text-amber-700">Blocked</span>
      </div>
    );
  }

  const handleEnable = async () => {
    setLoading(true);
    setMessage(null);
    const result = await subscribeToPush(userId);
    setLoading(false);
    if (result.success) {
      setEndpoint(result.endpoint);
      setIsPaused(false);
      setPermission('granted');
      setMessage('Breakout notifications enabled!');
    } else {
      if (result.permissionDenied) setPermission('denied');
      setMessage(result.error);
    }
  };

  const handleTogglePause = async () => {
    if (!endpoint) return;
    setLoading(true);
    const nextPaused = !isPaused;
    const result = await setPushSubscriptionPaused(endpoint, nextPaused);
    setLoading(false);
    if (result.success) {
      setIsPaused(nextPaused);
      setMessage(nextPaused ? 'Notifications paused.' : 'Notifications resumed.');
    } else {
      setMessage(result.error || 'Failed to update subscription.');
    }
  };

  const handleUnsubscribe = async () => {
    if (!endpoint) return;
    setLoading(true);
    const result = await unsubscribeFromPush(endpoint);
    setLoading(false);
    if (result.success) {
      setEndpoint(null);
      setMessage('Unsubscribed from breakout notifications.');
    } else {
      setMessage(result.error || 'Failed to unsubscribe.');
    }
  };

  return (
    <div
      className="mb-4 rounded-2xl bg-[#FFFDF9] border border-[#EBE3D7] p-3.5 sm:p-4 text-xs shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3"
      data-testid="watchlist-push-banner"
    >
      <div>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${endpoint && !isPaused ? 'bg-emerald-500 animate-pulse' : 'bg-stone-400'}`} />
          <span className="font-semibold text-stone-800">
            {endpoint
              ? isPaused
                ? 'Breakout Alerts (Paused)'
                : 'Breakout Alerts (Active)'
              : 'Opt-in Breakout Alerts'}
          </span>
        </div>
        <p className="text-stone-600 mt-0.5">
          {endpoint
            ? isPaused
              ? 'Alerts are paused. Resume to receive alerts when your watched shows spike.'
              : 'You will receive browser push notifications when any watched show breaks out.'
            : 'Get notified as soon as a show on your watchlist has a verified engagement breakout.'}
        </p>
        {message && <p className="text-[11px] text-brand-terracotta mt-1">{message}</p>}
      </div>

      <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
        {endpoint ? (
          <>
            <button
              type="button"
              onClick={handleTogglePause}
              disabled={loading}
              className="px-3 py-1.5 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-700 font-medium text-[11px] transition-colors cursor-pointer"
            >
              {isPaused ? 'Resume' : 'Pause'}
            </button>
            <button
              type="button"
              onClick={handleUnsubscribe}
              disabled={loading}
              className="px-3 py-1.5 rounded-full border border-stone-200 hover:bg-stone-50 text-rose-700 font-medium text-[11px] transition-colors cursor-pointer"
            >
              Revoke
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={handleEnable}
            disabled={loading}
            className="px-4 py-1.5 rounded-full bg-brand-terracotta hover:bg-brand-terracotta/90 text-white font-medium text-[11px] shadow-sm transition-all cursor-pointer"
          >
            {loading ? 'Subscribing…' : 'Enable Alerts'}
          </button>
        )}
      </div>
    </div>
  );
}
