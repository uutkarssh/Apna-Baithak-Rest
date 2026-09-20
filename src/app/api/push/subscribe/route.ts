// POST /api/push/subscribe
//
// Body: {
//   subscription: { endpoint, keys: { p256dh, auth }, expirationTime? },
//   ownerType: 'admin' | 'customer'
// }
//
// - 'admin' subscriptions: requires the admin cookie (ab_admin=1). ownerId
//   is null — admin subscriptions are global, all admin browsers get all
//   new-order alerts.
// - 'customer' subscriptions: requires a valid Supabase session. ownerId is
//   set to the customer's row ID so we can target their subscriptions
//   specifically when their order status changes.
//
// Upserts on `endpoint` — re-subscribing the same browser updates the keys
// instead of creating duplicate rows. This is important because browsers
// re-subscribe on SW-scope changes / SW updates, and we don't want to
// accumulate dead duplicates.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSupabaseForUser } from '@/lib/supabase-server'
import { isAdminAuthorized } from '@/lib/admin-guard'
import { upsertSubscription } from '@/lib/push'

export async function POST(req: NextRequest) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { subscription, ownerType } = body ?? {}
  if (!subscription || typeof subscription !== 'object') {
    return NextResponse.json({ error: 'Missing subscription object' }, { status: 400 })
  }
  if (!subscription.endpoint || typeof subscription.endpoint !== 'string') {
    return NextResponse.json({ error: 'Missing subscription.endpoint' }, { status: 400 })
  }
  if (!subscription.keys?.p256dh || !subscription.keys?.auth) {
    return NextResponse.json(
      { error: 'Missing subscription.keys.p256dh or .auth' },
      { status: 400 }
    )
  }
  if (ownerType !== 'admin' && ownerType !== 'customer') {
    return NextResponse.json(
      { error: 'ownerType must be "admin" or "customer"' },
      { status: 400 }
    )
  }

  let ownerId: string | null = null

  if (ownerType === 'admin') {
    // Verify admin cookie
    if (!isAdminAuthorized(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    // ownerId stays null — admin subscriptions are global
  } else {
    // Customer: require valid Supabase session + look up Customer row
    const supabase = await getSupabaseForUser(req)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Sign in to enable order notifications' },
        { status: 401 }
      )
    }
    const customer = await db.customer.findUnique({
      where: { supabaseUserId: user.id },
      select: { id: true },
    })
    if (!customer) {
      return NextResponse.json(
        { error: 'Customer profile missing — cannot subscribe' },
        { status: 400 }
      )
    }
    ownerId = customer.id
  }

  try {
    const result = await upsertSubscription({
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      ownerType,
      ownerId,
    })
    return NextResponse.json({
      ok: true,
      id: result.id,
      created: result.created,
    })
  } catch (e: any) {
    console.error('[push/subscribe] error:', e)
    return NextResponse.json(
      { error: 'Failed to store subscription' },
      { status: 500 }
    )
  }
}
