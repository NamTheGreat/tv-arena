// TV Arena Push-Capable Service Worker
// Handles push notifications for watchlisted show breakouts

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Push notification payload handling
self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    const payload = event.data.json();
    const title = payload.title || 'TV Arena Breakout Alert';
    const options = {
      body: payload.body || 'A show on your watchlist has broken out!',
      icon: '/icon.svg',
      badge: '/icon.svg',
      data: {
        url: payload.url || '/',
      },
    };
    event.waitUntil(self.registration.showNotification(title, options));
  } catch {
    // Fallback for plain text push messages
    const text = event.data.text();
    event.waitUntil(
      self.registration.showNotification('TV Arena Breakout Alert', {
        body: text,
        icon: '/icon.svg',
        data: { url: '/' },
      })
    );
  }
});

// Open target URL on notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});
