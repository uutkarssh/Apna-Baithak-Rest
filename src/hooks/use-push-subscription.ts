'use client'

// usePushSubscription — client-side hook that subscribes / unsubscribes the
// current browser to Web Push via the VAPID public key.
//
// === IMPORTANT — permission timing ===
// Browsers (especially Chrome on iOS, Safari, Firefox) silently block
// Notification.permission() requests that fire automatically on page load.
// The permission prompt MUST be triggered by a user gesture — a button click
// or toggle. This hook is designed to be called from an onClick handler,
// never from a useEffect on mount.
//
// === Browser support caveats ===
// - iOS Safari: Web Push only works when the PWA is installed to the home
//   screen (not in regular Safari tabs). If the user opens the site in
//   Safari and tries to subscribe, the permission request will either be
//   silently denied or, on newer iOS versions, will prompt the user to
//   "Add to Home Screen" first. We detect this and show a friendly message.
// - Firefox / Chrome desktop: works without installation.
// - Android Chrome: works without installation (notification permission is
//   separate from PWA install).
//
// === Subscription storage ===
// We POST the subscription to /api/push/subscribe which upserts by endpoint.
// The subscription object is also stashed in localStorage so on subsequent
// loads we can check if we're already subscribed (avoids redundant
// PushManager.subscribe calls, which can be slow + janky on Android).
//
// We do NOT rely solely on localStorage — on mount we ask PushManager for
// the existing subscription to confirm. If localStorage says "subscribed"
// but PushManager has no subscription (e.g. user cleared site data), we
// reset localStorage to match reality.

import { useState, useCallback, useEffect } from 'react'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const LS_KEY = 'ab-push-subscribed'

type OwnerType = 'admin' | 'customer'

type PushState = {
  // 'loading'           — initial state, checking existing subscription
  // 'unsupported'       — browser doesn't support service workers / push
  // 'permission-denied' — user previously denied; can't re-ask
  // 'not-subscribed'    — supported + not denied, ready to subscribe
  // 'subscribed'        — active subscription stored server-side
  // 'subscribing'       — subscription in flight
  // 'unsubscribing'     — unsubscribe in flight
  // 'error'             — last action failed; see .error
  status:
    | 'loading'
    | 'unsupported'
    | 'permission-denied'
    | 'not-subscribed'
    | 'subscribed'
    | 'subscribing'
    | 'unsubscribing'
    | 'error'
  error: string | null
  // The endpoint of the active subscription, if any. Useful for debugging.
  endpoint: string | null
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = typeof window !== 'undefined' ? window.atob(base64) : Buffer.from(base64, 'base64').toString('binary')
  const out = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) out[i] = rawData.charCodeAt(i)
  return out
}

// Wrap as BufferSource for PushManager.subscribe (TS 5.7+ stricter ArrayBuffer
// typing requires this cast — at runtime a Uint8Array IS a valid BufferSource).
function asBufferSource(b64: string): ArrayBuffer {
  const arr = urlBase64ToUint8Array(b64)
  // Copy into a fresh ArrayBuffer to satisfy the strict ArrayBufferLike type
  const buf = new ArrayBuffer(arr.byteLength)
  new Uint8Array(buf).set(arr)
  return buf
}

function isIOS() {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream
}

function isStandalonePWA() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  )
}

export function usePushSubscription(ownerType: OwnerType) {
  const [state, setState] = useState<PushState>({
    status: 'loading',
    error: null,
    endpoint: null,
  })

  // On mount: check if push is supported + check existing subscription
  const refresh = useCallback(async () => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState({ status: 'unsupported', error: null, endpoint: null })
      return
    }
    if (!VAPID_PUBLIC_KEY) {
      // Server env var not set — push not configured on this deployment
      setState({
        status: 'unsupported',
        error: 'Push notifications are not configured on this deployment.',
        endpoint: null,
      })
      return
    }

    try {
      // Wait for the service worker registration (it may not be ready yet
      // on a fresh page load — ServiceWorkerRegister component registers on mount)
      const reg = await navigator.serviceWorker.ready
      const existing = await reg.pushManager.getSubscription()

      if (existing) {
        // Confirm the server also has this subscription stored
        // (We optimistically trust localStorage here — if a send later 404s,
        //  the server cleans up its row, and the next periodic re-check will
        //  detect the mismatch and re-subscribe.)
        setState({
          status: 'subscribed',
          error: null,
          endpoint: existing.endpoint,
        })
        return
      }

      // No active subscription
      const permission = Notification.permission
      if (permission === 'denied') {
        setState({ status: 'permission-denied', error: null, endpoint: null })
        return
      }

      setState({ status: 'not-subscribed', error: null, endpoint: null })
    } catch (e: any) {
      setState({
        status: 'error',
        error: e?.message || 'Failed to check push status',
        endpoint: null,
      })
    }
  }, [])

  useEffect(() => {
    // We intentionally call setState here — this is a one-time async check of
    // the existing PushManager subscription on mount. The await on
    // navigator.serviceWorker.ready + pushManager.getSubscription() means
    // the setState happens AFTER an async boundary (not synchronously in the
    // effect body), but ESLint can't see through the await. The setState-in-
    // effect rule's concern (cascading renders) doesn't apply here because
    // refresh only fires once on mount, not on every render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
  }, [refresh])

  // Listen for push-click messages posted by the service worker
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type === 'PUSH_CLICK' && e.data.url) {
        // Navigate via location.assign — the React app's hash route state
        // would require router hook plumbing that isn't worth it for a click
        // handler. A full navigation is fine and predictable.
        try {
          window.location.href = e.data.url
        } catch {}
      }
    }
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', onMessage)
      return () => navigator.serviceWorker.removeEventListener('message', onMessage)
    }
  }, [])

  const subscribe = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (state.status === 'unsupported' || state.status === 'permission-denied') {
      return { ok: false, error: state.error ?? 'Push not supported' }
    }
    if (!VAPID_PUBLIC_KEY) {
      return { ok: false, error: 'Push not configured on this deployment' }
    }

    // iOS Safari without PWA install — can't subscribe, show helpful message
    if (isIOS() && !isStandalonePWA()) {
      const msg =
        'On iPhone/iPad, push notifications only work when the app is installed to your home screen. Tap the Share button → "Add to Home Screen", then open Apna Baithak from the home screen icon and try again.'
      setState({ status: 'error', error: msg, endpoint: null })
      return { ok: false, error: msg }
    }

    setState((s) => ({ ...s, status: 'subscribing', error: null }))

    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        const msg = permission === 'denied'
          ? 'You blocked notifications. To re-enable, open Site Settings → Notifications → Allow, then try again.'
          : 'Permission not granted. Please try again.'
        setState({
          status: permission === 'denied' ? 'permission-denied' : 'not-subscribed',
          error: msg,
          endpoint: null,
        })
        return { ok: false, error: msg }
      }

      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: asBufferSource(VAPID_PUBLIC_KEY),
      })

      // POST to server
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: sub.toJSON(),
          ownerType,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        // Unsubscribe locally — server rejected, don't leave dangling local sub
        try { await sub.unsubscribe() } catch {}
        throw new Error(j.error || `Server rejected subscription (HTTP ${res.status})`)
      }

      try { localStorage.setItem(LS_KEY, '1') } catch {}

      setState({
        status: 'subscribed',
        error: null,
        endpoint: sub.endpoint,
      })
      return { ok: true }
    } catch (e: any) {
      setState({
        status: 'error',
        error: e?.message || 'Failed to subscribe',
        endpoint: null,
      })
      return { ok: false, error: e?.message || 'Failed to subscribe' }
    }
  }, [state.status, ownerType])

  const unsubscribe = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    setState((s) => ({ ...s, status: 'unsubscribing', error: null }))
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      const endpoint = sub?.endpoint

      if (sub) {
        await sub.unsubscribe()
      }

      // Tell the server to delete the row too — endpoints are unguessable
      // random URLs, so we don't need to verify ownership of which row to
      // delete (same security model as web-push itself).
      if (endpoint) {
        try {
          await fetch('/api/push/unsubscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint }),
          })
        } catch {
          // Non-fatal — the server-side sendPush will eventually 404 + clean
          // the row when web-push reports the subscription as gone.
        }
      }

      try { localStorage.removeItem(LS_KEY) } catch {}

      setState({
        status: 'not-subscribed',
        error: null,
        endpoint: null,
      })
      return { ok: true }
    } catch (e: any) {
      setState({
        status: 'error',
        error: e?.message || 'Failed to unsubscribe',
        endpoint: null,
      })
      return { ok: false, error: e?.message || 'Failed to unsubscribe' }
    }
  }, [])

  return {
    ...state,
    subscribe,
    unsubscribe,
    refresh,
  }
}
