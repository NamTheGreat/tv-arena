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

  // 1. Snapshot fetch: network-first, with fallback to cached snapshot.json
  if (url.pathname === '/snapshot.json') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(DATA_CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
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
  if (url.origin === self.location.origin && (url.pathname.startsWith('/assets/') || APP_SHELL_URLS.includes(url.pathname))) {
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

  // 4. Default: fetch from network
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});
