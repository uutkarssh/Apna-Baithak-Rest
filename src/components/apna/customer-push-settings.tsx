'use client'

// CustomerPushSettings — profile-page section where the customer can enable
// or disable Web Push notifications at any time.
//
// This is the "more option" the user requested — a persistent toggle for
// customers who:
//   - Dismissed the post-order opt-in card ("Not now")
//   - Never placed an order (so never saw the post-order card)
//   - Cleared site data and lost their subscription
//   - Previously blocked notifications and want to retry
//
// The component intentionally handles every push state explicitly so the
// customer always sees something useful (never a blank section or a stuck
// "checking…" spinner):
//
//   loading              → render nothing (avoid layout shift while SW initializes)
//   unsupported          → render nothing (push not available on this browser;
//                          showing a "broken" section would just confuse)
//   iOS-without-PWA      → show "Install for notifications" hint with steps
//   permission-denied    → show "Notifications blocked" + how to unblock in
//                          browser settings
//   not-subscribed       → show "Enable" button
//   subscribed           → show "On" with "Turn off" button
//   error                → show the error message inline + retry by clicking
//                          Enable again
//
// Auth requirement: the customer must be logged in. The hook's subscribe()
// call POSTs to /api/push/subscribe with ownerType=customer which requires a
// valid Supabase session + Customer row. If the user isn't logged in, this
// whole section is hidden (the parent ProfileView only renders for logged-in
// customers, but we double-check here defensively).

import { useState } from 'react'
import { Bell, BellOff, Loader2, Smartphone, AlertCircle } from 'lucide-react'
import { usePushSubscription } from '@/hooks/use-push-subscription'
import { useAuth } from '@/components/providers/auth-provider'
import { toast } from 'sonner'
import { dismissCustomerPushHomePrompt } from '@/components/apna/customer-push-home-prompt'

export function CustomerPushSettings() {
  const push = usePushSubscription('customer')
  const { profile } = useAuth()
  // Track whether we've shown the iOS-no-PWA hint — without this, on every
  // refresh the hint would re-appear even if the user already read it. We
  // stash a 30-day dismissal in localStorage.
  const [iosHintDismissed, setIosHintDismissed] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      const until = localStorage.getItem('ab-push-ios-hint-dismissed-until')
      return !!(until && parseInt(until, 10) > Date.now())
    } catch {
      return false
    }
  })

  // Hide for unauthed users — push.subscribe() for ownerType=customer needs
  // a Supabase session + Customer row.
  if (!profile) return null

  // While loading, render nothing to avoid a layout shift.
  if (push.status === 'loading') return null

  // Detect iOS Safari without PWA install — push only works on iOS when the
  // PWA is installed to the home screen (Apple's restriction, not ours).
  const isIOS =
    typeof navigator !== 'undefined' &&
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as any).MSStream
  const isStandalone =
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true)
  const isIOSWithoutPWA = isIOS && !isStandalone

  function dismissIosHint() {
    setIosHintDismissed(true)
    try {
      localStorage.setItem(
        'ab-push-ios-hint-dismissed-until',
        String(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30-day cool-down
      )
    } catch {}
  }

  // iOS without PWA install — show a one-time "Add to Home Screen" hint
  // (unless the user previously dismissed it within 30 days).
  if (isIOSWithoutPWA && !iosHintDismissed && push.status !== 'subscribed') {
    return (
      <section className="mt-6 px-4">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Notifications
        </h2>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700">
              <Smartphone className="h-5 w-5" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-900">Install for notifications</p>
              <p className="mt-0.5 text-xs leading-relaxed text-amber-800">
                On iPhone/iPad, push notifications only work when the app is installed to your home screen. Tap the Share button → &ldquo;Add to Home Screen&rdquo;, then open Apna Baithak from the home screen icon and try again.
              </p>
              <button
                onClick={dismissIosHint}
                className="mt-2 rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-100"
              >
                Got it, hide this
              </button>
            </div>
          </div>
        </div>
      </section>
    )
  }

  // Push not supported on this browser (e.g. desktop Firefox with notifications
  // disabled OS-wide, or a browser that doesn't implement PushManager).
  if (push.status === 'unsupported') {
    // Don't render the section at all — showing a broken-state row would
    // just confuse the customer ("why is this here if it doesn't work?").
    return null
  }

  // Permission previously denied by the user. Browser won't re-prompt —
  // the user has to manually unblock in site settings, so we tell them how.
  if (push.status === 'permission-denied') {
    return (
      <section className="mt-6 px-4">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Notifications
        </h2>
        <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
              <BellOff className="h-5 w-5" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-bold text-foreground">Notifications blocked</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                You previously blocked notifications. To re-enable, open your browser&rsquo;s Site Settings for this site → Notifications → Allow, then come back here and tap the button below.
              </p>
              <button
                onClick={() => push.refresh()}
                className="mt-2 rounded-full border border-border px-3 py-1 text-[11px] font-semibold text-foreground hover:bg-muted"
              >
                I&rsquo;ve allowed it — recheck
              </button>
            </div>
          </div>
        </div>
      </section>
    )
  }

  // Subscribed — show "On" state with a Turn Off button.
  // push.unsubscribe() will internally transition through 'unsubscribing' state,
  // but at this render point the status is 'subscribed'.
  if (push.status === 'subscribed') {
    return (
      <section className="mt-6 px-4">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Notifications
        </h2>
        <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-700">
              <Bell className="h-5 w-5" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-bold text-foreground">Order updates are on</p>
              <p className="text-xs text-muted-foreground">
                You&rsquo;ll get a ping when your order is being prepared, out for delivery, and delivered.
              </p>
            </div>
            <button
              onClick={async () => {
                const r = await push.unsubscribe()
                if (!r.ok) {
                  toast.error(r.error || 'Couldn\'t turn off notifications')
                } else {
                  toast.success('Notifications turned off')
                }
              }}
              className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
            >
              Turn off
            </button>
          </div>
        </div>
      </section>
    )
  }

  // Default state: not-subscribed (or error, or unsupported-with-error).
  // Show the Enable button. Errors are shown inline below the row so the user
  // can see what went wrong without losing the ability to retry.
  //
  // We track the in-flight subscribe state separately because the hook's
  // `status` field can be 'not-subscribed' or 'error' at render time, but
  // `subscribe()` is async — we want the button to show "Enabling…" while
  // the subscribe call is in flight.
  const showError = push.status === 'error' && push.error
  return (
    <section className="mt-6 px-4">
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Notifications
      </h2>
      <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-softer text-brand">
            <Bell className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-bold text-foreground">Order updates</p>
            <p className="text-xs text-muted-foreground">
              Get a ping when your order status changes.
            </p>
          </div>
          <button
            onClick={async () => {
              const r = await push.subscribe()
              if (!r.ok) {
                toast.error(r.error || 'Couldn\'t enable notifications')
              } else {
                toast.success('Notifications on — you\'ll get order status updates')
                // Cross-dismiss the home-screen banner so it doesn't keep
                // asking after they've already opted in from the profile page.
                dismissCustomerPushHomePrompt()
              }
            }}
            disabled={push.status === 'subscribing'}
            className="shrink-0 rounded-full bg-brand px-4 py-1.5 text-xs font-bold text-brand-foreground shadow-sm transition hover:brightness-105 active:scale-95 disabled:opacity-50"
          >
            {push.status === 'subscribing' ? (
              <span className="flex items-center gap-1">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Enabling…
              </span>
            ) : (
              'Enable'
            )}
          </button>
        </div>
        {showError && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 p-2.5 text-xs text-red-700">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="flex-1">{push.error}</span>
          </div>
        )}
      </div>
    </section>
  )
}
