'use client'

// AdminPushToggle — shows the admin a toggle to enable/disable Web Push
// notifications for their current browser. Also a "Send test notification"
// button to verify the round-trip works.
//
// The toggle is intentionally placed in the admin dashboard header next to
// the order-acceptance toggle — both are session-level settings that affect
// this admin browser only. Admin push subscriptions are global (all admin
// subscriptions receive all new-order alerts), but the act of subscribing
// is per-browser.
//
// iOS note: if the admin opens the dashboard in Safari on iPhone without
// installing the PWA, push will be silently unavailable — the toggle shows
// a friendly message about adding to home screen.

import { useState } from 'react'
import { Bell, BellOff, Loader2, Send } from 'lucide-react'
import { usePushSubscription } from '@/hooks/use-push-subscription'
import { toast } from 'sonner'

export function AdminPushToggle() {
  const push = usePushSubscription('admin')
  const [sendingTest, setSendingTest] = useState(false)

  async function handleToggle() {
    if (push.status === 'subscribed') {
      const r = await push.unsubscribe()
      if (!r.ok) toast.error(r.error || 'Failed to disable push')
      else toast.success('Push notifications disabled for this browser')
    } else if (push.status === 'not-subscribed') {
      const r = await push.subscribe()
      if (!r.ok) toast.error(r.error || 'Failed to enable push')
      else toast.success('Push notifications enabled — you\'ll get new-order alerts here')
    }
  }

  async function handleTest() {
    setSendingTest(true)
    try {
      const res = await fetch('/api/push/send-test', { method: 'POST' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        toast.error(j.error || 'Test failed')
        return
      }
      const data = await res.json()
      const r = data.result
      if (!r) {
        toast.error('No result returned')
        return
      }
      if (r.total === 0) {
        toast.info('No admin subscriptions registered — toggle push on first')
        return
      }
      toast.success(
        `Test sent — ${r.succeeded} delivered, ${r.failed} failed, ${r.cleaned} dead removed`
      )
    } catch (e: any) {
      toast.error(e?.message || 'Test failed')
    } finally {
      setSendingTest(false)
    }
  }

  // Hide entirely if push is unsupported on this browser
  if (push.status === 'unsupported' || push.status === 'loading') {
    // Still render a small idle button when loading so the header doesn't jump
    if (push.status === 'loading') {
      return (
        <button
          disabled
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-border px-2 py-1.5 text-xs font-semibold text-muted-foreground opacity-50"
          title="Checking push status…"
        >
          <Loader2 className="h-3 w-3 animate-spin" />
        </button>
      )
    }
    // Unsupported — don't render the toggle at all to avoid confusing the admin
    return null
  }

  const isSubscribed = push.status === 'subscribed'
  const inFlight = push.status === 'subscribing' || push.status === 'unsubscribing'

  return (
    <>
      <button
        onClick={handleToggle}
        disabled={inFlight}
        className={`shrink-0 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold transition disabled:opacity-50 ${
          isSubscribed
            ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
            : push.status === 'permission-denied'
            ? 'bg-muted text-muted-foreground'
            : 'bg-muted text-foreground hover:bg-muted/70'
        }`}
        title={
          push.status === 'permission-denied'
            ? 'Notifications blocked in browser settings'
            : isSubscribed
            ? 'Push is on — click to disable for this browser'
            : 'Click to enable push notifications on this browser'
        }
      >
        {inFlight ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : isSubscribed ? (
          <Bell className="h-3 w-3" />
        ) : (
          <BellOff className="h-3 w-3" />
        )}
        <span className="hidden sm:inline">
          {isSubscribed ? 'Push On' : push.status === 'permission-denied' ? 'Push Blocked' : 'Enable Push'}
        </span>
      </button>

      {isSubscribed && (
        <button
          onClick={handleTest}
          disabled={sendingTest}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-border px-2 py-1.5 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
          title="Send a test push to all admin subscriptions"
        >
          {sendingTest ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          <span className="hidden lg:inline">Test</span>
        </button>
      )}
    </>
  )
}
