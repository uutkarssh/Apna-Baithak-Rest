import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdminAuthorized } from '@/lib/admin-guard'

// GET /api/admin/stats — today's orders/revenue + menu/category counts
export async function GET(req: NextRequest) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)

  const [todayOrders, allOrders, categories, items] = await Promise.all([
    db.order.findMany({
      where: { createdAt: { gte: startOfDay } },
      select: { totalAmount: true, status: true },
    }),
    db.order.findMany({ select: { totalAmount: true, status: true } }),
    db.category.count(),
    db.menuItem.count(),
  ])

  const todayRevenue = todayOrders
    .filter((o) => o.status !== 'CANCELLED')
    .reduce((s, o) => s + o.totalAmount, 0)
  const totalRevenue = allOrders
    .filter((o) => o.status !== 'CANCELLED')
    .reduce((s, o) => s + o.totalAmount, 0)

  const activeOrders = allOrders.filter(
    (o) => o.status === 'NEW' || o.status === 'PREPARING' || o.status === 'OUT_FOR_DELIVERY'
  ).length

  return NextResponse.json({
    todayOrderCount: todayOrders.length,
    todayRevenue,
    totalRevenue,
    totalOrders: allOrders.length,
    activeOrders,
    categoryCount: categories,
    itemCount: items,
  })
}
