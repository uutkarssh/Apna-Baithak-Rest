import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdminAuthorized } from '@/lib/admin-guard'

// GET /api/admin/reviews — all customer ratings + reviews for orders
export async function GET(req: NextRequest) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const orders = await db.order.findMany({
    where: { rating: { not: null } },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      orderNumber: true,
      rating: true,
      review: true,
      updatedAt: true,
      customerName: true,
      totalAmount: true,
      items: { select: { itemName: true, quantity: true } },
    },
    take: 200,
  })

  // Compute average rating
  const ratings = orders.map((o) => o.rating!).filter((r) => r > 0)
  const avgRating = ratings.length > 0 ? ratings.reduce((s, r) => s + r, 0) / ratings.length : 0
  const ratingCounts = [0, 0, 0, 0, 0] // count of 1-star, 2-star, ..., 5-star
  ratings.forEach((r) => { if (r >= 1 && r <= 5) ratingCounts[r - 1]++ })

  return NextResponse.json({
    avgRating: Number(avgRating.toFixed(2)),
    totalReviews: ratings.length,
    ratingCounts, // [count1star, count2star, ..., count5star]
    reviews: orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      rating: o.rating!,
      review: o.review,
      customerName: o.customerName,
      totalAmount: o.totalAmount,
      updatedAt: o.updatedAt,
      items: o.items.map((i) => `${i.quantity}× ${i.itemName}`).join(', '),
    })),
  })
}
