import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdminAuthorized, refreshAdminCookie } from '@/lib/admin-guard'

// GET /api/admin/stats — today's orders/revenue + menu/category counts
//
// This is the endpoint the admin-auth provider pings on every page load
// (see src/components/admin/admin-auth.tsx — `useEffect(() => fetch('/api/admin/stats')...)`).
// We use that ping to also REFRESH the admin cookie (rolling refresh) —
// every successful auth check bumps the cookie's maxAge back to 10 years
// from "now". This way, an active admin's session never expires; they
// only get logged out if they explicitly click "Logout" or don't open
// the panel for 10 years.
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

  const res = NextResponse.json({
    todayOrderCount: todayOrders.length,
    todayRevenue,
    totalRevenue,
    totalOrders: allOrders.length,
    activeOrders,
    categoryCount: categories,
    itemCount: items,
  })
  // Rolling refresh — bump the admin cookie's expiry by 10 years.
  // No-op if the response already has a Set-Cookie header (it doesn't —
  // this is a stats endpoint). The refresh keeps the admin logged in
  // for as long as they're actively using the panel.
  refreshAdminCookie(res)
  return res
}
