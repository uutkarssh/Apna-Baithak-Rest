import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdminAuthorized } from '@/lib/admin-guard'
import { ORDER_STATUS_LABELS } from '@/lib/constants'
import { formatDateTime } from '@/lib/format'

// GET /api/admin/export?type=orders|revenue
// Returns a CSV file for download.
export async function GET(req: NextRequest) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const type = req.nextUrl.searchParams.get('type') || 'orders'

  if (type === 'orders') {
    return exportOrders()
  } else if (type === 'revenue') {
    return exportRevenue()
  }

  return NextResponse.json({ error: 'Invalid export type' }, { status: 400 })
}

async function exportOrders() {
  const orders = await db.order.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      items: true,
      customer: { select: { name: true, email: true, phone: true } },
    },
    take: 1000,
  })

  const headers = [
    'Order Number',
    'Date',
    'Customer Name',
    'Customer Email',
    'Customer Phone',
    'Items',
    'Item Total',
    'Handling Fee',
    'Delivery Fee',
    'GST & Charges',
    'Total Amount',
    'Payment Mode',
    'Payment Status',
    'Payment Received',
    'Payment Received Method',
    'Order Status',
    'Distance (km)',
    'Delivery Address',
    'Notes',
  ]

  const rows = orders.map((o) => {
    const itemsSummary = o.items
      .map((i) => `${i.quantity}x ${i.itemName}`)
      .join('; ')
    return [
      escapeCsv(o.orderNumber),
      escapeCsv(formatDateTime(o.createdAt.toISOString())),
      escapeCsv(o.customerName),
      escapeCsv(o.customer?.email || ''),
      escapeCsv(o.customerPhone || ''),
      escapeCsv(itemsSummary),
      o.itemTotal,
      o.handlingFee,
      o.deliveryFee,
      o.gstAndCharges,
      o.totalAmount,
      o.paymentMode,
      o.paymentStatus,
      o.paymentReceived ? 'Yes' : 'No',
      escapeCsv(o.paymentReceivedMethod || ''),
      ORDER_STATUS_LABELS[o.status as keyof typeof ORDER_STATUS_LABELS] || o.status,
      o.distanceKm != null ? o.distanceKm.toFixed(2) : '',
      escapeCsv(o.addressLine),
      escapeCsv(o.notes || ''),
    ].join(',')
  })

  const csv = [headers.join(','), ...rows].join('\n')
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="apna-baithak-orders-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}

async function exportRevenue() {
  // Last 30 days revenue by day
  const days: { date: string; orders: number; revenue: number; items: number }[] = []
  const now = new Date()
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now)
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - i)
    const next = new Date(d)
    next.setDate(next.getDate() + 1)
    const dayOrders = await db.order.findMany({
      where: {
        createdAt: { gte: d, lt: next },
        status: { not: 'CANCELLED' },
      },
      select: { totalAmount: true, items: { select: { quantity: true } } },
    })
    const revenue = dayOrders.reduce((s, o) => s + o.totalAmount, 0)
    const items = dayOrders.reduce(
      (s, o) => s + o.items.reduce((n, i) => n + i.quantity, 0),
      0
    )
    days.push({
      date: d.toISOString().slice(0, 10),
      orders: dayOrders.length,
      revenue,
      items,
    })
  }

  const headers = ['Date', 'Orders', 'Items Sold', 'Revenue (₹)']
  const rows = days.map((d) => [d.date, d.orders, d.items, d.revenue].join(','))
  const csv = [headers.join(','), ...rows].join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="apna-baithak-revenue-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}

function escapeCsv(value: string): string {
  if (!value) return ''
  // Wrap in quotes and escape any inner quotes
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
