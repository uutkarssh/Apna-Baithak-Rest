'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, X, Smartphone } from 'lucide-react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'apna-baithak-install-dismissed'
const DISMISS_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000 // 3 days
const SHOW_DELAY_MS = 4000 // Show 4s after the user lands

/**
 * Customer PWA install prompt. Listens for the browser's `beforeinstallprompt`
 * event (fired when the browser determines the site is installable), then
 * shows a branded, dismissible banner inviting the user to install the
 * CUSTOMER app.
 *
 * Behavior:
 * - Only shows if the browser supports `beforeinstallprompt` (Chrome, Edge,
 *   etc. — NOT iOS Safari, which has its own "Add to Home Screen" flow).
 * - Shows 4 seconds after the user lands on the Home screen (not instantly).
 * - Dismissible — if dismissed, won't reappear for 3 days (stored in
 *   localStorage with a timestamp).
 * - If accepted, calls `event.prompt()` which shows the native install dialog.
 * - If the app is already installed (display-mode: standalone), never shows.
 *
 * IMPORTANT: this component is mounted in the ROOT layout, so it would
 * also fire on /admin — but the admin route has its own AdminInstallPrompt
 * with admin branding. We early-return when pathname starts with '/admin'
 * to avoid both prompts showing simultaneously on the admin dashboard.
 */
export function InstallPrompt() {
  const pathname = usePathname()
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    // Don't show the customer install prompt on admin routes — the admin
    // route has its own AdminInstallPrompt component with admin branding.
    if (pathname?.startsWith('/admin')) return

    // Don't show if already installed (running in standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) return
    // iOS Safari doesn't support beforeinstallprompt — skip entirely there.
    // (iOS users get the "Add to Home Screen" option from the Share menu.)

    // Check if the user dismissed recently
    try {
      const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || '0')
      if (dismissedAt && Date.now() - dismissedAt < DISMISS_COOLDOWN_MS) return
    } catch {
      // localStorage might be unavailable
    }

    const handler = (e: Event) => {
      // Prevent the default mini-info bar
      e.preventDefault()
      // Stash the event so it can be triggered later from the custom button
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      // Show the custom prompt after a short delay (so it doesn't feel
      // aggressive on first paint)
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
        // Installed — hide the prompt permanently
        setVisible(false)
        setDeferredPrompt(null)
      } else {
        // Dismissed — set the cooldown timestamp
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
            {/* Icon */}
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-softer">
              <Smartphone className="h-6 w-6 text-brand" />
            </span>
            {/* Text */}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-foreground">Install Apna Baithak</p>
              <p className="text-xs text-muted-foreground">
                Add to your home screen for faster ordering.
              </p>
            </div>
            {/* Install button */}
            <button
              onClick={handleInstall}
              disabled={installing}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-xs font-bold text-brand-foreground disabled:opacity-50"
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
