'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Registers the CUSTOMER service worker (/public/sw.js, scope '/') on the
 * client after the page has loaded. Only runs in production (skipped in dev
 * to avoid caching stale assets during development).
 *
 * IMPORTANT: this component is mounted in the ROOT layout, so it runs on
 * every route — including /admin. To prevent the customer SW from
 * registering on admin routes (which would cause two SWs to compete for
 * /admin/* and two install banners to appear), we early-return when
 * pathname starts with '/admin'. The admin route has its own
 * AdminServiceWorkerRegister component (in /src/app/admin/layout.tsx)
 * that registers /admin-sw.js with scope '/admin/'.
 */
export function ServiceWorkerRegister() {
  const pathname = usePathname()

  useEffect(() => {
    // Don't register the customer SW on admin routes.
    if (pathname?.startsWith('/admin')) return

    if (process.env.NODE_ENV !== 'production') return
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return

    const register = () => {
      navigator.serviceWorker
        .register('/sw.js')
        .catch(() => {
          // Silently fail — the app still works without a service worker,
          // it just won't be installable / offline-capable.
        })
    }

    // Register after window load to avoid competing with first paint.
    if (document.readyState === 'complete') {
      register()
    } else {
      window.addEventListener('load', register, { once: true })
      return () => window.removeEventListener('load', register)
    }
  }, [pathname])

  return null
}
