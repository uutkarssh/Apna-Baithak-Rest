import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSupabaseForUser } from '@/lib/supabase-server'

// GET /api/orders/[id]/upi/status
// Returns the current UPI payment state for the order — used by the customer
// payment screen to know whether to show the Pay button, the countdown, the
// upload form, the success message, or the pending-verification message.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
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

  // Get the latest attempt for this order
  const attempts = await db.paymentAttempt.findMany({
    where: { orderId },
    orderBy: { attemptNumber: 'desc' },
    take: 1,
  })
  const latestAttempt = attempts[0] ?? null

  // Auto-expire if the window has lapsed
  let activeAttempt = latestAttempt
  let effectiveUpiStatus = order.upiStatus
  if (latestAttempt && latestAttempt.status === 'AWAITING_SCREENSHOT') {
    const now = new Date()
    if (now.getTime() > latestAttempt.expiresAt.getTime()) {
      await db.paymentAttempt.update({
        where: { id: latestAttempt.id },
        data: { status: 'EXPIRED' },
      })
      if (order.upiStatus === 'AWAITING_SCREENSHOT') {
        await db.order.update({
          where: { id: orderId },
          data: { upiStatus: 'EXPIRED' },
        })
        effectiveUpiStatus = 'EXPIRED'
      }
      activeAttempt = { ...latestAttempt, status: 'EXPIRED' }
    }
  }

  return NextResponse.json({
    order: {
      id: order.id,
      orderNumber: order.orderNumber,
      totalAmount: order.totalAmount,
      paymentMode: order.paymentMode,
      upiStatus: effectiveUpiStatus,
    },
    attempt: activeAttempt
      ? {
          id: activeAttempt.id,
          attemptNumber: activeAttempt.attemptNumber,
          status: activeAttempt.status,
          upiTxnRef: activeAttempt.upiTxnRef,
          amount: activeAttempt.amount,
          payeeVpa: activeAttempt.payeeVpa,
          payeeName: activeAttempt.payeeName,
          startedAt: activeAttempt.startedAt,
          expiresAt: activeAttempt.expiresAt,
          screenshotUrl: activeAttempt.screenshotUrl,
          uploadedAt: activeAttempt.uploadedAt,
        }
      : null,
  })
}
