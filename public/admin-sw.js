/*
 * Apna Baithak Admin — Service Worker
 * Scope: /admin/*
 *
 * Job: make the admin route installable as a standalone PWA on phone home
 * screens. Implements a `fetch` handler (Chrome requires this for
 * installability) with a network-first strategy for navigations and a
 * cache-first strategy for static assets.
 *
 * Cache strategy:
 *   - HTML navigations (documents) → network-first, fall back to cache,
 *     fall back to offline-fallback page.
 *   - Static assets (JS/CSS/fonts/images under /_next/) → cache-first,
 *     fall back to network.
 *   - API calls (/api/*) → network-only (never cache live data).
 *
 * IMPORTANT: this SW only has scope /admin/ (registered with
 * `navigator.serviceWorker.register('/admin-sw.js', { scope: '/admin/' })`).
 * It will NOT intercept requests for the customer app at /.
 */

const ADMIN_CACHE = 'apna-baithak-admin-v1';
const ADMIN_ASSETS_CACHE = 'apna-baithak-admin-assets-v1';
const OFFLINE_URL = '/admin/offline.html';

// Assets that should be cached (anything under /_next/static/ and /admin-brand/)
const ASSET_PATTERN = /\/_next\/static\/|\/admin-brand\/|\/manifest\.json$/;
// Navigations (HTML documents)
const NAV_PATTERN = /text\/html/i;

self.addEventListener('install', (event) => {
  // Pre-cache the offline fallback page so a failed navigation has somewhere
  // to land. skipWaiting() ensures the new SW activates immediately instead
  // of waiting for all admin tabs to close.
  event.waitUntil(
    caches.open(ADMIN_CACHE).then((cache) => cache.addAll([OFFLINE_URL])).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Clean up old caches from previous SW versions.
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== ADMIN_CACHE && k !== ADMIN_ASSETS_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET. POST/PUT/etc. always go to network.
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Same-origin only. Don't intercept cross-origin (Supabase, Google Maps, etc.)
  if (url.origin !== self.location.origin) return;

  // Don't intercept API calls — admin dashboard needs fresh data always.
  if (url.pathname.startsWith('/api/')) return;

  // Static assets → cache-first
  if (ASSET_PATTERN.test(url.pathname)) {
    event.respondWith(
      caches.open(ADMIN_ASSETS_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) {
          // Refresh in background
          fetch(req).then((res) => {
            if (res && res.ok) cache.put(req, res.clone());
          }).catch(() => {});
          return cached;
        }
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  // HTML navigations → network-first with offline fallback
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').match(NAV_PATTERN)) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          // Cache the latest version of admin pages so a future offline visit
          // has something to show.
          const cache = await caches.open(ADMIN_CACHE);
          cache.put(req, res.clone()).catch(() => {});
          return res;
        } catch (err) {
          // Network failed — try cache, then offline fallback
          const cache = await caches.open(ADMIN_CACHE);
          const cached = await cache.match(req);
          if (cached) return cached;
          const offline = await cache.match(OFFLINE_URL);
          if (offline) return offline;
          return new Response(
            '<h1>Offline</h1><p>The admin panel needs an internet connection.</p>',
            { status: 503, headers: { 'Content-Type': 'text/html' } }
          );
        }
      })()
    );
    return;
  }
});

// ===== Web Push (VAPID) event handlers =====
// The admin service worker receives push events when:
//   - A new order is placed (NEW)
//   - A UPI payment is pending manual verification
//   - A UPI payment is verified/received
// (Customer-facing order-status-change pushes are sent to /sw.js, not here.)
//
// Payload shape (sent from src/lib/push.ts):
//   { title: string, body: string, url?: string, tag?: string }

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'AB Admin', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Apna Baithak Admin';
  const options = {
    body: data.body || '',
    icon: '/admin-brand/icon-192x192.png',
    badge: '/admin-brand/icon-192x192.png',
    data: { url: data.url || '/admin' },
    tag: data.tag || undefined,
    vibrate: [120, 60, 120],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/admin';

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      // Prefer an already-open admin tab; otherwise open a new one.
      const adminClient = allClients.find((client) =>
        client.url.startsWith(self.location.origin + '/admin')
      );

      if (adminClient) {
        try {
          await adminClient.focus();
          adminClient.postMessage({ type: 'PUSH_CLICK', url: targetUrl });
        } catch {}
        return;
      }

      await self.clients.openWindow(targetUrl);
    })()
  );
});
