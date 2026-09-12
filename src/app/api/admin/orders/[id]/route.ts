import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdminAuthorized } from '@/lib/admin-guard'
import { ORDER_STATUSES, type OrderStatus } from '@/lib/constants'

// PATCH /api/admin/orders/[id] — update order fields
//
// Supports three kinds of updates:
//  1. Delivery status change: { status: OrderStatus }
//     Also auto-marks paymentStatus as PAID when status becomes DELIVERED
//     (legacy behavior — kept for backwards compat with existing UI).
//  2. Admin payment tracking: { paymentReceived: boolean, paymentReceivedMethod?: 'Cash' | 'UPI' }
//     The admin marks that payment was actually received at the door. The
//     method may differ from the original checkout paymentMode (e.g. COD
//     order paid via UPI QR at the door).
//  3. Both at once.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await ctx.params
  const body = await req.json()
  const existing = await db.order.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  // Build the update payload — only include fields that were sent.
  const data: any = {}

  // 1. Delivery status
  if (body.status !== undefined) {
    const status = String(body.status) as OrderStatus
    if (!ORDER_STATUSES.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    data.status = status
    // Legacy: auto-mark the OLD paymentStatus field as PAID when delivered
    // (this is the checkout-time paymentStatus, NOT the admin paymentReceived).
    if (status === 'DELIVERED' && existing.paymentStatus === 'PENDING') {
      data.paymentStatus = 'PAID'
    }
  }

  // 2. Admin payment received tracking (separate from checkout paymentStatus)
  if (body.paymentReceived !== undefined) {
    const paymentReceived = Boolean(body.paymentReceived)
    data.paymentReceived = paymentReceived
    if (paymentReceived) {
      // When marking as received, the method is required.
      const method = String(body.paymentReceivedMethod || '').trim()
      if (method !== 'Cash' && method !== 'UPI') {
        return NextResponse.json(
          { error: 'paymentReceivedMethod must be "Cash" or "UPI" when marking payment as received' },
          { status: 400 }
        )
      }
      data.paymentReceivedMethod = method
    } else {
      // Clearing the received flag also clears the method.
      data.paymentReceivedMethod = null
    }
  } else if (body.paymentReceivedMethod !== undefined) {
    // Allow updating just the method without toggling the flag
    const method = String(body.paymentReceivedMethod || '').trim()
    if (method !== 'Cash' && method !== 'UPI' && method !== '') {
      return NextResponse.json(
        { error: 'paymentReceivedMethod must be "Cash" or "UPI"' },
        { status: 400 }
      )
    }
    data.paymentReceivedMethod = method || null
  }

  // 3. Status history entry (only for delivery status changes)
  const updateData: any = { ...data }
  if (data.status) {
    updateData.statusHistory = {
      create: { status: data.status, note: body?.note || `Status updated to ${data.status}` },
    }
  }

  const updated = await db.order.update({
    where: { id },
    data: updateData,
  })

  return NextResponse.json({ order: updated })
}

// DELETE /api/admin/orders/[id] — permanently delete an order and its
// related order items, status history and payment attempts.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await ctx.params
  const existing = await db.order.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  await db.order.delete({ where: { id } })

  return NextResponse.json({ success: true, deletedOrderId: id })
}
