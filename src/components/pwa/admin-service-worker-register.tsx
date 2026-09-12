'use client'

import { useEffect } from 'react'

/**
 * Registers the admin service worker (/admin-sw.js) with scope '/admin/'.
 *
 * This is a SEPARATE service worker from the customer one (/sw.js, scope '/').
 * Browsers allow multiple SWs per origin as long as they have different
 * scopes. The browser always uses the most-specific matching SW for a given
 * URL — so /admin/* requests go to /admin-sw.js, and everything else goes
 * to /sw.js.
 *
 * The admin SW only needs to exist (with a fetch handler) for the admin
 * route to satisfy Chrome's PWA installability criteria. It also provides
 * a network-first cache for admin HTML navigations + cache-first for
 * /_next/static/* assets, so the admin dashboard works offline after
 * the first visit.
 *
 * Only runs in production (skipped in dev to avoid caching stale assets).
 */
export function AdminServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return

    const register = () => {
      navigator.serviceWorker
        .register('/admin-sw.js', { scope: '/admin/' })
        .catch((err) => {
          // Silently fail — the admin dashboard still works without a SW,
          // it just won't be installable / offline-capable.
          console.warn('[admin-sw] registration failed:', err)
        })
    }

    if (document.readyState === 'complete') {
      register()
    } else {
      window.addEventListener('load', register, { once: true })
      return () => window.removeEventListener('load', register)
    }
  }, [])

  return null
}
