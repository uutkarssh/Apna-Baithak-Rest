'use client'

import { useEffect } from 'react'

/**
 * Registers the admin service worker (/admin-sw.js) with scope '/admin'.
 *
 * This is a SEPARATE service worker from the customer one (/sw.js, scope '/').
 * Browsers allow multiple SWs per origin as long as they have different
 * scopes. The browser always uses the most-specific matching SW for a given
 * URL — so /admin and /admin/* requests go to /admin-sw.js, and everything
 * else goes to /sw.js.
 *
 * IMPORTANT — scope must be '/admin' (no trailing slash), NOT '/admin/'.
 * A SW with scope '/admin/' only controls URLs that start with '/admin/'
 * (e.g. '/admin/foo'), which EXCLUDES the bare '/admin' URL itself. The
 * bare /admin URL is what users actually visit (Next.js serves the admin
 * page at exactly /admin, no redirect to /admin/). If we registered with
 * scope '/admin/', then navigator.serviceWorker.controller would be null
 * on /admin, navigator.serviceWorker.ready would never resolve, and any
 * push-subscription hook waiting on ready would hang forever.
 *
 * Scope '/admin' (no slash) controls both '/admin' AND everything under
 * '/admin/...' — exactly what we want.
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
        .register('/admin-sw.js', { scope: '/admin' })
        .then(async (reg) => {
          // Clean up any stale admin SW registrations from before the scope
          // fix (/admin/ → /admin). The old scope would never control /admin
          // (the bare URL), so it's dead weight — we remove it so the browser
          // doesn't keep two admin SWs around.
          try {
            const all = await navigator.serviceWorker.getRegistrations()
            for (const r of all) {
              if (r.scope.endsWith('/admin/')) {
                await r.unregister()
                console.log('[admin-sw] cleaned up stale registration with old scope /admin/')
              }
            }
          } catch {}
        })
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
