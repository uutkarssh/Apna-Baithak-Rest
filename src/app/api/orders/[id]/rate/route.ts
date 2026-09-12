import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSupabaseForUser } from '@/lib/supabase-server'

// POST /api/orders/[id]/rate — submit a rating + optional review for a delivered order
// Body: { rating: number (1-5), review?: string }
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await getSupabaseForUser(req)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })
  }

  const { id } = await ctx.params
  const body = await req.json()
  const rating = Number(body?.rating)

  if (!rating || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'Rating must be between 1 and 5.' }, { status: 400 })
  }

  const review = body?.review ? String(body.review).trim().slice(0, 500) : null

  // Verify the order belongs to this customer and is delivered
  const customer = await db.customer.findUnique({ where: { supabaseUserId: user.id } })
  if (!customer) {
    return NextResponse.json({ error: 'Customer not found.' }, { status: 404 })
  }

  const order = await db.order.findUnique({ where: { id } })
  if (!order || order.customerId !== customer.id) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  }

  if (order.status !== 'DELIVERED') {
    return NextResponse.json({ error: 'Only delivered orders can be rated.' }, { status: 400 })
  }

  if (order.rating != null) {
    return NextResponse.json({ error: 'You have already rated this order.' }, { status: 400 })
  }

  const updated = await db.order.update({
    where: { id },
    data: { rating: Math.round(rating), review },
  })

  return NextResponse.json({
    ok: true,
    rating: updated.rating,
    review: updated.review,
  })
}
