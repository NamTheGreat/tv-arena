// TV Arena Service Worker
// Version: tv-arena-v1

const CACHE_NAME = 'tv-arena-v1';
const DATA_CACHE_NAME = 'tv-arena-data-v1';

const APP_SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon.svg',
];

function isValidSnapshotPayload(value) {
  if (!value || typeof value !== 'object' || typeof value.generated_at !== 'string' || !Array.isArray(value.series)) {
    return false;
  }
  const generatedAt = Date.parse(value.generated_at);
  if (!Number.isFinite(generatedAt) || generatedAt > Date.now() + 5 * 60 * 1000) return false;

  return value.series.every((series) => series && typeof series === 'object'
    && typeof series.id === 'string'
    && Number.isFinite(series.tmdb_id)
    && typeof series.slug === 'string'
    && typeof series.title === 'string'
    && typeof series.network === 'string'
    && typeof series.network_group === 'string'
    && typeof series.genre_group === 'string'
    && typeof series.release_years === 'string'
    && (typeof series.chart_color === 'string' || series.chart_color === null)
    && typeof series.wiki_slug === 'string'
    && typeof series.reddit_query === 'string'
    && Number.isFinite(series.buzz_score)
    && Number.isFinite(series.current_7d_score)
    && Number.isFinite(series.previous_7d_score)
    && Number.isFinite(series.rank)
    && (typeof series.delta_pct === 'number' || series.delta_pct === null)
    && (typeof series.updated_at === 'string' || series.updated_at === null)
    && Array.isArray(series.events)
    && typeof series.is_breakout === 'boolean'
    && Array.isArray(series.daily_series)
    && series.daily_series.every(Number.isFinite)
    && Array.isArray(series.daily_dates)
    && series.daily_dates.every((date) => typeof date === 'string'));
}

// Pre-cache core app shell on install
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL_URLS);
    }).then(() => self.skipWaiting())
  );
});

// Clean up stale cache versions on activate
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME && name !== DATA_CACHE_NAME) {
            return caches.delete(name);
          }
          return undefined;
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Intercept fetch requests
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Reject mutations immediately if offline - never pretend to save
  if (request.method !== 'GET') {
    if (!navigator.onLine) {
      event.respondWith(
        new Response(
          JSON.stringify({
            error: 'Offline: mutations cannot be saved while offline.',
            offline: true,
          }),
          {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      );
    }
    return;
  }

  // Only handle same-origin GET requests for app shell, assets, and snapshot
  if (url.origin !== self.location.origin) {
    return;
  }

  // 1. Snapshot fetch: network-first, with fallback to cached snapshot.json
  if (url.pathname === '/snapshot.json') {
    event.respondWith(
      fetch(request).then(async (response) => {
        if (response.ok) {
          try {
            const payload = await response.clone().json();
            if (isValidSnapshotPayload(payload)) {
              const cache = await caches.open(DATA_CACHE_NAME);
              await cache.put(request, response.clone());
            }
          } catch {
            // Leave the last valid snapshot intact if the response is malformed.
          }
        }
        return response;
      }).catch(async () => {
          const cache = await caches.open(DATA_CACHE_NAME);
          const cached = await cache.match(request);
          if (cached) {
            try {
              if (isValidSnapshotPayload(await cached.clone().json())) return cached;
            } catch {
              // Remove snapshots cached by older service worker versions without validation.
            }
            await cache.delete(request);
          }
          return new Response(JSON.stringify({ error: 'No cached snapshot available offline.' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          });
        })
    );
    return;
  }

  // 2. Navigation requests: network-first, falling back to cached /index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match('/index.html');
        return cached || (await caches.match('/'));
      })
    );
    return;
  }

  // 3. Static assets: cache-first with network fallback
  if (url.pathname.startsWith('/assets/') || APP_SHELL_URLS.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }
});

// Push notification payload handling.
self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    const payload = event.data.json();
    const targetUrl = new URL(payload.url || '/', self.location.origin);
    const url = targetUrl.origin === self.location.origin ? targetUrl.pathname + targetUrl.search + targetUrl.hash : '/';
    event.waitUntil(self.registration.showNotification(payload.title || 'TV Arena Breakout Alert', {
      body: payload.body || 'A show on your watchlist has broken out!',
      icon: '/icon.svg',
      badge: '/icon.svg',
      data: { url },
    }));
  } catch {
    event.waitUntil(self.registration.showNotification('TV Arena Breakout Alert', {
      body: event.data.text(),
      icon: '/icon.svg',
      data: { url: '/' },
    }));
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin);
  const safeUrl = targetUrl.origin === self.location.origin ? targetUrl.href : self.location.origin;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
    const existing = windowClients.find((client) => client.url === safeUrl);
    if (existing && 'focus' in existing) return existing.focus();
    return self.clients.openWindow ? self.clients.openWindow(safeUrl) : undefined;
  }));
});
