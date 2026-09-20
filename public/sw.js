// /public/sw.js — Service Worker for Apna Baithak PWA
//
// Strategy:
// - Precache the app shell (start URL, manifest, brand icons) on install.
// - Network-first for navigation requests (always serve fresh HTML when
//   online, fall back to cache when offline).
// - Stale-while-revalidate for static assets (JS, CSS, images, fonts).
// - Cache-first for brand/icon images (they rarely change).

const CACHE_NAME = 'apna-baithak-v1'
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/brand/icon-192x192.png',
  '/brand/icon-512x512.png',
  '/brand/apple-touch-icon.png',
  '/brand/wordmark.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => {})
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  // Only handle GET requests
  if (req.method !== 'GET') return

  const url = new URL(req.url)

  // Skip cross-origin requests (Supabase, OpenStreetMap tiles, etc.)
  if (url.origin !== self.location.origin) return

  // Skip API routes (always hit the network — they need fresh auth/data)
  if (url.pathname.startsWith('/api/')) return

  // Skip Next.js HMR/dev-only paths
  if (url.pathname.startsWith('/_next/webpack-hmr')) return

  // Navigation requests: network-first, fall back to cached start URL offline
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Cache a copy of the latest navigation response
          const clone = res.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put('/', clone)).catch(() => {})
          return res
        })
        .catch(() => caches.match('/'))
    )
    return
  }

  // Static assets: stale-while-revalidate
  if (req.destination === 'style' || req.destination === 'script' || req.destination === 'font') {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(req).then((cached) => {
          const fetchPromise = fetch(req)
            .then((res) => {
              if (res.ok) cache.put(req, res.clone())
              return res
            })
            .catch(() => cached)
          return cached || fetchPromise
        })
      )
    )
    return
  }

  // Brand/icon images: cache-first
  if (url.pathname.startsWith('/brand/')) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(req).then((cached) => cached || fetch(req).then((res) => {
          if (res.ok) cache.put(req, res.clone())
          return res
        }))
      )
    )
    return
  }

  // Other images / Next.js image optimizations: stale-while-revalidate
  if (req.destination === 'image') {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(req).then((cached) => {
          const fetchPromise = fetch(req)
            .then((res) => {
              if (res.ok) cache.put(req, res.clone())
              return res
            })
            .catch(() => cached)
          return cached || fetchPromise
        })
      )
    )
  }
})

// ===== Web Push (VAPID) event handlers =====
// The customer-facing service worker receives push events when:
//   - The customer's order status changes (PREPARING / OUT_FOR_DELIVERY / DELIVERED / CANCELLED)
//   - (Admin subscriptions register under /admin-sw.js, not here.)
//
// Payload shape (sent from src/lib/push.ts):
//   { title: string, body: string, url?: string, tag?: string }
//
// `tag` is set per-order-id so a new push for the same order replaces the
// previous notification in the system tray (no stacking).

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (e) {
    // Fallback to plain text if payload isn't JSON
    data = { title: 'Apna Baithak', body: event.data ? event.data.text() : '' }
  }

  const title = data.title || 'Apna Baithak'
  const options = {
    body: data.body || '',
    icon: '/brand/icon-192x192.png',
    badge: '/brand/icon-192x192.png',
    data: { url: data.url || '/' },
    tag: data.tag || undefined,
    vibrate: [80, 40, 80],
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })

      // If a window client is already open on the same origin, focus it
      // and navigate it to the target URL. Otherwise open a new window.
      const targetClient = allClients.find((client) =>
        client.url.startsWith(self.location.origin)
      )

      if (targetClient) {
        try {
          await targetClient.focus()
          // Post a message so the client app can route itself (the React app
          // listens for this in src/hooks/use-push-subscription.ts).
          targetClient.postMessage({ type: 'PUSH_CLICK', url: targetUrl })
        } catch {}
        return
      }

      await self.clients.openWindow(targetUrl)
    })()
  )
})
