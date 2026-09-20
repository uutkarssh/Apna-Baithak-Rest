'use client'

// CustomerPushHomePrompt — dismissible opt-in banner shown on the home screen
// inviting the customer to enable push notifications.
//
// === Why a banner on home, not just profile ===
// Most customers never visit their profile. Without a visible prompt on the
// home screen, the majority of customers will never enable push — even though
// the post-order opt-in card exists, it only fires after their first order,
// and even then a lot of people dismiss it. This banner gives them another
// visible entry point the moment they land on the site.
//
// === Anti-annoyance rules ===
// The banner WILL NOT show if any of these are true:
//   - Customer is not logged in (push.subscribe needs a customer row)
//   - Push is unsupported on this browser (e.g. iOS Safari without PWA install,
//     or a browser that doesn't implement PushManager)
//   - Customer previously denied notification permission (browser won't re-prompt)
//   - Customer is already subscribed
//   - Customer previously dismissed this banner (14-day cool-down)
//   - The hook is still loading (avoid layout shift while SW initializes)
//
// === The actual permission prompt ===
// Browsers silently block Notification.requestPermission() that fires
// automatically on page load. The banner's Enable button is a USER GESTURE —
// clicking it is what triggers the actual browser permission prompt. So we
// never auto-prompt; we show a UI card that requires a tap before asking.
//
// === Visibility strategy ===
// To avoid being obnoxious on every page load, the banner only shows on the
// home view (not on category/item/cart/etc.), and only after the customer
// has been on the page for ~2 seconds (so it doesn't flash before content
// paints). The 14-day dismissal is sticky across sessions.

import { useEffect, useState } from 'react'
import { Bell, X, Loader2, CheckCircle2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { usePushSubscription } from '@/hooks/use-push-subscription'
import { useAuth } from '@/components/providers/auth-provider'
import { toast } from 'sonner'

const DISMISS_KEY = 'ab-push-home-prompt-dismissed-until'
const DISMISS_MS = 14 * 24 * 60 * 60 * 1000 // 14 days
const SHOW_DELAY_MS = 2000 // show 2s after mount so it doesn't flash

export function CustomerPushHomePrompt() {
  const push = usePushSubscription('customer')
  const { profile, loading: authLoading } = useAuth()

  // Delayed visibility — wait a bit after mount so the banner doesn't
  // appear before the rest of the home page paints.
  const [delayElapsed, setDelayElapsed] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setDelayElapsed(true), SHOW_DELAY_MS)
    return () => clearTimeout(t)
  }, [])

  // 14-day dismissal — read once on mount via lazy initial state.
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return true // SSR: don't show, hydrate will reconcile
    try {
      const until = localStorage.getItem(DISMISS_KEY)
      return !!(until && parseInt(until, 10) > Date.now())
    } catch {
      return false
    }
  })

  function dismiss() {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_MS))
    } catch {}
  }

  // Don't render if any condition isn't met.
  // Order matters — check the cheapest conditions first.
  if (!delayElapsed) return null
  if (dismissed) return null
  if (authLoading) return null
  if (!profile) return null // customer must be logged in
  // Push hook states that should hide the banner:
  if (push.status === 'loading') return null // still checking — wait
  if (push.status === 'unsupported') return null // can't push on this browser
  if (push.status === 'permission-denied') return null // can't re-ask
  if (push.status === 'subscribed') return null // already on — no need to ask
  if (push.status === 'subscribing') {
    // Show a "Enabling…" state in place of the Enable button
    return (
      <PromptCard
        disabled
        primaryLabel={
          <span className="flex items-center gap-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Enabling…
          </span>
        }
        onPrimary={() => {}}
        onDismiss={() => {}}
      />
    )
  }

  // 'not-subscribed' or 'error' → show the prompt
  return (
    <PromptCard
      onPrimary={async () => {
        const r = await push.subscribe()
        if (!r.ok) {
          toast.error(r.error || 'Couldn\'t enable notifications')
        } else {
          toast.success('Notifications on — you\'ll get order status updates')
          // Auto-dismiss the banner since the customer has now enabled push.
          // They can manage it from Profile → Notifications if they want to turn off.
          setDismissed(true)
        }
      }}
      onDismiss={dismiss}
    />
  )
}

function PromptCard({
  onPrimary,
  onDismiss,
  primaryLabel = 'Enable',
  disabled = false,
}: {
  onPrimary: () => void
  onDismiss: () => void
  primaryLabel?: React.ReactNode
  disabled?: boolean
}) {
  return (
    <AnimatePresence>
      <motion.section
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.25 }}
        className="px-4 sm:px-0"
        aria-label="Enable order notifications"
      >
        <div className="relative overflow-hidden rounded-2xl border border-brand/20 bg-gradient-to-br from-brand-softer to-white p-4 shadow-sm">
          <button
            onClick={onDismiss}
            className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-muted"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-start gap-3 pr-6">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand/10 text-brand">
              <Bell className="h-5 w-5" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-bold text-foreground">
                Get order updates
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                We&apos;ll ping you when your order is being prepared, out for delivery, and delivered. No spam — just your order status.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={onPrimary}
                  disabled={disabled}
                  className="inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-1.5 text-xs font-bold text-brand-foreground shadow-sm transition hover:brightness-105 active:scale-95 disabled:opacity-50"
                >
                  {primaryLabel}
                </button>
                <button
                  onClick={onDismiss}
                  className="rounded-full border border-border px-4 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
                >
                  Not now
                </button>
              </div>
            </div>
          </div>
        </div>
      </motion.section>
    </AnimatePresence>
  )
}

// Tiny exported helper so other parts of the app can check whether the
// customer has dismissed the home prompt (e.g. to show it elsewhere if
// desired). Not currently used outside this file.
export function isCustomerPushHomePromptDismissed(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const until = localStorage.getItem(DISMISS_KEY)
    return !!(until && parseInt(until, 10) > Date.now())
  } catch {
    return false
  }
}

// Exported so other parts can mark the prompt dismissed (e.g. after the
// customer enables push from the post-order opt-in card, we don't want to
// show the home banner anymore — they're already subscribed).
export function dismissCustomerPushHomePrompt() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_MS))
  } catch {}
}

// Re-export CheckCircle2 to keep the import-graph clean (not currently used
// here, but reserved for a future "Subscribed!" success state if we add one).
export { CheckCircle2 }
