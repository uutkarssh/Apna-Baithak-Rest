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
