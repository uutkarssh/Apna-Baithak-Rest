import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdminAuthorized } from '@/lib/admin-guard'
import { notifyPaymentReceived } from '@/lib/telegram'

// PATCH /api/admin/orders/[id]/upi-review
// Admin manually reviews a PENDING_VERIFICATION UPI order and either approves
// or rejects it.
//
// Body: { action: "approve" | "reject", note?: string }
//
// approve → mark order PAID (paymentReceived=true, method=UPI), fire Telegram.
// reject  → keep order as-is but flag it (upiStatus stays PENDING_VERIFICATION,
//           adminNote records the rejection reason for follow-up).
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: orderId } = await ctx.params
  const body = await req.json()
  const action = body.action as 'approve' | 'reject' | undefined
  const note = (body.note as string | undefined)?.trim() || null

  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'action must be "approve" or "reject"' }, { status: 400 })
  }

  const order = await db.order.findUnique({ where: { id: orderId } })
  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }
  if (order.paymentMode !== 'UPI') {
    return NextResponse.json({ error: 'Not a UPI order' }, { status: 400 })
  }

  const now = new Date()

  if (action === 'approve') {
    // Mark order as paid
    await db.order.update({
      where: { id: orderId },
      data: {
        upiStatus: 'PAID',
        paymentStatus: 'PAID',
        paymentReceived: true,
        paymentReceivedMethod: 'UPI',
      },
    })

    // Mark the latest attempt as VERIFIED with admin review info
    const latest = await db.paymentAttempt.findFirst({
      where: { orderId },
      orderBy: { attemptNumber: 'desc' },
    })
    if (latest) {
      await db.paymentAttempt.update({
        where: { id: latest.id },
        data: {
          status: 'VERIFIED',
          verifiedAt: now,
          adminReviewedBy: 'admin',
          adminReviewedAt: now,
          adminNote: note,
        },
      })
    }

    // Fire the Telegram payment-received alert (same as auto-approve)
    notifyPaymentReceived(orderId, order.verifiedUtr).catch((e) =>
      console.error('[upi-review] telegram notify error:', e)
    )

    return NextResponse.json({
      ok: true,
      action: 'approve',
      message: 'Order marked as Paid. Telegram notification sent.',
    })
  } else {
    // Reject — keep PENDING_VERIFICATION but record admin note
    await db.order.update({
      where: { id: orderId },
      data: {
        upiStatus: 'PENDING_VERIFICATION', // stays for follow-up
      },
    })

    const latest = await db.paymentAttempt.findFirst({
      where: { orderId },
      orderBy: { attemptNumber: 'desc' },
    })
    if (latest) {
      await db.paymentAttempt.update({
        where: { id: latest.id },
        data: {
          adminReviewedBy: 'admin',
          adminReviewedAt: now,
          adminNote: note ?? 'Rejected by admin',
        },
      })
    }

    return NextResponse.json({
      ok: true,
      action: 'reject',
      message: 'Order flagged for follow-up.',
    })
  }
}
