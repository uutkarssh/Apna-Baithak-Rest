import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSupabaseForUser } from '@/lib/supabase-server'
import {
  UPI_CONFIG,
  buildUpiDeepLink,
  buildUpiTxnRef,
  generateQrDataUrl,
  PAYMENT_WINDOW_MS,
} from '@/lib/upi'

// POST /api/orders/[id]/upi/initiate
// Creates a new PaymentAttempt for the order, generates the UPI deep link +
// QR code, and returns everything the client needs to show the payment screen.
//
// The 5-minute countdown starts NOW (startedAt = now, expiresAt = now + 5min).
// Any previous AWAITING_SCREENSHOT attempt on this order is marked EXPIRED
// (so only one active attempt exists at a time).
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
  if (order.paymentMode !== 'UPI') {
    return NextResponse.json({ error: 'This order is not a UPI order.' }, { status: 400 })
  }
  // If already paid, don't allow a new attempt
  if (order.upiStatus === 'PAID') {
    return NextResponse.json({ error: 'This order is already paid.' }, { status: 400 })
  }
  // If pending verification, don't allow a new attempt — the admin must review
  // the existing screenshot first. (Prevents customer from bypassing review by
  // starting a fresh attempt.)
  if (order.upiStatus === 'PENDING_VERIFICATION') {
    return NextResponse.json(
      { error: 'This order is pending payment verification. Please wait for our team to confirm.' },
      { status: 400 }
    )
  }

  // Expire any previous AWAITING_SCREENSHOT attempt on this order
  await db.paymentAttempt.updateMany({
    where: { orderId, status: 'AWAITING_SCREENSHOT' },
    data: { status: 'EXPIRED' },
  })

  // Count existing attempts to compute the attempt number
  const attemptCount = await db.paymentAttempt.count({ where: { orderId } })
  const attemptNumber = attemptCount + 1
  const txnRef = buildUpiTxnRef(order.orderNumber, attemptNumber)

  const now = new Date()
  const expiresAt = new Date(now.getTime() + PAYMENT_WINDOW_MS)

  const payeeVpa = UPI_CONFIG.payeeId
  const payeeName = UPI_CONFIG.payeeName

  const attempt = await db.paymentAttempt.create({
    data: {
      orderId,
      attemptNumber,
      status: 'AWAITING_SCREENSHOT',
      upiTxnRef: txnRef,
      payeeVpa,
      payeeName,
      amount: order.totalAmount,
      expiresAt,
    },
  })

  // Update order to reflect that a payment attempt is in progress
  await db.order.update({
    where: { id: orderId },
    data: { upiStatus: 'AWAITING_SCREENSHOT' },
  })

  // Build the deep link + QR
  const deepLink = buildUpiDeepLink({
    payeeId: payeeVpa,
    payeeName,
    amount: order.totalAmount,
    txnRef,
    note: `Apna Baithak Order ${order.orderNumber}`,
  })
  const qrDataUrl = await generateQrDataUrl(deepLink)

  return NextResponse.json({
    attempt: {
      id: attempt.id,
      attemptNumber: attempt.attemptNumber,
      upiTxnRef: txnRef,
      amount: order.totalAmount,
      payeeVpa,
      payeeName,
      startedAt: attempt.startedAt,
      expiresAt: attempt.expiresAt,
    },
    deepLink,
    qrDataUrl,
  })
}
