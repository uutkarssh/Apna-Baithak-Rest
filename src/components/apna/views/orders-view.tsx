'use client'
import { authedFetch } from '@/components/providers/providers'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Package,
  ChefHat,
  Bike,
  Home as HomeIcon,
  MapPin,
  Phone,
  Receipt,
  RefreshCw,
  Star,
  Download,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { useApp } from '@/store/app'
import { useCart } from '@/store/cart'
import { useAuth } from '@/components/providers/auth-provider'
import { rupees, formatDateTime } from '@/lib/format'
import { ORDER_STATUS_LABELS, RESTAURANT, type OrderStatus } from '@/lib/constants'
import type { Order } from '@/lib/types'
import { OrderCardSkeleton } from '@/components/apna/skeletons'
import { OrderRating } from '@/components/apna/order-rating'
import { toast } from 'sonner'

// Timeline steps for the order tracking visual
const TIMELINE_STEPS: { status: OrderStatus; label: string; icon: any; desc: string }[] = [
  { status: 'NEW', label: 'Order Placed', icon: Package, desc: 'Your order has been received' },
  { status: 'PREPARING', label: 'Preparing', icon: ChefHat, desc: 'The kitchen is cooking your food' },
  { status: 'OUT_FOR_DELIVERY', label: 'On the way', icon: Bike, desc: 'Your order is out for delivery' },
  { status: 'DELIVERED', label: 'Delivered', icon: HomeIcon, desc: 'Enjoy your meal!' },
]

function getStepIndex(status: string): number {
  const idx = TIMELINE_STEPS.findIndex((s) => s.status === status)
  if (status === 'CANCELLED') return -1
  return idx >= 0 ? idx : 0
}

export function OrdersView() {
  const back = useApp((s) => s.back)
  const setView = useApp((s) => s.setView)
  const count = useCart((s) => s.count())
  const { profile, loading: authLoading } = useAuth()

  const { data, isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: async () => {
      const res = await authedFetch('/api/orders')
      if (!res.ok) return { orders: [] }
      return res.json() as Promise<{ orders: Order[] }>
    },
    enabled: !authLoading && !!profile,
  })
  const orders = data?.orders ?? []

  return (
    <div className="flex min-h-full flex-col pb-6">
      <header className="sticky top-0 z-10 bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <button onClick={back} className="grid h-9 w-9 place-items-center rounded-full bg-muted">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-xl font-bold text-foreground">My Orders</h1>
        </div>
      </header>

      {isLoading ? (
        <div className="flex flex-col gap-3 px-4">
          {[0, 1].map((i) => <OrderCardSkeleton key={i} />)}
        </div>
      ) : orders.length === 0 ? (
        <div className="mx-4 mt-6 grid place-items-center rounded-2xl border border-dashed border-border py-16 text-center">
          <Package className="h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-semibold text-foreground">No orders yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Your placed orders will appear here.</p>
          <button
            onClick={() => setView('home')}
            className="mt-4 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-brand-foreground"
          >
            Start ordering
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 px-4">
          {orders.map((o, i) => (
            <OrderTrackingCard key={o.id} order={o} index={i} />
          ))}
        </div>
      )}
      {count > 0 && <div className="h-20" />}
    </div>
  )
}

function OrderTrackingCard({ order, index }: { order: Order; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const status = order.status as OrderStatus
  const currentStep = getStepIndex(status)
  const isCancelled = status === 'CANCELLED'
  const isDelivered = status === 'DELIVERED'

  const addItem = useCart((s) => s.addItem)
  const setView = useApp((s) => s.setView)
  const [reordering, setReordering] = useState(false)
  const [downloading, setDownloading] = useState(false)

  // Download receipt via fetch() + blob, then trigger via a hidden <a download>
  // click. window.open() was tried here before but silently fails on mobile
  // browsers because it's called after two awaits, losing the "user gesture"
  // context that window.open() requires — the popup gets blocked with no
  // error. A programmatic <a download> click is not treated as a popup and
  // works reliably after async work, while still avoiding the sameSite-cookie
  // drop that direct <a href="/api/..."> navigation caused on some browsers.
  async function downloadReceipt() {
    setDownloading(true)
    try {
      const res = await fetch(`/api/orders/${order.id}/receipt`, {
        credentials: 'include',
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Failed to load receipt')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `receipt-${order.orderNumber}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (e: any) {
      toast.error(e.message || 'Failed to download receipt')
    } finally {
      setDownloading(false)
    }
  }

  function reorder() {
    setReordering(true)
    let added = 0
    for (const item of order.items) {
      // itemId in order_items may be null if the menu item was deleted; skip those
      if (!item.itemId) continue
      addItem({
        itemId: item.itemId,
        name: item.itemName,
        slug: item.itemName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
        price: item.itemPrice,
        imageUrl: item.imageUrl,
      }, item.quantity)
      added += item.quantity
    }
    setReordering(false)
    if (added > 0) {
      toast.success(`${added} item${added === 1 ? '' : 's'} from ${order.orderNumber} added to cart`)
      setView('cart')
    } else {
      toast.error('These items are no longer on the menu')
    }
  }

  // ETA estimate based on order time
  const orderTime = new Date(order.createdAt).getTime()
  const now = Date.now()
  const elapsedMin = Math.floor((now - orderTime) / 60000)
  const etaMin = Math.max(0, 35 - elapsedMin)

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.05 }}
      className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm"
    >
      {/* Header */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-3 border-b border-border/50 bg-muted/30 p-3 text-left"
      >
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${
          isCancelled ? 'bg-red-100' : isDelivered ? 'bg-emerald-100' : 'bg-brand-softer'
        }`}>
          {isCancelled ? <Package className="h-5 w-5 text-red-600" /> : isDelivered ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <Package className="h-5 w-5 text-brand" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-foreground">{order.orderNumber}</span>
            <StatusBadge status={status} />
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {order.items.length} item{order.items.length === 1 ? '' : 's'} · {formatDateTime(order.createdAt)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-extrabold text-foreground">{rupees(order.totalAmount)}</p>
          <p className="text-[10px] text-muted-foreground">{order.paymentMode}</p>
        </div>
      </button>

      {/* Live tracking timeline (for active orders) */}
      {!isCancelled && !isDelivered && currentStep >= 0 && (
        <div className="border-b border-border/50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Order Status
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-softer px-2 py-0.5 text-[11px] font-bold text-brand">
              <Clock className="h-3 w-3" /> ~{etaMin} min
            </span>
          </div>
          {/* Timeline */}
          <div className="relative flex items-start justify-between">
            {TIMELINE_STEPS.map((step, i) => {
              const done = i < currentStep
              const active = i === currentStep
              const Icon = step.icon
              return (
                <div key={step.status} className="relative flex flex-1 flex-col items-center gap-1.5">
                  {/* connecting line */}
                  {i < TIMELINE_STEPS.length - 1 && (
                    <div className="absolute top-4 left-1/2 h-0.5 w-full bg-border">
                      <motion.div
                        className="h-full bg-brand"
                        initial={{ width: 0 }}
                        animate={{ width: i < currentStep ? '100%' : '0%' }}
                        transition={{ duration: 0.4 }}
                      />
                    </div>
                  )}
                  {/* icon circle */}
                  <motion.div
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                    className={`relative z-10 grid h-8 w-8 place-items-center rounded-full border-2 transition ${
                      done
                        ? 'border-brand bg-brand text-brand-foreground'
                        : active
                        ? 'border-brand bg-white text-brand'
                        : 'border-border bg-white text-muted-foreground'
                    }`}
                  >
                    {active && (
                      <motion.span
                        className="absolute -inset-1 rounded-full border-2 border-brand"
                        animate={{ scale: [1, 1.3, 1], opacity: [1, 0, 1] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                      />
                    )}
                    <Icon className="h-4 w-4" />
                  </motion.div>
                  <span className={`text-center text-[10px] font-medium ${
                    done || active ? 'text-foreground' : 'text-muted-foreground'
                  }`}>
                    {step.label}
                  </span>
                </div>
              )
            })}
          </div>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            {TIMELINE_STEPS[currentStep]?.desc}
          </p>
        </div>
      )}

      {/* Delivered state */}
      {isDelivered && (
        <div className="flex items-center gap-2 border-b border-border/50 bg-emerald-50 p-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <p className="text-xs font-medium text-emerald-700">
            Delivered on {formatDateTime(order.updatedAt)}
          </p>
        </div>
      )}

      {/* Cancelled state */}
      {isCancelled && (
        <div className="flex items-center gap-2 border-b border-border/50 bg-red-50 p-3">
          <Package className="h-5 w-5 text-red-600" />
          <p className="text-xs font-medium text-red-700">This order was cancelled.</p>
        </div>
      )}

      {/* Expanded details */}
      {expanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          className="overflow-hidden"
        >
          <div className="p-3">
            {/* Items */}
            <p className="mb-1.5 text-xs font-bold uppercase text-muted-foreground">Items</p>
            <div className="mb-3 flex flex-col gap-1">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between text-sm">
                  <span className="text-foreground">
                    <span className="font-bold">{item.quantity}×</span> {item.itemName}
                  </span>
                  <span className="text-muted-foreground">{rupees(item.itemPrice * item.quantity)}</span>
                </div>
              ))}
            </div>

            {/* Address */}
            <div className="mb-3 rounded-lg bg-muted/40 p-2">
              <p className="mb-0.5 text-xs font-bold uppercase text-muted-foreground">Delivery Address</p>
              <p className="flex items-start gap-1.5 text-xs text-foreground">
                <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-brand" />
                {order.addressLine}
              </p>
              {order.distanceKm != null && (
                <p className="ml-4 mt-0.5 text-[11px] text-muted-foreground">
                  {order.distanceKm.toFixed(2)} km from restaurant
                </p>
              )}
            </div>

            {/* Bill summary — only item subtotal + delivery + total.
                GST/handling were removed; historical orders that still have
                non-zero values in those fields are folded into "Item Total"
                for display purposes (the stored totalAmount is unchanged). */}
            <div className="rounded-lg bg-muted/40 p-2">
              <p className="mb-1.5 flex items-center gap-1 text-xs font-bold uppercase text-muted-foreground">
                <Receipt className="h-3 w-3" /> Bill Summary
              </p>
              <div className="flex flex-col gap-1 text-xs">
                <BillLine label="Item Total" value={rupees(order.itemTotal)} />
                <BillLine
                  label="Delivery Fee"
                  value={order.deliveryFee === 0 ? 'FREE' : rupees(order.deliveryFee)}
                />
                <div className="mt-1 flex justify-between border-t border-border pt-1">
                  <span className="font-bold text-foreground">Total Paid</span>
                  <span className="font-extrabold text-brand">{rupees(order.totalAmount)}</span>
                </div>
              </div>
            </div>

            {/* Contact restaurant + Reorder + Receipt download */}
            <div className="mt-3 flex gap-2">
              <a
                href={`tel:${RESTAURANT.phone.replace(/\s/g, '')}`}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-brand/30 py-2.5 text-xs font-bold text-brand"
              >
                <Phone className="h-3.5 w-3.5" /> Call
              </a>
              <button
                onClick={reorder}
                disabled={reordering || isCancelled}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand py-2.5 text-xs font-bold text-brand-foreground disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${reordering ? 'animate-spin' : ''}`} />
                {reordering ? 'Adding...' : 'Reorder'}
              </button>
              <button
                onClick={downloadReceipt}
                disabled={!isDelivered || downloading}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl border py-2.5 text-xs font-bold ${
                  isDelivered
                    ? 'border-border text-foreground hover:bg-muted'
                    : 'border-border/40 text-muted-foreground/40'
                }`}
                title={isDelivered ? 'Download receipt' : 'Receipt available after delivery'}
              >
                <Download className={`h-3.5 w-3.5 ${downloading ? 'animate-bounce' : ''}`} />{' '}
                {downloading ? 'Loading…' : 'Receipt'}
              </button>
            </div>

            {/* Rating section for delivered orders */}
            {isDelivered && (
              <div className="mt-3">
                {order.rating != null ? (
                  <div className="flex items-center gap-2 rounded-xl bg-amber-50 p-3">
                    <span className="text-xs font-bold text-amber-700">Your Rating:</span>
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star
                          key={n}
                          className={`h-3.5 w-3.5 ${n <= order.rating! ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`}
                        />
                      ))}
                    </div>
                    {order.review && (
                      <span className="ml-2 line-clamp-1 text-xs text-muted-foreground">"{order.review}"</span>
                    )}
                  </div>
                ) : (
                  <OrderRating orderId={order.id} orderNumber={order.orderNumber} />
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-center gap-1 py-2 text-center text-xs font-semibold text-brand"
      >
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {expanded ? 'Hide details' : 'View details'}
      </button>
    </motion.div>
  )
}

function StatusBadge({ status }: { status: OrderStatus }) {
  const colors: Record<string, string> = {
    NEW: 'bg-blue-100 text-blue-700',
    PREPARING: 'bg-amber-100 text-amber-700',
    OUT_FOR_DELIVERY: 'bg-purple-100 text-purple-700',
    DELIVERED: 'bg-emerald-100 text-emerald-700',
    CANCELLED: 'bg-red-100 text-red-700',
  }
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${colors[status] ?? 'bg-muted text-foreground'}`}>
      {ORDER_STATUS_LABELS[status] ?? status}
    </span>
  )
}

function BillLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  )
}
