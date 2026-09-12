'use client'

import { useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  LayoutDashboard,
  LayoutGrid,
  UtensilsCrossed,
  LogOut,
  TrendingUp,
  ShoppingBag,
  IndianRupee,
  Clock,
  Loader2,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Plus,
  Pencil,
  Trash2,
  X,
  Upload,
  Image as ImageIcon,
  CheckCircle2,
  Star,
  Bell,
  CheckSquare,
  Square,
} from 'lucide-react'
import { useAdminAuth } from './admin-auth'
import { rupees, formatDateTime, formatRelative } from '@/lib/format'
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_COLORS,
  type OrderStatus,
  MAX_ITEM_IMAGES,
} from '@/lib/constants'
import { toast } from 'sonner'
import { SalesAnalytics } from './sales-analytics'
import { OrderDetailModal } from './order-detail-modal'
import { ReviewsPanel } from './reviews-panel'
import { AdminOrderRowSkeleton, StatCardSkeleton, AdminItemRowSkeleton } from '@/components/apna/skeletons'
import { BrandIcon, BrandWordmark } from '@/components/brand/brand-logo'

type AdminOrder = {
  id: string
  orderNumber: string
  status: string
  paymentMode: string
  paymentStatus: string
  paymentReceived: boolean
  paymentReceivedMethod: string | null
  itemTotal: number
  handlingFee: number
  deliveryFee: number
  gstAndCharges: number
  totalAmount: number
  distanceKm: number | null
  addressLine: string
  latitude: number | null
  longitude: number | null
  notes: string | null
  createdAt: string
  updatedAt: string
  customerName: string
  customerPhone: string | null
  // UPI verification fields
  upiStatus: string // NONE | AWAITING_SCREENSHOT | PENDING_VERIFICATION | PAID | EXPIRED
  verifiedUtr: string | null
  upiScreenshotUrl: string | null
  upiVerificationResult: string | null
  latestAttempt: {
    id: string
    attemptNumber: number
    status: string
    upiTxnRef: string
    amount: number
    payeeVpa: string
    payeeName: string
    startedAt: string
    expiresAt: string
    screenshotUrl: string | null
    uploadedAt: string | null
    geminiIsAuthentic: boolean | null
    geminiExtractedTimestamp: string | null
    geminiExtractedAmount: number | null
    geminiExtractedPayee: string | null
    geminiExtractedUtr: string | null
    geminiConfidence: number | null
    geminiReasoning: string | null
    failedChecks: string | null
  } | null
  items: { id: string; itemName: string; itemPrice: number; quantity: number; imageUrl: string | null }[]
}
type Stats = {
  todayOrderCount: number
  todayRevenue: number
  totalRevenue: number
  totalOrders: number
  activeOrders: number
  categoryCount: number
  itemCount: number
}

export function AdminDashboard() {
  const { logout } = useAdminAuth()
  const [tab, setTab] = useState<'orders' | 'menu' | 'analytics' | 'reviews'>('orders')
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'ALL'>('ALL')
  // UPI verification filter — when true, only show orders with upiStatus=PENDING_VERIFICATION
  const [upiPendingOnly, setUpiPendingOnly] = useState(false)

  const qc = useQueryClient()
  const { data: stats } = useQuery<Stats>({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const res = await fetch('/api/admin/stats')
      if (!res.ok) throw new Error('unauthorized')
      return res.json()
    },
  })

  const { data: ordersData, isLoading } = useQuery({
    queryKey: ['admin-orders', statusFilter, upiPendingOnly],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (statusFilter !== 'ALL') params.set('status', statusFilter)
      if (upiPendingOnly) params.set('upiStatus', 'PENDING_VERIFICATION')
      const url = params.toString()
        ? `/api/admin/orders?${params.toString()}`
        : '/api/admin/orders'
      const res = await fetch(url)
      if (!res.ok) throw new Error('unauthorized')
      return res.json() as Promise<{ orders: AdminOrder[] }>
    },
  })
  const orders = ordersData?.orders ?? []

  // Real-time new-order polling: every 15s, refetch ALL orders to detect new ones
  const knownOrderIds = useRef<Set<string>>(new Set())
  const firstLoadRef = useRef(true)
  useEffect(() => {
    // seed the known set on first load so we don't toast about existing orders
    if (firstLoadRef.current && orders.length > 0) {
      orders.forEach((o) => knownOrderIds.current.add(o.id))
      firstLoadRef.current = false
    }
  }, [orders])

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/admin/orders')
        if (!res.ok) return
        const { orders: fresh } = (await res.json()) as { orders: AdminOrder[] }
        const freshIds = new Set(fresh.map((o) => o.id))
        // detect new orders not in the known set
        const newOnes = fresh.filter((o) => !knownOrderIds.current.has(o.id))
        if (newOnes.length > 0) {
          newOnes.forEach((o) => {
            toast.success(`New order ${o.orderNumber} — ${rupees(o.totalAmount)}`, {
              duration: 6000,
              icon: <Bell className="h-4 w-4" />,
            })
            knownOrderIds.current.add(o.id)
          })
          // refresh data
          qc.invalidateQueries({ queryKey: ['admin-orders'] })
          qc.invalidateQueries({ queryKey: ['admin-stats'] })
        }
      } catch {}
    }, 15000)
    return () => clearInterval(interval)
  }, [qc])

  async function updateStatus(id: string, status: OrderStatus) {
    const res = await fetch(`/api/admin/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (!res.ok) {
      toast.error('Failed to update status')
      return
    }
    toast.success(`Order marked as ${ORDER_STATUS_LABELS[status]}`)
    qc.invalidateQueries({ queryKey: ['admin-orders'] })
    qc.invalidateQueries({ queryKey: ['admin-stats'] })
  }

  // Update the admin-controlled payment tracking fields. Called from
  // the OrderCard and OrderDetailModal.
  async function updatePayment(
    id: string,
    paymentReceived: boolean,
    paymentReceivedMethod?: 'Cash' | 'UPI'
  ) {
    const res = await fetch(`/api/admin/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentReceived, paymentReceivedMethod }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      toast.error(j.error || 'Failed to update payment')
      return false
    }
    toast.success(paymentReceived ? `Marked as paid (${paymentReceivedMethod})` : 'Marked as payment pending')
    qc.invalidateQueries({ queryKey: ['admin-orders'] })
    qc.invalidateQueries({ queryKey: ['admin-stats'] })
    return true
  }

  // Admin manual review of a PENDING_VERIFICATION UPI order.
  // approve → mark order Paid (method UPI) + fire Telegram payment alert.
  // reject  → flag for follow-up (stays PENDING_VERIFICATION with admin note).
  async function upiReview(
    id: string,
    action: 'approve' | 'reject',
    note?: string
  ): Promise<boolean> {
    const res = await fetch(`/api/admin/orders/${id}/upi-review`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, note }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      toast.error(j.error || 'Failed to review UPI payment')
      return false
    }
    toast.success(
      action === 'approve'
        ? 'Payment approved — order marked as Paid, Telegram sent'
        : 'Payment rejected — flagged for follow-up'
    )
    qc.invalidateQueries({ queryKey: ['admin-orders'] })
    qc.invalidateQueries({ queryKey: ['admin-stats'] })
    return true
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-3 py-3 sm:px-4">
          <BrandIcon size={36} priority />
          <BrandWordmark height={26} priority />
          <div className="ml-auto hidden min-w-0 flex-1 sm:block">
            <p className="truncate text-[11px] text-muted-foreground">Restaurant owner dashboard</p>
          </div>
          <button
            onClick={logout}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
          >
            <LogOut className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-3 py-4 sm:px-4 sm:py-5">
        {/* Stats — responsive grid: 2 cols on mobile, 4 on >= sm */}
        <section className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          {!stats ? (
            Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
          ) : (
            <>
              <StatCard icon={<ShoppingBag className="h-5 w-5" />} label="Today's Orders" value={String(stats.todayOrderCount ?? 0)} accent="bg-blue-100 text-blue-700" />
              <StatCard icon={<IndianRupee className="h-5 w-5" />} label="Today's Revenue" value={rupees(stats.todayRevenue ?? 0)} accent="bg-emerald-100 text-emerald-700" />
              <StatCard icon={<Clock className="h-5 w-5" />} label="Active Orders" value={String(stats.activeOrders ?? 0)} accent="bg-amber-100 text-amber-700" />
              <StatCard icon={<TrendingUp className="h-5 w-5" />} label="Total Revenue" value={rupees(stats.totalRevenue ?? 0)} accent="bg-purple-100 text-purple-700" />
            </>
          )}
        </section>

        {/* Tabs — always 4 equal-width cells on mobile so all tabs fit
            without horizontal cut-off; switch to inline row on >=sm. */}
        <div className="mb-4">
          <div className="grid grid-cols-4 gap-1 rounded-xl bg-muted p-1 sm:flex sm:flex-initial">
            <button
              onClick={() => setTab('orders')}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-1 py-2 text-xs font-semibold sm:px-4 sm:text-sm ${
                tab === 'orders' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              <LayoutDashboard className="h-4 w-4" />
              <span className="truncate">Orders</span>
            </button>
            <button
              onClick={() => setTab('menu')}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-1 py-2 text-xs font-semibold sm:px-4 sm:text-sm ${
                tab === 'menu' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              <UtensilsCrossed className="h-4 w-4" />
              <span className="truncate">Menu</span>
            </button>
            <button
              onClick={() => setTab('analytics')}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-1 py-2 text-xs font-semibold sm:px-4 sm:text-sm ${
                tab === 'analytics' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              <TrendingUp className="h-4 w-4" />
              <span className="truncate">Analytics</span>
            </button>
            <button
              onClick={() => setTab('reviews')}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-1 py-2 text-xs font-semibold sm:px-4 sm:text-sm ${
                tab === 'reviews' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              <Star className="h-4 w-4" />
              <span className="truncate">Reviews</span>
            </button>
          </div>
        </div>

        {tab === 'orders' ? (
          <OrdersTab
            orders={orders}
            loading={isLoading}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            updateStatus={updateStatus}
            updatePayment={updatePayment}
            upiPendingOnly={upiPendingOnly}
            setUpiPendingOnly={setUpiPendingOnly}
            upiReview={upiReview}
          />
        ) : tab === 'menu' ? (
          <MenuTab />
        ) : tab === 'analytics' ? (
          <SalesAnalytics />
        ) : (
          <ReviewsPanel />
        )}
      </main>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode
  label: string
  value: string
  accent: string
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card p-3 shadow-sm sm:p-4">
      <div className={`mb-2 grid h-9 w-9 place-items-center rounded-lg ${accent}`}>{icon}</div>
      <p className="truncate text-[11px] text-muted-foreground sm:text-xs">{label}</p>
      <p className="truncate text-lg font-extrabold text-foreground sm:text-xl">{value}</p>
    </div>
  )
}

function OrdersTab({
  orders,
  loading,
  statusFilter,
  setStatusFilter,
  updateStatus,
  updatePayment,
  upiPendingOnly,
  setUpiPendingOnly,
  upiReview,
}: {
  orders: AdminOrder[]
  loading: boolean
  statusFilter: OrderStatus | 'ALL'
  setStatusFilter: (s: OrderStatus | 'ALL') => void
  updateStatus: (id: string, s: OrderStatus) => void
  updatePayment: (id: string, received: boolean, method?: 'Cash' | 'UPI') => Promise<boolean>
  upiPendingOnly: boolean
  setUpiPendingOnly: (v: boolean) => void
  upiReview: (id: string, action: 'approve' | 'reject', note?: string) => Promise<boolean>
}) {
  const qc = useQueryClient()
  const [selected, setSelected] = useState<AdminOrder | null>(null)
  const [bulkMode, setBulkMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelectedIds(new Set(orders.map((o) => o.id)))
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  async function bulkUpdateStatus(status: OrderStatus) {
    if (selectedIds.size === 0) return
    setBulkBusy(true)
    try {
      await Promise.all(
        Array.from(selectedIds).map((id) =>
          fetch(`/api/admin/orders/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
          })
        )
      )
      toast.success(`Updated ${selectedIds.size} order${selectedIds.size === 1 ? '' : 's'} to ${ORDER_STATUS_LABELS[status]}`)
      setSelectedIds(new Set())
      setBulkMode(false)
      qc.invalidateQueries({ queryKey: ['admin-orders'] })
      qc.invalidateQueries({ queryKey: ['admin-stats'] })
    } catch (e: any) {
      toast.error('Bulk update failed')
    } finally {
      setBulkBusy(false)
    }
  }

  return (
    <div>
      {/* Row 1: Order status filters (All / New / Preparing / etc.) —
          scrollable horizontally, on its own row to avoid overlap. */}
      <div className="mb-2 no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {(['ALL', ...ORDER_STATUSES] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
              statusFilter === s
                ? 'bg-brand text-brand-foreground'
                : 'bg-card text-muted-foreground border border-border'
            }`}
          >
            {s === 'ALL' ? 'All' : ORDER_STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Row 2: Action buttons — Pending UPI Verification filter + Select (bulk).
          Separate row so they never overlap with the scrollable status filters. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {/* UPI Pending Verification filter — shows only orders that failed
            Gemini auto-verification and need manual admin review */}
        <button
          onClick={() => setUpiPendingOnly(!upiPendingOnly)}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
            upiPendingOnly
              ? 'bg-amber-500 text-white'
              : 'bg-card text-muted-foreground border border-border'
          }`}
        >
          ⚠ Pending UPI Verification
        </button>
        {orders.length > 0 && (
          <button
            onClick={() => {
              setBulkMode((b) => !b)
              setSelectedIds(new Set())
            }}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
              bulkMode ? 'bg-foreground text-background' : 'bg-card border border-border text-muted-foreground'
            }`}
          >
            {bulkMode ? (
              <span className="inline-flex items-center gap-1"><X className="h-3 w-3" /> Cancel</span>
            ) : (
              <span className="inline-flex items-center gap-1"><Square className="h-3 w-3" /> Select</span>
            )}
          </button>
        )}
      </div>

      {/* Bulk action bar — wraps on small screens */}
      {bulkMode && selectedIds.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-brand/30 bg-brand-softer p-3">
          <span className="text-sm font-bold text-foreground">
            {selectedIds.size} selected
          </span>
          <div className="flex flex-1 flex-wrap gap-2">
            {ORDER_STATUSES.filter((s) => s !== 'CANCELLED').map((s) => (
              <button
                key={s}
                onClick={() => bulkUpdateStatus(s)}
                disabled={bulkBusy}
                className="rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-brand-foreground disabled:opacity-50"
              >
                Mark {ORDER_STATUS_LABELS[s]}
              </button>
            ))}
            <button
              onClick={() => bulkUpdateStatus('CANCELLED')}
              disabled={bulkBusy}
              className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Cancel Orders
            </button>
          </div>
          <button onClick={clearSelection} className="text-xs font-semibold text-muted-foreground hover:text-foreground">
            Clear
          </button>
        </div>
      )}

      {/* Select all bar */}
      {bulkMode && orders.length > 0 && (
        <div className="mb-2 flex items-center justify-between px-1">
          <button onClick={selectAll} className="text-xs font-semibold text-brand">
            Select all ({orders.length})
          </button>
          {selectedIds.size > 0 && (
            <button onClick={clearSelection} className="text-xs font-semibold text-muted-foreground">
              Deselect all
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="grid gap-3">
          {Array.from({ length: 4 }).map((_, i) => <AdminOrderRowSkeleton key={i} />)}
        </div>
      ) : orders.length === 0 ? (
        <div className="grid place-items-center rounded-2xl border border-dashed border-border py-16 text-center">
          <ShoppingBag className="h-10 w-10 text-muted-foreground/40" />
          <p className="mt-2 text-sm text-muted-foreground">No orders to show.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {orders.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              onOpen={() => !bulkMode && setSelected(o)}
              bulkMode={bulkMode}
              isSelected={selectedIds.has(o.id)}
              onToggleSelect={() => toggleSelect(o.id)}
              updatePayment={updatePayment}
            />
          ))}
        </div>
      )}

      <OrderDetailModal
        order={selected}
        onClose={() => setSelected(null)}
        updateStatus={(id, s) => {
          updateStatus(id, s)
          // update the selected order's status locally so the modal reflects it
          if (selected && selected.id === id) {
            setSelected({ ...selected, status: s })
          }
        }}
        updatePayment={async (id, received, method) => {
          const ok = await updatePayment(id, received, method)
          if (ok && selected && selected.id === id) {
            setSelected({
              ...selected,
              paymentReceived: received,
              paymentReceivedMethod: received ? (method ?? selected.paymentReceivedMethod) : null,
            })
          }
          return ok
        }}
        upiReview={async (id, action, note) => {
          const ok = await upiReview(id, action, note)
          if (ok && selected && selected.id === id) {
            setSelected({
              ...selected,
              upiStatus: action === 'approve' ? 'PAID' : 'PENDING_VERIFICATION',
              paymentReceived: action === 'approve' ? true : selected.paymentReceived,
              paymentReceivedMethod: action === 'approve' ? 'UPI' : selected.paymentReceivedMethod,
              paymentStatus: action === 'approve' ? 'PAID' : selected.paymentStatus,
            })
          }
          return ok
        }}
      />
    </div>
  )
}

function OrderCard({
  order,
  onOpen,
  bulkMode = false,
  isSelected = false,
  onToggleSelect,
  updatePayment,
}: {
  order: AdminOrder
  onOpen: () => void
  bulkMode?: boolean
  isSelected?: boolean
  onToggleSelect?: () => void
  updatePayment: (id: string, received: boolean, method?: 'Cash' | 'UPI') => Promise<boolean>
}) {
  const status = order.status as OrderStatus
  const totalItems = order.items.reduce((n, i) => n + i.quantity, 0)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`overflow-hidden rounded-2xl border bg-card shadow-sm transition hover:shadow-md ${
        isSelected ? 'border-brand ring-2 ring-brand/20' : 'border-border/60'
      }`}
    >
      <button
        onClick={bulkMode ? onToggleSelect : onOpen}
        className="flex w-full items-center gap-3 p-3 text-left"
      >
        {bulkMode && (
          <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition ${
            isSelected ? 'border-brand bg-brand text-brand-foreground' : 'border-border bg-white'
          }`}>
            {isSelected && <CheckCircle2 className="h-4 w-4" />}
          </span>
        )}
        <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${
          status === 'DELIVERED' ? 'bg-emerald-100 text-emerald-700'
          : status === 'CANCELLED' ? 'bg-red-100 text-red-700'
          : status === 'OUT_FOR_DELIVERY' ? 'bg-purple-100 text-purple-700'
          : status === 'PREPARING' ? 'bg-amber-100 text-amber-700'
          : 'bg-brand-softer text-brand'
        }`}>
          <ShoppingBag className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-foreground">{order.orderNumber}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${ORDER_STATUS_COLORS[status]}`}>
              {ORDER_STATUS_LABELS[status]}
            </span>
            {/* Payment status badge — shows the admin-controlled
                paymentReceived state, NOT the original checkout paymentMode. */}
            {order.paymentReceived ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700">
                Paid{order.paymentReceivedMethod ? ` (${order.paymentReceivedMethod})` : ''}
              </span>
            ) : (
              <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold uppercase text-orange-700">
                Payment Pending
              </span>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {order.customerName} · {totalItems} item{totalItems === 1 ? '' : 's'} · {formatRelative(order.createdAt)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-extrabold text-foreground">{rupees(order.totalAmount)}</p>
          <p className="text-[10px] text-muted-foreground">{order.paymentMode}</p>
        </div>
        {!bulkMode && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
      </button>
      {/* Quick payment actions — visible only in non-bulk mode. The admin
          can mark payment received as Cash or UPI without opening the
          detail modal. The badge above shows the current state. */}
      {!bulkMode && (
        <div className="flex items-center gap-2 border-t border-border/50 bg-muted/20 px-3 py-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Payment:
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); updatePayment(order.id, true, 'Cash') }}
            className={`rounded-md px-2 py-1 text-[11px] font-bold transition ${
              order.paymentReceived && order.paymentReceivedMethod === 'Cash'
                ? 'bg-emerald-600 text-white'
                : 'bg-card border border-border text-foreground hover:bg-emerald-50 hover:text-emerald-700'
            }`}
          >
            Cash
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); updatePayment(order.id, true, 'UPI') }}
            className={`rounded-md px-2 py-1 text-[11px] font-bold transition ${
              order.paymentReceived && order.paymentReceivedMethod === 'UPI'
                ? 'bg-emerald-600 text-white'
                : 'bg-card border border-border text-foreground hover:bg-emerald-50 hover:text-emerald-700'
            }`}
          >
            UPI
          </button>
          {order.paymentReceived && (
            <button
              onClick={(e) => { e.stopPropagation(); updatePayment(order.id, false) }}
              className="ml-auto rounded-md px-2 py-1 text-[11px] font-bold text-orange-700 hover:bg-orange-50"
            >
              Mark Pending
            </button>
          )}
        </div>
      )}
    </motion.div>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  )
}

// ===== Menu management tab =====

function MenuTab() {
  const [editing, setEditing] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [subTab, setSubTab] = useState<'items' | 'categories'>('items')

  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['admin-items'],
    queryFn: async () => {
      const res = await fetch('/api/admin/menu/items')
      if (!res.ok) throw new Error('unauthorized')
      return res.json() as Promise<{
        items: Array<{
          id: string
          name: string
          slug: string
          price: number
          isAvailable: boolean
          isVeg: boolean
          sortOrder: number
          category: { name: string }
          images: { url: string }[]
        }>
      }>
    },
  })
  const items = data?.items ?? []

  const { data: catData } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await fetch('/api/menu/categories')
      if (!res.ok) return { categories: [] }
      return res.json()
    },
  })
  const categories = catData?.categories ?? []

  async function deleteItem(id: string) {
    if (!confirm('Delete this menu item? This cannot be undone.')) return
    const res = await fetch(`/api/admin/menu/items/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      toast.error('Failed to delete')
      return
    }
    toast.success('Item deleted')
    qc.invalidateQueries({ queryKey: ['admin-items'] })
    qc.invalidateQueries({ queryKey: ['admin-stats'] })
  }

  return (
    <div>
      {/* Sub-tab toggle: Items vs Categories */}
      <div className="mb-4 inline-flex rounded-xl bg-muted p-1">
        <button
          onClick={() => setSubTab('items')}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold sm:px-4 sm:text-sm ${
            subTab === 'items' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
          }`}
        >
          <UtensilsCrossed className="h-3.5 w-3.5" /> Items
        </button>
        <button
          onClick={() => setSubTab('categories')}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold sm:px-4 sm:text-sm ${
            subTab === 'categories' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
          }`}
        >
          <LayoutGrid className="h-3.5 w-3.5" /> Categories
        </button>
      </div>

      {subTab === 'categories' ? (
        <CategoriesManager />
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-foreground">Menu Items ({items.length})</h2>
              <p className="text-xs text-muted-foreground">Add, edit, toggle availability, upload images.</p>
            </div>
            <button
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-bold text-brand-foreground"
            >
              <Plus className="h-4 w-4" /> Add item
            </button>
          </div>

          {isLoading ? (
            <div className="grid gap-2">
              {Array.from({ length: 6 }).map((_, i) => <AdminItemRowSkeleton key={i} />)}
            </div>
          ) : items.length === 0 ? (
            <div className="grid place-items-center rounded-2xl border border-dashed border-border py-16 text-center">
              <UtensilsCrossed className="h-10 w-10 text-muted-foreground/40" />
              <p className="mt-2 text-sm text-muted-foreground">No menu items yet.</p>
            </div>
      ) : (
        <div className="grid gap-2">
          {items.map((it) => (
            <div key={it.id} className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-3 shadow-sm">
              <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted">
                {it.images[0]?.url ? (
                   
                  <img src={it.images[0].url} alt={it.name} className="h-full w-full object-cover" />
                ) : (
                  <ImageIcon className="h-5 w-5 text-muted-foreground/40" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-foreground">{it.name}</span>
                  {it.isVeg && (
                    <span className="grid h-3 w-3 place-items-center rounded border border-emerald-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                    </span>
                  )}
                  {!it.isAvailable && (
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                      HIDDEN
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {it.category.name} · {rupees(it.price)} · {it.images.length}/{MAX_ITEM_IMAGES} images
                </p>
              </div>
              <button
                onClick={() => setEditing(it.id)}
                className="grid h-9 w-9 place-items-center rounded-lg bg-muted text-foreground hover:bg-brand-softer"
                aria-label="Edit"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={() => deleteItem(it.id)}
                className="grid h-9 w-9 place-items-center rounded-lg bg-red-50 text-red-600 hover:bg-red-100"
                aria-label="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {(editing || creating) && (
        <ItemEditor
          itemId={editing}
          categories={categories}
          onClose={() => {
            setEditing(null)
            setCreating(false)
          }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['admin-items'] })
            qc.invalidateQueries({ queryKey: ['menu-items'] })
            qc.invalidateQueries({ queryKey: ['admin-stats'] })
            setEditing(null)
            setCreating(false)
          }}
        />
      )}
        </>
      )}
    </div>
  )
}

// ===== Categories management (sub-section of Menu tab) =====
// Full CRUD for menu categories: add, edit name/icon/order, delete (blocked
// if items still assigned), reorder via up/down arrows. Categories are stored
// in the Turso `categories` table and read dynamically by the customer-facing
// Home screen and Menu screen — no code changes needed to add a new one.

type AdminCategory = {
  id: string
  name: string
  slug: string
  iconUrl: string | null
  description: string | null
  sortOrder: number
  isActive: boolean
  _count?: { items: number }
}

function CategoriesManager() {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<AdminCategory | null>(null)
  const [creating, setCreating] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-categories'],
    queryFn: async () => {
      const res = await fetch('/api/admin/menu/categories')
      if (!res.ok) throw new Error('unauthorized')
      return res.json() as Promise<{ categories: AdminCategory[] }>
    },
  })
  const cats = data?.categories ?? []

  async function deleteCategory(id: string, name: string) {
    const res = await fetch(`/api/admin/menu/categories/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      toast.error(j.error || 'Failed to delete')
      return
    }
    toast.success(`Category "${name}" deleted`)
    qc.invalidateQueries({ queryKey: ['admin-categories'] })
    qc.invalidateQueries({ queryKey: ['categories'] })
  }

  async function moveCategory(cat: AdminCategory, direction: 'up' | 'down') {
    const sorted = [...cats].sort((a, b) => a.sortOrder - b.sortOrder)
    const idx = sorted.findIndex((c) => c.id === cat.id)
    if (idx === -1) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sorted.length) return
    const swap = sorted[swapIdx]
    // Swap sortOrder values between the two categories
    await Promise.all([
      fetch(`/api/admin/menu/categories/${cat.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sortOrder: swap.sortOrder }),
      }),
      fetch(`/api/admin/menu/categories/${swap.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sortOrder: cat.sortOrder }),
      }),
    ])
    qc.invalidateQueries({ queryKey: ['admin-categories'] })
    qc.invalidateQueries({ queryKey: ['categories'] })
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-foreground">Categories ({cats.length})</h2>
          <p className="text-xs text-muted-foreground">Add, edit, reorder, and delete menu categories. Changes appear on the customer site instantly.</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-bold text-brand-foreground"
        >
          <Plus className="h-4 w-4" /> Add category
        </button>
      </div>

      {isLoading ? (
        <div className="grid gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : cats.length === 0 ? (
        <div className="grid place-items-center rounded-2xl border border-dashed border-border py-16 text-center">
          <LayoutGrid className="h-10 w-10 text-muted-foreground/40" />
          <p className="mt-2 text-sm text-muted-foreground">No categories yet.</p>
        </div>
      ) : (
        <div className="grid gap-2">
          {[...cats].sort((a, b) => a.sortOrder - b.sortOrder).map((c, i, arr) => (
            <div key={c.id} className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-3 shadow-sm">
              {/* Reorder buttons */}
              <div className="flex shrink-0 flex-col gap-0.5">
                <button
                  onClick={() => moveCategory(c, 'up')}
                  disabled={i === 0}
                  className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30"
                  aria-label="Move up"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => moveCategory(c, 'down')}
                  disabled={i === arr.length - 1}
                  className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30"
                  aria-label="Move down"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>
              {/* Icon */}
              <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-softer">
                {c.iconUrl ? (
                  <img src={c.iconUrl} alt={c.name} className="h-full w-full object-cover" />
                ) : (
                  <UtensilsCrossed className="h-6 w-6 text-brand/60" />
                )}
              </div>
              {/* Name + meta */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-foreground">{c.name}</span>
                  {!c.isActive && (
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">HIDDEN</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Order: {c.sortOrder} · {c._count?.items ?? 0} item{(c._count?.items ?? 0) === 1 ? '' : 's'}
                </p>
              </div>
              {/* Edit / Delete */}
              <button
                onClick={() => setEditing(c)}
                className="grid h-9 w-9 place-items-center rounded-lg bg-muted text-foreground hover:bg-brand-softer"
                aria-label="Edit"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={() => {
                  const itemCount = c._count?.items ?? 0
                  if (itemCount > 0) {
                    toast.error(`Cannot delete "${c.name}" — it still has ${itemCount} item${itemCount === 1 ? '' : 's'} assigned. Reassign or delete those items first.`)
                    return
                  }
                  if (confirm(`Delete category "${c.name}"? This cannot be undone.`)) {
                    deleteCategory(c.id, c.name)
                  }
                }}
                className="grid h-9 w-9 place-items-center rounded-lg bg-red-50 text-red-600 hover:bg-red-100"
                aria-label="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {(editing || creating) && (
        <CategoryEditor
          category={editing}
          onClose={() => {
            setEditing(null)
            setCreating(false)
          }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['admin-categories'] })
            qc.invalidateQueries({ queryKey: ['categories'] })
            qc.invalidateQueries({ queryKey: ['admin-items'] })
            setEditing(null)
            setCreating(false)
          }}
        />
      )}
    </div>
  )
}

function CategoryEditor({
  category,
  onClose,
  onSaved,
}: {
  category: AdminCategory | null
  onClose: () => void
  onSaved: () => void
}) {
  const isCreate = !category
  const [name, setName] = useState(category?.name ?? '')
  const [description, setDescription] = useState(category?.description ?? '')
  const [sortOrder, setSortOrder] = useState(String(category?.sortOrder ?? 0))
  const [isActive, setIsActive] = useState(category?.isActive ?? true)
  const [iconUrl, setIconUrl] = useState(category?.iconUrl ?? null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  async function uploadIcon(file: File) {
    if (!category) {
      toast.error('Save the category first, then upload an icon.')
      return
    }
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/admin/menu/categories/${category.id}/icon`, {
        method: 'POST',
        body: form,
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Upload failed')
      }
      const { category: updated } = await res.json()
      setIconUrl(updated.iconUrl)
      toast.success('Icon uploaded')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setUploading(false)
    }
  }

  async function save() {
    if (!name.trim()) {
      toast.error('Category name is required')
      return
    }
    setSaving(true)
    try {
      const body = {
        name: name.trim(),
        description: description.trim() || null,
        sortOrder: Number(sortOrder) || 0,
        isActive,
      }
      const res = isCreate
        ? await fetch('/api/admin/menu/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        : await fetch(`/api/admin/menu/categories/${category!.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Save failed')
      }
      toast.success(isCreate ? 'Category created' : 'Category updated')
      onSaved()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="flex items-center justify-between border-b border-border p-4">
        <h3 className="text-base font-bold text-foreground">
          {isCreate ? 'Add category' : 'Edit category'}
        </h3>
        <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full hover:bg-muted">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="max-h-[70vh] overflow-y-auto p-4 thin-scroll">
        <div className="grid gap-3">
          {/* Icon upload + preview */}
          <div className="flex items-center gap-4">
            <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-brand/10 bg-brand-softer">
              {iconUrl ? (
                <img src={iconUrl} alt="Category icon" className="h-full w-full object-cover" />
              ) : (
                <UtensilsCrossed className="h-8 w-8 text-brand/60" />
              )}
            </div>
            <div className="flex-1">
              <p className="mb-1 text-xs font-bold text-foreground">Category Icon (1:1 square)</p>
              {category ? (
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-brand/30 bg-brand-softer px-3 py-1.5 text-xs font-semibold text-brand">
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  Upload icon
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) uploadIcon(f)
                      e.target.value = ''
                    }}
                  />
                </label>
              ) : (
                <p className="text-xs text-muted-foreground">Save the category first, then upload an icon.</p>
              )}
            </div>
          </div>

          <Labeled label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="e.g. Cake" />
          </Labeled>
          <Labeled label="Description (optional)">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={inputCls} placeholder="Short description of this category" />
          </Labeled>
          <div className="grid grid-cols-2 gap-3">
            <Labeled label="Display order">
              <input
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value.replace(/[^0-9]/g, ''))}
                inputMode="numeric"
                className={inputCls}
                placeholder="0"
              />
            </Labeled>
            <label className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-sm">
              Active (visible to customers)
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 accent-brand" />
            </label>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-border p-4">
        <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground">
          Cancel
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-brand-foreground disabled:opacity-50"
        >
          {saving ? 'Saving…' : isCreate ? 'Create category' : 'Save changes'}
        </button>
      </div>
    </Modal>
  )
}

function ItemEditor({
  itemId,
  categories,
  onClose,
  onSaved,
}: {
  itemId: string | null
  categories: { id: string; name: string }[]
  onClose: () => void
  onSaved: () => void
}) {
  const isCreate = !itemId
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '')
  const [description, setDescription] = useState('')
  const [isVeg, setIsVeg] = useState(true)
  const [isAvailable, setIsAvailable] = useState(true)
  const [prepTimeMins, setPrepTimeMins] = useState('')
  const [calories, setCalories] = useState('')
  const [images, setImages] = useState<{ url: string }[]>([])
  const [loading, setLoading] = useState(isCreate ? false : true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  // load existing item for edit
  const { data: itemData } = useQuery({
    queryKey: ['admin-item', itemId],
    queryFn: async () => {
      if (!itemId) return null
      const res = await fetch(`/api/admin/menu/items/${itemId}`)
      if (!res.ok) throw new Error('failed')
      return res.json() as Promise<{
        item: {
          name: string
          price: number
          categoryId: string
          description: string | null
          isVeg: boolean
          isAvailable: boolean
          prepTimeMins: number | null
          calories: number | null
          images: { id: string; url: string }[]
        }
      }>
    },
    enabled: !!itemId,
  })

  // Populate form fields when item data loads (must be in useEffect, not in
  // the useQuery select option — select runs during render and would cause
  // an infinite re-render loop with setState calls).
  useEffect(() => {
    if (itemData?.item) {
      const it = itemData.item
      setName(it.name)
      setPrice(String(it.price))
      setCategoryId(it.categoryId)
      setDescription(it.description ?? '')
      setIsVeg(it.isVeg)
      setIsAvailable(it.isAvailable)
      setPrepTimeMins(it.prepTimeMins ? String(it.prepTimeMins) : '')
      setCalories(it.calories ? String(it.calories) : '')
      setImages(it.images.map((im) => ({ url: im.url })))
    }
    if (!isCreate) setLoading(false)
  }, [itemData, isCreate])

  async function uploadImage(file: File) {
    if (!itemId) {
      toast.error('Save the item first, then upload images.')
      return
    }
    if (images.length >= MAX_ITEM_IMAGES) {
      toast.error(`Maximum ${MAX_ITEM_IMAGES} images per item.`)
      return
    }
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/admin/menu/items/${itemId}/images`, {
        method: 'POST',
        body: form,
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Upload failed')
      }
      const { image } = await res.json()
      setImages((prev) => [...prev, { url: image.url }])
      toast.success('Image uploaded')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setUploading(false)
    }
  }

  async function save() {
    if (!name.trim() || !price || !categoryId) {
      toast.error('Name, price and category are required')
      return
    }
    setSaving(true)
    try {
      const body = {
        name: name.trim(),
        price: Number(price),
        categoryId,
        description: description.trim() || null,
        isVeg,
        isAvailable,
        prepTimeMins: prepTimeMins ? Number(prepTimeMins) : null,
        calories: calories ? Number(calories) : null,
        images: images.map((im) => ({ url: im.url })),
      }
      const res = isCreate
        ? await fetch('/api/admin/menu/items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        : await fetch(`/api/admin/menu/items/${itemId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Save failed')
      }
      const { item } = await res.json()
      toast.success(isCreate ? 'Item created' : 'Item updated')
      // If created and there are pending images, upload them now (images in body are URLs only)
      onSaved()
      // switch to edit mode for the newly-created item so images can be added
      if (isCreate && item?.id) {
        window.location.reload()
      }
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Modal onClose={onClose}>
        <div className="grid place-items-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-brand" />
        </div>
      </Modal>
    )
  }

  return (
    <Modal onClose={onClose}>
      <div className="flex items-center justify-between border-b border-border p-4">
        <h3 className="text-base font-bold text-foreground">
          {isCreate ? 'Add menu item' : 'Edit menu item'}
        </h3>
        <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full hover:bg-muted">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="max-h-[70vh] overflow-y-auto p-4 thin-scroll">
        <div className="grid gap-3">
          <Labeled label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="e.g. Vegetable Pizza" />
          </Labeled>
          <div className="grid grid-cols-2 gap-3">
            <Labeled label="Price (₹)">
              <input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" className={inputCls} placeholder="100" />
            </Labeled>
            <Labeled label="Category">
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputCls}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Labeled>
          </div>
          <Labeled label="Description">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={inputCls} placeholder="Short description of the item" />
          </Labeled>
          <div className="grid grid-cols-2 gap-3">
            <Labeled label="Prep time (mins)">
              <input value={prepTimeMins} onChange={(e) => setPrepTimeMins(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" className={inputCls} placeholder="25" />
            </Labeled>
            <Labeled label="Calories">
              <input value={calories} onChange={(e) => setCalories(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" className={inputCls} placeholder="220" />
            </Labeled>
          </div>
          <div className="flex gap-3">
            <label className="flex flex-1 items-center justify-between rounded-lg bg-muted px-3 py-2 text-sm">
              Vegetarian
              <input type="checkbox" checked={isVeg} onChange={(e) => setIsVeg(e.target.checked)} className="h-4 w-4 accent-emerald-600" />
            </label>
            <label className="flex flex-1 items-center justify-between rounded-lg bg-muted px-3 py-2 text-sm">
              Available
              <input type="checkbox" checked={isAvailable} onChange={(e) => setIsAvailable(e.target.checked)} className="h-4 w-4 accent-brand" />
            </label>
          </div>

          {/* Images */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-bold text-foreground">Images ({images.length}/{MAX_ITEM_IMAGES})</span>
              {itemId && images.length < MAX_ITEM_IMAGES && (
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-brand/30 bg-brand-softer px-3 py-1.5 text-xs font-semibold text-brand">
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  Upload
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) uploadImage(f)
                      e.target.value = ''
                    }}
                  />
                </label>
              )}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {images.map((im, i) => (
                <div key={i} className="relative aspect-square overflow-hidden rounded-lg border border-border bg-muted">
                  { }
                  <img src={im.url} alt="" className="h-full w-full object-cover" />
                  <button
                    onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                    className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/60 text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {images.length === 0 && (
                <p className="col-span-4 rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                  {itemId ? 'Upload at least one image so customers see this item.' : 'Save the item first, then upload images.'}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-border p-4">
        <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground">
          Cancel
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-brand-foreground disabled:opacity-50"
        >
          {saving ? 'Saving…' : isCreate ? 'Create item' : 'Save changes'}
        </button>
      </div>
    </Modal>
  )
}

const inputCls =
  'w-full rounded-lg bg-muted px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/40'

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-foreground">{label}</span>
      {children}
    </label>
  )
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
