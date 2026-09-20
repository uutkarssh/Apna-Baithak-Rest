// POST /api/push/unsubscribe
//
// Body: { endpoint: string }
//
// Deletes the subscription with the given endpoint from the DB. Called when
// the user toggles "Enable push notifications" off. We don't need to verify
// ownership of the subscription — endpoints are unguessable random URLs
// issued by the push service, so only the browser that owns the subscription
// could know it. (Same security model as web-push itself.)
import { NextRequest, NextResponse } from 'next/server'
import { deleteSubscriptionByEndpoint } from '@/lib/push'

export async function POST(req: NextRequest) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { endpoint } = body ?? {}
  if (!endpoint || typeof endpoint !== 'string') {
    return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 })
  }

  try {
    await deleteSubscriptionByEndpoint(endpoint)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[push/unsubscribe] error:', e)
    return NextResponse.json(
      { error: 'Failed to remove subscription' },
      { status: 500 }
    )
  }
}
