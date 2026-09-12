import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSupabaseForUser } from '@/lib/supabase-server'
import { notifyPaymentPendingManual } from '@/lib/telegram'

// POST /api/orders/[id]/upi/manual
// Customer chose "Continue without screenshot" — they claim to have paid but
// can't/won't upload a screenshot (e.g. GPay screenshot blocked, phone issue,
// etc.). Marks the order as PENDING_VERIFICATION with a flag indicating it's
// a manual-review request (no screenshot), and fires a Telegram alert with
// inline Verify/Reject buttons so the admin can act in one tap.
//
// Body: { attemptId: string }
//
// This NEVER marks the order as paid — it only routes it to manual review.
// The customer sees a reassuring message: "Your order is placed and pending
// manual verification. If you've paid, don't worry — our team will confirm."
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await getSupabaseForUser(req)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })
  }

  const customer = await db.customer.findUnique({ where: { supabaseUserId: user.id } })
  if (!customer) {
    return NextResponse.json({ error: 'Customer profile missing.' }, { status: 400 })
  }

  const { id: orderId } = await ctx.params
  const order = await db.order.findUnique({ where: { id: orderId } })
  if (!order) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  }
  if (order.customerId !== customer.id) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  }
  // If already paid or already pending, don't allow a duplicate request
  if (order.upiStatus === 'PAID') {
    return NextResponse.json({ error: 'This order is already paid.' }, { status: 400 })
  }
  if (order.upiStatus === 'PENDING_VERIFICATION') {
    return NextResponse.json(
      { outcome: 'PENDING_VERIFICATION', message: 'Already pending verification.' },
      { status: 200 }
    )
  }

  const body = await req.json().catch(() => ({}))
  const attemptId = body.attemptId as string | undefined

  // Find the active attempt (if any)
  let attempt = null as any
  if (attemptId) {
    attempt = await db.paymentAttempt.findUnique({ where: { id: attemptId } })
    if (!attempt || attempt.orderId !== orderId) {
      return NextResponse.json({ error: 'Invalid attempt.' }, { status: 400 })
    }
  } else {
    // Fall back to the latest attempt for this order
    const attempts = await db.paymentAttempt.findMany({
      where: { orderId },
      orderBy: { attemptNumber: 'desc' },
      take: 1,
    })
    attempt = attempts[0] ?? null
  }

  const now = new Date()

  // Mark the attempt (if any) as REJECTED with a note that the customer chose
  // manual review instead of uploading
  if (attempt) {
    await db.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: 'REJECTED',
        failedChecks: 'customer_manual_review',
        geminiReasoning: 'Customer chose "Continue without screenshot" — manual verification requested.',
        uploadedAt: now,
      },
    })
  }

  // Mark the order as PENDING_VERIFICATION with no screenshot
  await db.order.update({
    where: { id: orderId },
    data: {
      upiStatus: 'PENDING_VERIFICATION',
      upiScreenshotUrl: null,
      upiVerificationResult: JSON.stringify({
        manual_review_requested: true,
        reason: 'Customer continued without uploading a screenshot',
        requested_at: now.toISOString(),
        attempt_id: attempt?.id ?? null,
      }),
    },
  })

  // Fire Telegram alert with inline Verify/Reject buttons
  notifyPaymentPendingManual(orderId).catch((e) =>
    console.error('[upi/manual] telegram notify error:', e)
  )

  return NextResponse.json({
    outcome: 'PENDING_VERIFICATION',
    message:
      "Your order is placed and pending manual verification. If you've completed the payment, don't worry — our team will confirm it shortly. You can track your order status anytime.",
  })
}
