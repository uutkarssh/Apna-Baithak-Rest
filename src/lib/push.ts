// Web Push (VAPID) server-side helper.
//
// Sends push notifications to all subscriptions matching a target (admin or
// a specific customer). Dead subscriptions are auto-cleaned: when web-push
// returns 403 / 404 / 410 for an endpoint, we delete the row from the DB so
// future sends don't waste time on dead subscriptions.
//
// === Critical design notes (from prior bug on sibling project) ===
// 1. NEVER throw from sendPush() — the calling order-flow code must keep
//    working even if every subscription fails. Errors are logged and the
//    function returns a result object.
// 2. Loop over ALL matching subscriptions in parallel; one failure must not
//    block notification to the others.
// 3. Dead-subscription cleanup is automatic, not manual — there is no admin
//    "clean subscriptions" button anywhere.
//
// Server-side ONLY — uses VAPID_PRIVATE_KEY which must NEVER be exposed to
// the client. The client reads NEXT_PUBLIC_VAPID_PUBLIC_KEY only.

import webpush from 'web-push'
import { db } from './db'

// Configure web-push once per process. setVapidDetails is idempotent so
// calling it again on a hot reload is fine.
//
// If env vars are missing (e.g. in a fresh dev environment), we skip
// configuration — sendPush() will then return a no-op result. This means
// the order flow keeps working even if push isn't set up yet.
let configured = false
function ensureConfigured() {
  if (configured) return true
  const subject = process.env.VAPID_SUBJECT
  const pub = process.env.VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (!subject || !pub || !priv) {
    return false
  }
  webpush.setVapidDetails(subject, pub, priv)
  configured = true
  return true
}

export type PushOwnerType = 'admin' | 'customer'

export type PushPayload = {
  title: string
  body: string
  url?: string
  // tag dedupes notifications in the system tray — set to the order ID
  // so a status update replaces the previous notification for the same order
  // (no stacking).
  tag?: string
}

export type SendPushResult = {
  target: PushOwnerType
  ownerId: string | null
  total: number
  succeeded: number
  failed: number
  cleaned: number // dead subscriptions removed
}

/**
 * Send a push notification to every subscription matching the target.
 *
 * @param target  'admin' (sends to all admin subscriptions) or 'customer'
 *                (sends to all subscriptions for that customer ID)
 * @param ownerId Required when target='customer'; ignored when target='admin'
 * @param payload Notification title/body/url/tag
 */
export async function sendPush(
  target: PushOwnerType,
  ownerId: string | null | undefined,
  payload: PushPayload
): Promise<SendPushResult> {
  const result: SendPushResult = {
    target,
    ownerId: ownerId ?? null,
    total: 0,
    succeeded: 0,
    failed: 0,
    cleaned: 0,
  }

  if (!ensureConfigured()) {
    // Push not configured — silently no-op. Don't crash the order flow.
    console.warn('[push] VAPID env vars missing — skipping send')
    return result
  }

  // Load matching subscriptions
  const where =
    target === 'admin'
      ? { ownerType: 'admin' as const }
      : { ownerType: 'customer' as const, ownerId: ownerId! }

  const subs = await db.pushSubscription.findMany({ where })
  result.total = subs.length

  if (subs.length === 0) {
    // No subscriptions for this target — not an error, just nothing to send to
    return result
  }

  // Send to all in parallel. Each send is wrapped in try/catch — one failure
  // must not block the others.
  const outcomes = await Promise.all(
    subs.map(async (sub) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      }
      try {
        await webpush.sendNotification(pushSubscription, JSON.stringify(payload))
        return { id: sub.id, ok: true, statusCode: 200 }
      } catch (err: any) {
        const statusCode = err?.statusCode ?? 0
        // 403 = forbidden (subscription revoked but not expired)
        // 404 = not found (subscription expired)
        // 410 = gone (subscription explicitly unsubscribed)
        // 400 = bad request (FCM uses this for malformed token format / invalid subscription)
        // All four are permanent — delete the row so future sends skip it.
        const isDead = [400, 403, 404, 410].includes(statusCode)
        return { id: sub.id, ok: false, statusCode, isDead, message: err?.message }
      }
    })
  )

  // Tally successes + failures
  for (const o of outcomes) {
    if (o.ok) {
      result.succeeded++
    } else {
      result.failed++
    }
  }

  // Clean up dead subscriptions — do this in a single batch after the sends
  // complete so we don't block the parallel sends on individual DB deletes.
  const deadIds = outcomes
    .filter((o) => !o.ok && (o as any).isDead)
    .map((o) => o.id)

  if (deadIds.length > 0) {
    try {
      const deleteResult = await db.pushSubscription.deleteMany({
        where: { id: { in: deadIds } },
      })
      result.cleaned = deleteResult.count
      console.log(
        `[push] cleaned ${result.cleaned} dead subscription(s) for ${target}` +
          (ownerId ? `/${ownerId.slice(-6)}` : '')
      )
    } catch (e) {
      console.error('[push] failed to clean dead subscriptions:', e)
    }
  }

  // Log a one-line summary (not per-sub errors — those would spam the logs)
  if (result.failed > 0) {
    const nonDeadFails = outcomes.filter(
      (o) => !o.ok && !(o as any).isDead
    ).length
    if (nonDeadFails > 0) {
      console.error(
        `[push] ${nonDeadFails} send(s) failed (non-permanent errors) for ${target}` +
          (ownerId ? `/${ownerId.slice(-6)}` : '')
      )
    }
  }

  return result
}

/**
 * Upsert a subscription by endpoint. If the endpoint already exists (same
 * browser re-subscribing), update the keys + ownerId rather than creating a
 * duplicate row. The endpoint is the natural unique identifier for a
 * subscription — PushManager.subscribe() returns the same endpoint for the
 * same browser+SW-scope pair until site data is cleared.
 */
export async function upsertSubscription(params: {
  endpoint: string
  p256dh: string
  auth: string
  ownerType: PushOwnerType
  ownerId?: string | null
}): Promise<{ id: string; created: boolean }> {
  const existing = await db.pushSubscription.findUnique({
    where: { endpoint: params.endpoint },
  })

  if (existing) {
    // Update keys + ownerId in case they changed (rare but possible)
    await db.pushSubscription.update({
      where: { id: existing.id },
      data: {
        p256dh: params.p256dh,
        auth: params.auth,
        ownerType: params.ownerType,
        ownerId: params.ownerId ?? null,
        lastFailedAt: null, // reset on resubscribe
      },
    })
    return { id: existing.id, created: false }
  }

  const created = await db.pushSubscription.create({
    data: {
      endpoint: params.endpoint,
      p256dh: params.p256dh,
      auth: params.auth,
      ownerType: params.ownerType,
      ownerId: params.ownerId ?? null,
    },
  })
  return { id: created.id, created: true }
}

/**
 * Delete a subscription by endpoint. Called when the client explicitly
 * unsubscribes (user toggled "Enable push" off).
 */
export async function deleteSubscriptionByEndpoint(endpoint: string): Promise<void> {
  await db.pushSubscription.deleteMany({ where: { endpoint } })
}

// ===== Convenience wrappers for the order flow =====
// These mirror the existing telegram.ts notify* helpers so the order flow
// can call both side-by-side from the same trigger point without drift.

/**
 * Notify ALL admin subscriptions that a new order has been placed.
 * Mirrors notifyNewOrder() in telegram.ts — call them together from
 * /api/checkout so admin gets alerts on both channels simultaneously.
 */
export async function notifyAdminsNewOrder(params: {
  orderNumber: string
  totalAmount: number
  customerName: string
  paymentMode: string
  orderId: string
}): Promise<SendPushResult> {
  const paymentSuffix =
    params.paymentMode === 'UPI' ? ' · UPI pending' : ' · COD'
  return sendPush('admin', null, {
    title: `🆕 New Order ${params.orderNumber}`,
    body: `${params.customerName} · ₹${params.totalAmount}${paymentSuffix}`,
    url: `/admin?order=${params.orderId}`,
    tag: `new-order-${params.orderId}`,
  })
}

/**
 * Notify a customer that their order's status changed.
 * Mirrors the admin order-status PATCH in /api/admin/orders/[id]/route.ts.
 * If the customer has no subscription, this is a no-op (no error).
 */
export async function notifyCustomerOrderStatus(params: {
  customerId: string
  orderId: string
  orderNumber: string
  status: string
}): Promise<SendPushResult> {
  const messages: Record<string, { title: string; body: string }> = {
    PREPARING: {
      title: '👨‍🍳 Order is being prepared',
      body: `Your order ${params.orderNumber} is now in the kitchen.`,
    },
    OUT_FOR_DELIVERY: {
      title: '🛵 Out for delivery',
      body: `Your order ${params.orderNumber} is on its way!`,
    },
    DELIVERED: {
      title: '✅ Order delivered',
      body: `Your order ${params.orderNumber} has been delivered. Enjoy!`,
    },
    CANCELLED: {
      title: '❌ Order cancelled',
      body: `Your order ${params.orderNumber} has been cancelled. Please call us if you have questions.`,
    },
    NEW: {
      title: '📦 Order received',
      body: `We've received your order ${params.orderNumber}. We'll start preparing it shortly.`,
    },
  }
  const msg = messages[params.status]
  if (!msg) {
    // Unknown status — no-op
    return {
      target: 'customer',
      ownerId: params.customerId,
      total: 0,
      succeeded: 0,
      failed: 0,
      cleaned: 0,
    }
  }

  return sendPush('customer', params.customerId, {
    title: msg.title,
    body: msg.body,
    url: `/?view=orders&order=${params.orderId}`,
    tag: `order-${params.orderId}`,
  })
}

/**
 * Notify admin that a UPI payment is pending manual verification.
 * Called from the same trigger point as notifyPaymentPendingManual in telegram.ts.
 */
export async function notifyAdminsPaymentPending(params: {
  orderNumber: string
  totalAmount: number
  orderId: string
}): Promise<SendPushResult> {
  return sendPush('admin', null, {
    title: `⚠️ UPI Payment Pending Review`,
    body: `Order ${params.orderNumber} · ₹${params.totalAmount} — needs manual verification`,
    url: `/admin?filter=upi-review&order=${params.orderId}`,
    tag: `upi-pending-${params.orderId}`,
  })
}

/**
 * Notify admin + customer that a UPI payment was verified/received.
 * Customer side: optional — only if they have a subscription.
 * Admin side: mirrors notifyPaymentReceived in telegram.ts.
 */
export async function notifyPaymentReceivedBoth(params: {
  orderId: string
  orderNumber: string
  totalAmount: number
  customerId: string | null
}): Promise<{ admin: SendPushResult; customer: SendPushResult }> {
  const admin = await sendPush('admin', null, {
    title: `✅ Payment Received — ${params.orderNumber}`,
    body: `₹${params.totalAmount} via UPI`,
    url: `/admin?order=${params.orderId}`,
    tag: `payment-${params.orderId}`,
  })

  // Customer notification (best-effort)
  const customer = params.customerId
    ? await sendPush('customer', params.customerId, {
        title: '✅ Payment confirmed',
        body: `Your payment for order ${params.orderNumber} has been verified. We're starting preparation!`,
        url: `/?view=orders&order=${params.orderId}`,
        tag: `order-${params.orderId}`,
      })
    : {
        target: 'customer' as const,
        ownerId: null,
        total: 0,
        succeeded: 0,
        failed: 0,
        cleaned: 0,
      }

  return { admin, customer }
}
