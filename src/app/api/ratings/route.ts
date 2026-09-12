import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/ratings — public restaurant average rating (from delivered order ratings)
export async function GET() {
  const orders = await db.order.findMany({
    where: { rating: { not: null } },
    select: { rating: true },
  })

  const ratings = orders.map((o) => o.rating!).filter((r) => r > 0)
  const avgRating = ratings.length > 0 ? ratings.reduce((s, r) => s + r, 0) / ratings.length : 0
  const totalReviews = ratings.length

  return NextResponse.json({
    avgRating: Number(avgRating.toFixed(1)),
    totalReviews,
  })
}
