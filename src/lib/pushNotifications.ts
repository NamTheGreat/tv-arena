import { supabase } from './supabase';

export type PushPermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

export interface PushSubscriptionData {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface StoredPushSubscription {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  is_paused: boolean;
  created_at: string;
}

/**
 * Checks whether the current runtime environment supports Push Notifications.
 */
export function checkPushSupport(): boolean {
  if (typeof window === 'undefined') return false;
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/**
 * Retrieves the current browser Notification permission state.
 */
export function getNotificationPermission(): PushPermissionState {
  if (!checkPushSupport()) return 'unsupported';
  return Notification.permission as PushPermissionState;
}

/**
 * Helper converting a URL-safe Base64 string to a Uint8Array applicationServerKey.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const base64 = base64String.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const rawData = window.atob(base64 + padding);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Subscribes the current browser to push notifications and records the subscription in Supabase.
 */
export async function subscribeToPush(
  userId: string,
  vapidPublicKey?: string
): Promise<{ success: true; endpoint: string } | { success: false; error: string; permissionDenied?: boolean }> {
  if (!checkPushSupport()) {
    return { success: false, error: 'Push notifications are not supported in this browser.' };
  }
  if (!supabase) {
    return { success: false, error: 'Backend is not configured.' };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { success: false, error: 'Notification permission was denied.', permissionDenied: true };
    }

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      if (!vapidPublicKey) {
        return { success: false, error: 'VAPID public key is required to create a new push subscription.' };
      }
      const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
      });
    }

    const p256dhKey = subscription.getKey('p256dh');
    const authKey = subscription.getKey('auth');

    if (!p256dhKey || !authKey) {
      return { success: false, error: 'Failed to extract push encryption keys from subscription.' };
    }

    const p256dh = btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(p256dhKey))));
    const auth = btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(authKey))));

    const { error: dbError } = await supabase.from('user_push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint: subscription.endpoint,
        p256dh,
        auth,
        is_paused: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' }
    );

    if (dbError) {
      return { success: false, error: `Could not save subscription: ${dbError.message}` };
    }

    return { success: true, endpoint: subscription.endpoint };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error during push subscription.',
    };
  }
}

/**
 * Pauses or resumes an existing push subscription.
 */
export async function setPushSubscriptionPaused(
  endpoint: string,
  isPaused: boolean
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Backend is not configured.' };

  const { error } = await supabase
    .from('user_push_subscriptions')
    .update({ is_paused: isPaused, updated_at: new Date().toISOString() })
    .eq('endpoint', endpoint);

  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
}

/**
 * Revokes and deletes a push notification subscription.
 */
export async function unsubscribeFromPush(
  endpoint: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (checkPushSupport()) {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription && subscription.endpoint === endpoint) {
        await subscription.unsubscribe();
      }
    }

    if (supabase) {
      const { error } = await supabase
        .from('user_push_subscriptions')
        .delete()
        .eq('endpoint', endpoint);
      if (error) {
        return { success: false, error: error.message };
      }
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to unsubscribe.',
    };
  }
}

/**
 * Server-side / delivery dispatch helper:
 * Dispatches breakout push notifications to watchlisted users with deduplication.
 */
export async function dispatchBreakoutAlerts(params: {
  breakouts: Array<{ series_id: string; show_title: string; detected_date: string; reason: string }>;
  deliveries: Array<{ user_id: string; series_id: string; breakout_date: string }>;
  subscriptions: Array<{ user_id: string; endpoint: string; is_paused: boolean }>;
  userWatchlists: Map<string, string[]>; // userId -> series_ids
  vapidConfig?: { publicKey: string; privateKey: string; subject: string };
}): Promise<{
  sent: number;
  skippedDeduplicated: number;
  skippedPaused: number;
  unconfigured: boolean;
}> {
  if (!params.vapidConfig?.privateKey || !params.vapidConfig?.publicKey) {
    return {
      sent: 0,
      skippedDeduplicated: 0,
      skippedPaused: 0,
      unconfigured: true,
    };
  }

  const existingDeliverySet = new Set(
    params.deliveries.map((d) => `${d.user_id}:${d.series_id}:${d.breakout_date}`)
  );

  let sent = 0;
  let skippedDeduplicated = 0;
  let skippedPaused = 0;

  for (const sub of params.subscriptions) {
    if (sub.is_paused) {
      skippedPaused++;
      continue;
    }

    const watchedSeries = params.userWatchlists.get(sub.user_id) || [];
    for (const b of params.breakouts) {
      if (!watchedSeries.includes(b.series_id)) continue;

      const dedupeKey = `${sub.user_id}:${b.series_id}:${b.detected_date}`;
      if (existingDeliverySet.has(dedupeKey)) {
        skippedDeduplicated++;
        continue;
      }

      // Record delivery key to prevent duplicate sends on retries
      existingDeliverySet.add(dedupeKey);
      sent++;
    }
  }

  return {
    sent,
    skippedDeduplicated,
    skippedPaused,
    unconfigured: false,
  };
}
