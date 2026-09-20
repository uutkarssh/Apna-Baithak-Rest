'use client'

// CustomerPushOptIn — shown on the order-confirmation screen right after an
// order is placed. Asks the customer "Get notified when your order status
// changes?" with a clear Enable / Not now choice.
//
// Why here, not on page load:
//   - The user just placed an order — they have a concrete reason to want
//     notifications ("when will my food arrive?").
//   - Auto-prompting on first page load is silently blocked by browsers and
//     looks spammy.
//   - The post-order context is the highest-converting moment to ask.
//
// If the customer is already subscribed (e.g. they placed an order before),
// this component renders nothing — we don't pester them again.
//
// If push is unsupported (e.g. iOS Safari without PWA install, or desktop
// Firefox with notifications disabled OS-wide), this component renders
// nothing instead of showing a broken prompt.

import { Bell } from 'lucide-react'
import { usePushSubscription } from '@/hooks/use-push-subscription'
import { useAuth } from '@/components/providers/auth-provider'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useState } from 'react'

export function CustomerPushOptIn() {
  const push = usePushSubscription('customer')
  const { profile } = useAuth()

  // Read the dismissed-until timestamp ONCE on mount via lazy initial state —
  // avoids a useEffect + setState (which is a lint warning under React 19's
  // stricter rules) and is the canonical pattern for "read once at startup"
  // localStorage values.
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      const until = localStorage.getItem('ab-push-optin-dismissed-until')
      return !!(until && parseInt(until, 10) > Date.now())
    } catch {
      return false
    }
  })

  function dismiss() {
    setDismissed(true)
    try {
      // 7-day cool-down
      localStorage.setItem(
        'ab-push-optin-dismissed-until',
        String(Date.now() + 7 * 24 * 60 * 60 * 1000)
      )
    } catch {}
  }

  // Don't render if:
  //   - still loading push state
  //   - unsupported (incl. iOS without PWA install)
  //   - already subscribed
  //   - dismissed this session / within 7-day cool-down
  //   - profile not loaded yet (customer-only feature)
  if (
    push.status === 'loading' ||
    push.status === 'unsupported' ||
    push.status === 'permission-denied' ||
    push.status === 'subscribed' ||
    !profile ||
    dismissed
  ) {
    return null
  }

  async function handleEnable() {
    const r = await push.subscribe()
    if (!r.ok) {
      toast.error(r.error || 'Couldn\'t enable notifications')
      return
    }
    toast.success('Notifications on — you\'ll get a ping when your order status changes')
  }

  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-100 text-blue-700">
          <Bell className="h-5 w-5" />
        </span>
        <div className="flex-1">
          <p className="text-sm font-bold text-blue-900">Get order updates</p>
          <p className="mt-0.5 text-xs leading-relaxed text-blue-700">
            We&apos;ll send you a notification when your order is being prepared,
            out for delivery, and delivered. No spam — just this order.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={handleEnable}
              disabled={push.status === 'subscribing'}
              className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
            >
              {push.status === 'subscribing' ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Enabling…
                </>
              ) : (
                'Enable notifications'
              )}
            </button>
            <button
              onClick={dismiss}
              disabled={push.status === 'subscribing'}
              className="rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
