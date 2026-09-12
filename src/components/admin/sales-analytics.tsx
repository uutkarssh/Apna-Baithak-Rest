'use client'

import { useQuery } from '@tanstack/react-query'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { TrendingUp, Package, Loader2, Download, FileSpreadsheet } from 'lucide-react'
import { rupees } from '@/lib/format'
import { toast } from 'sonner'

type DayData = { date: string; label: string; revenue: number; orders: number }
type TopItem = { name: string; qty: number; revenue: number; imageUrl: string | null }

export function SalesAnalytics() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-sales'],
    queryFn: async () => {
      const res = await fetch('/api/admin/stats/sales')
      if (!res.ok) throw new Error('failed')
      return res.json() as Promise<{ days: DayData[]; topItems: TopItem[] }>
    },
    refetchInterval: 60000, // refresh every minute
  })

  async function downloadExport(type: 'orders' | 'revenue') {
    try {
      const res = await fetch(`/api/admin/export?type=${type}`)
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = res.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || `apna-baithak-${type}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success(`${type === 'orders' ? 'Orders' : 'Revenue'} CSV exported`)
    } catch (e: any) {
      toast.error(e.message || 'Export failed')
    }
  }

  const days = data?.days ?? []
  const topItems = data?.topItems ?? []
  const total7d = days.reduce((s, d) => s + d.revenue, 0)
  const totalOrders7d = days.reduce((s, d) => s + d.orders, 0)
  const todayRevenue = days[days.length - 1]?.revenue ?? 0
  const maxRevenue = Math.max(...days.map((d) => d.revenue), 1)

  return (
    <div className="space-y-4">
      {/* Export buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => downloadExport('orders')}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2 text-xs font-bold text-foreground shadow-sm transition hover:bg-muted"
        >
          <Download className="h-3.5 w-3.5 text-brand" /> Export Orders (CSV)
        </button>
        <button
          onClick={() => downloadExport('revenue')}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2 text-xs font-bold text-foreground shadow-sm transition hover:bg-muted"
        >
          <FileSpreadsheet className="h-3.5 w-3.5 text-brand" /> Export Revenue (30-day CSV)
        </button>
      </div>

      {/* 7-day revenue chart */}
      <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-foreground">
              <TrendingUp className="h-4 w-4 text-brand" /> Last 7 Days Revenue
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {rupees(total7d)} total · {totalOrders7d} orders
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Today</p>
            <p className="text-base font-extrabold text-brand">{rupees(todayRevenue)}</p>
          </div>
        </div>

        {isLoading ? (
          <div className="grid h-48 place-items-center">
            <Loader2 className="h-6 w-6 animate-spin text-brand" />
          </div>
        ) : (
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={days} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: 'currentColor' }}
                  axisLine={false}
                  tickLine={false}
                  className="text-muted-foreground"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'currentColor' }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                  className="text-muted-foreground"
                  tickFormatter={(v) => `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(255, 82, 82, 0.08)' }}
                  contentStyle={{
                    background: 'white',
                    border: '1px solid #e5e5e5',
                    borderRadius: 12,
                    fontSize: 12,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  }}
                  formatter={(value: number, name: string) => [
                    name === 'revenue' ? rupees(value) : `${value} orders`,
                    name === 'revenue' ? 'Revenue' : 'Orders',
                  ]}
                />
                <Bar dataKey="revenue" radius={[6, 6, 0, 0]}>
                  {days.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={i === days.length - 1 ? '#FF5252' : '#FFB3B3'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Top selling items */}
      <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
        <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-foreground">
          <Package className="h-4 w-4 text-brand" /> Top Selling Items
          <span className="text-[11px] font-normal text-muted-foreground">(last 30 days)</span>
        </h3>

        {topItems.length === 0 ? (
          <div className="grid place-items-center py-8 text-center">
            <Package className="h-8 w-8 text-muted-foreground/40" />
            <p className="mt-2 text-xs text-muted-foreground">No sales data yet</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {topItems.map((item, i) => {
              const maxQty = topItems[0].qty
              const pct = (item.qty / maxQty) * 100
              return (
                <div key={item.name} className="flex items-center gap-3">
                  <span className="w-5 shrink-0 text-center text-xs font-bold text-muted-foreground">
                    #{i + 1}
                  </span>
                  {item.imageUrl && (
                     
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="h-10 w-10 shrink-0 rounded-lg object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="line-clamp-1 text-xs font-bold text-foreground">{item.name}</p>
                      <span className="shrink-0 text-xs font-extrabold text-brand">
                        {rupees(item.revenue)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-brand transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="shrink-0 text-[10px] font-medium text-muted-foreground">
                        {item.qty} sold
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
