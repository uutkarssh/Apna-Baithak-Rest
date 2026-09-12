import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSupabaseForUser } from '@/lib/supabase-server'

// GET /api/orders — current customer's order history
export async function GET(req: Request) {
  const supabase = await getSupabaseForUser(req)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ orders: [] })

  const customer = await db.customer.findUnique({ where: { supabaseUserId: user.id } })
  if (!customer) return NextResponse.json({ orders: [] })

  const orders = await db.order.findMany({
    where: { customerId: customer.id },
    orderBy: { createdAt: 'desc' },
    include: {
      items: true,
      statusHistory: { orderBy: { createdAt: 'asc' } },
    },
    take: 50,
  })

  return NextResponse.json({
    orders: orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      paymentMode: o.paymentMode,
      paymentStatus: o.paymentStatus,
      itemTotal: o.itemTotal,
      handlingFee: o.handlingFee,
      deliveryFee: o.deliveryFee,
      gstAndCharges: o.gstAndCharges,
      totalAmount: o.totalAmount,
      distanceKm: o.distanceKm,
      addressLine: o.addressLine,
      notes: o.notes,
      rating: o.rating,
      review: o.review,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
      items: o.items.map((oi) => ({
        id: oi.id,
        itemId: oi.itemId,
        itemName: oi.itemName,
        itemPrice: oi.itemPrice,
        quantity: oi.quantity,
        imageUrl: oi.imageUrl,
      })),
      history: o.statusHistory.map((h) => ({
        status: h.status,
        note: h.note,
        createdAt: h.createdAt,
      })),
    })),
  })
}
