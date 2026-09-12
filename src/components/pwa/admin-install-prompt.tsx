'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, X, ShieldCheck } from 'lucide-react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// Separate localStorage key from the customer install prompt so admin and
// customer dismissals don't interfere with each other.
const DISMISS_KEY = 'apna-baithak-admin-install-dismissed'
const DISMISS_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000 // 3 days
const SHOW_DELAY_MS = 4000 // Show 4s after the user lands on /admin

/**
 * Admin PWA install prompt. Listens for the browser's `beforeinstallprompt`
 * event, then shows a branded banner inviting the admin to install the
 * dashboard as a standalone app.
 *
 * Behavior mirrors the customer install-prompt.tsx but:
 *   - Uses admin-specific branding (ShieldCheck icon, "Admin" wording)
 *   - Uses a separate localStorage dismiss key
 *   - Only renders when on /admin/* routes (extra safety — the component
 *     is only mounted via /src/app/admin/layout.tsx, but the pathname
 *     check guards against accidental imports from other layouts)
 *
 * Browser support notes:
 *   - Chrome/Edge on Android & desktop: fires `beforeinstallprompt`. ✅
 *   - iOS Safari: does NOT fire `beforeinstallprompt`. iOS users must
 *     use Share → "Add to Home Screen" manually. The admin manifest + icons
 *     will still be picked up correctly. ❌ (no auto-prompt)
 *   - Firefox: does NOT fire `beforeinstallprompt`. Same as iOS — manual
 *     "Add to Home Screen" via the page menu. ❌
 */
export function AdminInstallPrompt() {
  const pathname = usePathname()
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    // Only render the prompt when actually on /admin routes.
    if (!pathname?.startsWith('/admin')) return

    // Don't show if already installed (running in standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) return

    // Check if the user dismissed recently
    try {
      const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || '0')
      if (dismissedAt && Date.now() - dismissedAt < DISMISS_COOLDOWN_MS) return
    } catch {
      // localStorage might be unavailable
    }

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setTimeout(() => setVisible(true), SHOW_DELAY_MS)
    }

    window.addEventListener('beforeinstallprompt', handler as EventListener)
    return () => window.removeEventListener('beforeinstallprompt', handler as EventListener)
  }, [pathname])

  async function handleInstall() {
    if (!deferredPrompt || installing) return
    setInstalling(true)
    try {
      await deferredPrompt.prompt()
      const choice = await deferredPrompt.userChoice
      if (choice.outcome === 'accepted') {
        setVisible(false)
        setDeferredPrompt(null)
      } else {
        try {
          localStorage.setItem(DISMISS_KEY, String(Date.now()))
        } catch {}
        setVisible(false)
      }
    } finally {
      setInstalling(false)
    }
  }

  function handleDismiss() {
    setVisible(false)
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {}
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 80 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 80 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-w-md items-stretch justify-center px-4 pb-4 landscape:hidden"
        >
          <div className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-2xl">
            {/* Icon — admin-branded (ShieldCheck in dark-red gradient) */}
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-red-500 to-orange-500 text-white">
              <ShieldCheck className="h-6 w-6" />
            </span>
            {/* Text */}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-foreground">
                Install Apna Baithak Admin
              </p>
              <p className="text-xs text-muted-foreground">
                Add the admin dashboard to your home screen for faster access.
              </p>
            </div>
            {/* Install button */}
            <button
              onClick={handleInstall}
              disabled={installing}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-gradient-to-r from-red-500 to-orange-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              {installing ? 'Installing…' : 'Install'}
            </button>
            {/* Dismiss */}
            <button
              onClick={handleDismiss}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
