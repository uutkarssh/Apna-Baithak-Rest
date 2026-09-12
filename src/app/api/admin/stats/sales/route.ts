import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdminAuthorized } from '@/lib/admin-guard'

// GET /api/admin/stats/sales — last 7 days revenue + order count per day + top items
export async function GET(req: NextRequest) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const days: { date: string; label: string; revenue: number; orders: number }[] = []
  const now = new Date()
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now)
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - i)
    const next = new Date(d)
    next.setDate(next.getDate() + 1)
    const orders = await db.order.findMany({
      where: {
        createdAt: { gte: d, lt: next },
        status: { not: 'CANCELLED' },
      },
      select: { totalAmount: true },
    })
    const revenue = orders.reduce((s, o) => s + o.totalAmount, 0)
    const label = d.toLocaleDateString('en-IN', { weekday: 'short' })
    days.push({
      date: d.toISOString().slice(0, 10),
      label,
      revenue,
      orders: orders.length,
    })
  }

  // Top selling items (last 30 days)
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const recentItems = await db.orderItem.findMany({
    where: { order: { createdAt: { gte: thirtyDaysAgo }, status: { not: 'CANCELLED' } } },
    select: { itemName: true, quantity: true, itemPrice: true, imageUrl: true },
  })
  const itemMap = new Map<string, { name: string; qty: number; revenue: number; imageUrl: string | null }>()
  for (const oi of recentItems) {
    const existing = itemMap.get(oi.itemName)
    if (existing) {
      existing.qty += oi.quantity
      existing.revenue += oi.itemPrice * oi.quantity
    } else {
      itemMap.set(oi.itemName, { name: oi.itemName, qty: oi.quantity, revenue: oi.itemPrice * oi.quantity, imageUrl: oi.imageUrl })
    }
  }
  const topItems = Array.from(itemMap.values()).sort((a, b) => b.qty - a.qty).slice(0, 5)

  return NextResponse.json({ days, topItems })
}
