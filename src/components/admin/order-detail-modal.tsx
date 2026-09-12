'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  MapPin,
  Phone,
  MessageSquare,
  Clock,
  Package,
  ChefHat,
  Bike,
  Home as HomeIcon,
  CheckCircle2,
  XCircle,
  Receipt,
  User,
  IndianRupee,
  Printer,
  StickyNote,
  Bell,
  Square,
  CheckSquare,
  Navigation,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  Image as ImageIcon,
  Trash2,
} from 'lucide-react'
import { rupees, formatDateTime, formatRelative } from '@/lib/format'
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_COLORS,
  type OrderStatus,
} from '@/lib/constants'
import { RESTAURANT } from '@/lib/constants'
import { toast } from 'sonner'

export type AdminOrder = {
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
  upiStatus: string
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

const TIMELINE_STEPS: { status: OrderStatus; label: string; icon: any; desc: string }[] = [
  { status: 'NEW', label: 'Order Placed', icon: Package, desc: 'Order received from customer' },
  { status: 'PREPARING', label: 'Preparing', icon: ChefHat, desc: 'Kitchen is cooking the order' },
  { status: 'OUT_FOR_DELIVERY', label: 'Out for Delivery', icon: Bike, desc: 'On the way to customer' },
  { status: 'DELIVERED', label: 'Delivered', icon: HomeIcon, desc: 'Order delivered successfully' },
]

function getStepIndex(status: string): number {
  if (status === 'CANCELLED') return -1
  const idx = TIMELINE_STEPS.findIndex((s) => s.status === status)
  return idx >= 0 ? idx : 0
}

export function OrderDetailModal({
  order,
  onClose,
  updateStatus,
  updatePayment,
  upiReview,
}: {
  order: AdminOrder | null
  onClose: () => void
  updateStatus: (id: string, s: OrderStatus) => void
  updatePayment: (id: string, received: boolean, method?: 'Cash' | 'UPI') => Promise<boolean>
  upiReview: (id: string, action: 'approve' | 'reject', note?: string) => Promise<boolean>
}) {
  async function deleteOrder() {
    if (!order) return
    const confirmed = window.confirm(
      `Delete order ${order.orderNumber}?\n\nThis permanently removes the order and its order items, status history and payment attempts. This cannot be undone.`
    )
    if (!confirmed) return

    const res = await fetch(`/api/admin/orders/${order.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      window.alert(body.error || 'Failed to delete order')
      return
    }

    onClose()
    window.location.reload()
  }

  return (
    <AnimatePresence>
      {order && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 grid place-items-end bg-black/50 sm:place-items-center"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: '100%', opacity: 0.5 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-card shadow-2xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border p-3 sm:p-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-base font-bold text-foreground sm:text-lg">{order.orderNumber}</h2>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${ORDER_STATUS_COLORS[order.status as OrderStatus]}`}>
                    {ORDER_STATUS_LABELS[order.status as OrderStatus]}
                  </span>
                </div>
                <p className="truncate text-xs text-muted-foreground">{formatDateTime(order.createdAt)}</p>
              </div>
              <button onClick={onClose} className="shrink-0 grid h-9 w-9 place-items-center rounded-full hover:bg-muted" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 thin-scroll">
              <div className="mb-4 rounded-2xl bg-muted/40 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-softer text-brand"><User className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-foreground">{order.customerName}</p>
                    {order.customerPhone && <p className="text-xs text-muted-foreground">{order.customerPhone}</p>}
                  </div>
                </div>
                <div className="flex gap-2">
                  {order.customerPhone && <>
                    <a href={`tel:${order.customerPhone}`} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand py-2 text-xs font-bold text-brand-foreground"><Phone className="h-3.5 w-3.5" /> Call</a>
                    <a href={`sms:${order.customerPhone}`} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-brand/30 py-2 text-xs font-bold text-brand"><MessageSquare className="h-3.5 w-3.5" /> SMS</a>
                  </>}
                </div>
              </div>

              <div className="mb-4">
                <p className="mb-1 flex items-center gap-1 text-xs font-bold uppercase text-muted-foreground"><MapPin className="h-3 w-3" /> Delivery Address</p>
                <p className="text-sm text-foreground">{order.addressLine}</p>
                {order.distanceKm != null && <p className="mt-0.5 text-xs text-muted-foreground">{order.distanceKm.toFixed(2)} km from restaurant</p>}
                {order.latitude != null && order.longitude != null && (
                  <div className="mt-2 rounded-xl bg-brand-softer/40 p-2.5">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Exact Location</p>
                    <p className="mt-0.5 font-mono text-xs text-foreground">{order.latitude.toFixed(6)}, {order.longitude.toFixed(6)}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <a href={`https://www.google.com/maps/search/?api=1&query=${order.latitude},${order.longitude}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1.5 text-[11px] font-bold text-brand-foreground"><ExternalLink className="h-3 w-3" /> View on map</a>
                      <a href={`https://www.google.com/maps/dir/?api=1&origin=${RESTAURANT.lat},${RESTAURANT.lng}&destination=${order.latitude},${order.longitude}&travelmode=driving`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-brand/40 px-2.5 py-1.5 text-[11px] font-bold text-brand"><Navigation className="h-3 w-3" /> Get directions</a>
                    </div>
                  </div>
                )}
              </div>

              {order.status !== 'CANCELLED' && (
                <div className="mb-4">
                  <p className="mb-2 flex items-center gap-1 text-xs font-bold uppercase text-muted-foreground"><Clock className="h-3 w-3" /> Status Timeline</p>
                  <div className="relative flex items-start justify-between rounded-2xl bg-muted/30 p-3">
                    {TIMELINE_STEPS.map((step, i) => {
                      const currentStep = getStepIndex(order.status)
                      const done = i < currentStep
                      const active = i === currentStep
                      const Icon = step.icon
                      return (
                        <div key={step.status} className="relative flex flex-1 flex-col items-center gap-1">
                          {i < TIMELINE_STEPS.length - 1 && <div className="absolute top-4 left-1/2 h-0.5 w-full bg-border"><div className={`h-full ${i < currentStep ? 'bg-brand' : 'bg-transparent'}`} /></div>}
                          <div className={`relative z-10 grid h-8 w-8 place-items-center rounded-full border-2 transition ${done ? 'border-brand bg-brand text-brand-foreground' : active ? 'border-brand bg-white text-brand' : 'border-border bg-white text-muted-foreground'}`}>
                            {active && <motion.span className="absolute -inset-1 rounded-full border-2 border-brand" animate={{ scale: [1, 1.3, 1], opacity: [1, 0, 1] }} transition={{ duration: 1.5, repeat: Infinity }} />}
                            <Icon className="h-4 w-4" />
                          </div>
                          <span className={`text-center text-[10px] font-medium ${done || active ? 'text-foreground' : 'text-muted-foreground'}`}>{step.label}</span>
                        </div>
                      )
                    })}
                  </div>
                  <p className="mt-1.5 text-center text-xs text-muted-foreground">{TIMELINE_STEPS[getStepIndex(order.status)]?.desc}</p>
                </div>
              )}

              {order.status === 'CANCELLED' && <div className="mb-4 flex items-center gap-2 rounded-xl bg-red-50 p-3"><XCircle className="h-5 w-5 text-red-600" /><p className="text-sm font-medium text-red-700">This order was cancelled.</p></div>}

              <div className="mb-4">
                <p className="mb-1.5 flex items-center gap-1 text-xs font-bold uppercase text-muted-foreground"><Package className="h-3 w-3" /> Items ({order.items.length})</p>
                <div className="flex flex-col gap-2">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 rounded-xl bg-muted/30 p-2">
                      {item.imageUrl && <img src={item.imageUrl} alt={item.itemName} className="h-12 w-12 shrink-0 rounded-lg object-cover" />}
                      <div className="min-w-0 flex-1"><p className="line-clamp-1 text-sm font-semibold text-foreground">{item.itemName}</p><p className="text-xs text-muted-foreground">{item.quantity} × {rupees(item.itemPrice)}</p></div>
                      <span className="text-sm font-bold text-foreground">{rupees(item.itemPrice * item.quantity)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mb-4">
                <p className="mb-1.5 flex items-center gap-1 text-xs font-bold uppercase text-muted-foreground"><Receipt className="h-3 w-3" /> Bill Details</p>
                <div className="rounded-2xl bg-muted/30 p-3">
                  <div className="flex flex-col gap-1.5 text-sm">
                    <BillRow label="Item Total" value={rupees(order.itemTotal)} />
                    <BillRow
                      label="Delivery Fee"
                      value={order.deliveryFee === 0 ? 'FREE' : rupees(order.deliveryFee)}
                    />
                    {/* Distance is shown here for the admin's reference —
                        it's the value used to compute the delivery charge
                        server-side. Useful for auditing delivery fee decisions. */}
                    {order.distanceKm != null && (
                      <BillRow
                        label="Distance"
                        value={`${order.distanceKm.toFixed(2)} km`}
                      />
                    )}
                    <div className="mt-1 flex justify-between border-t border-border pt-1.5"><span className="font-bold text-foreground">Total</span><span className="text-lg font-extrabold text-brand">{rupees(order.totalAmount)}</span></div>
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-xs"><span className="text-muted-foreground">Checkout payment mode: {order.paymentMode}</span><span className={`font-bold ${order.paymentStatus === 'PAID' ? 'text-emerald-600' : 'text-amber-600'}`}>{order.paymentStatus}</span></div>
                </div>
              </div>

              <div className="mb-4 rounded-2xl border border-border/60 bg-card p-3">
                <div className="mb-2 flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Payment Received</p>{order.paymentReceived ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700"><CheckCircle2 className="h-3 w-3" /> Paid{order.paymentReceivedMethod ? ` (${order.paymentReceivedMethod})` : ''}</span> : <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold uppercase text-orange-700">Pending</span>}</div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => updatePayment(order.id, true, 'Cash')} className={`rounded-lg py-2 text-sm font-bold transition ${order.paymentReceived && order.paymentReceivedMethod === 'Cash' ? 'bg-emerald-600 text-white' : 'bg-muted text-foreground hover:bg-emerald-50 hover:text-emerald-700'}`}>Received as Cash</button>
                  <button onClick={() => updatePayment(order.id, true, 'UPI')} className={`rounded-lg py-2 text-sm font-bold transition ${order.paymentReceived && order.paymentReceivedMethod === 'UPI' ? 'bg-emerald-600 text-white' : 'bg-muted text-foreground hover:bg-emerald-50 hover:text-emerald-700'}`}>Received as UPI</button>
                </div>
                {order.paymentReceived && <button onClick={() => updatePayment(order.id, false)} className="mt-2 w-full rounded-lg border border-orange-200 py-1.5 text-xs font-bold text-orange-700 hover:bg-orange-50">Reset to Pending</button>}
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">This tracks the actual method the customer paid with at the door — which may differ from the checkout choice above (e.g. COD order paid via UPI QR at the door).</p>
              </div>

              {order.notes && <div className="mb-4 rounded-xl bg-amber-50 p-3"><p className="text-xs font-bold uppercase text-amber-700"><span className="inline-flex items-center gap-1"><StickyNote className="h-3 w-3" /> Customer Note</span></p><p className="mt-1 text-sm text-amber-900">{order.notes}</p></div>}

              {order.paymentMode === 'UPI' && order.upiStatus !== 'NONE' && <UpiVerificationSection order={order} upiReview={upiReview} />}
            </div>

            <div className="border-t border-border bg-card p-3">
              <button onClick={() => printReceipt(order)} className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-sm font-bold text-foreground transition hover:bg-muted"><Printer className="h-4 w-4 text-brand" /> Print Receipt</button>

              <button
                onClick={deleteOrder}
                className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl border border-red-300 bg-red-50 py-2.5 text-sm font-bold text-red-700 transition hover:bg-red-100"
              >
                <Trash2 className="h-4 w-4" /> Delete Order
              </button>

              {order.status !== 'DELIVERED' && order.status !== 'CANCELLED' && <div className="mb-2 flex gap-2"><button onClick={() => { const next: OrderStatus | null = order.status === 'NEW' ? 'PREPARING' : order.status === 'PREPARING' ? 'OUT_FOR_DELIVERY' : order.status === 'OUT_FOR_DELIVERY' ? 'DELIVERED' : null; if (next) updateStatus(order.id, next) }} className="flex-1 rounded-xl bg-brand py-2.5 text-sm font-bold text-brand-foreground">Advance to next status →</button></div>}
              <div className="flex flex-wrap gap-2">
                {ORDER_STATUSES.filter((s) => s !== order.status).map((s) => <button key={s} onClick={() => updateStatus(order.id, s)} className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-semibold ${s === 'CANCELLED' ? 'border-red-300 text-red-700 hover:bg-red-50' : 'border-brand/30 text-brand hover:bg-brand-softer'}`}>Mark {ORDER_STATUS_LABELS[s]}</button>)}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function BillRow({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between"><span className="text-muted-foreground">{label}</span><span className="font-semibold text-foreground">{value}</span></div>
}

function UpiVerificationSection({ order, upiReview }: { order: AdminOrder; upiReview: (id: string, action: 'approve' | 'reject', note?: string) => Promise<boolean> }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const statusLabel: Record<string, { text: string; color: string }> = {
    AWAITING_SCREENSHOT: { text: 'Awaiting Screenshot', color: 'bg-blue-100 text-blue-700' },
    PENDING_VERIFICATION: { text: 'Pending Verification', color: 'bg-amber-100 text-amber-700' },
    PAID: { text: 'Paid (Verified)', color: 'bg-emerald-100 text-emerald-700' },
    EXPIRED: { text: 'Expired', color: 'bg-red-100 text-red-700' },
  }
  const st = statusLabel[order.upiStatus] ?? { text: order.upiStatus, color: 'bg-muted text-foreground' }
  const attempt = order.latestAttempt
  const failedList = attempt?.failedChecks ? attempt.failedChecks.split(',').filter(Boolean) : []

  async function doReview(action: 'approve' | 'reject') {
    setBusy(true)
    try { await upiReview(order.id, action, note.trim() || undefined) } finally { setBusy(false) }
  }

  return (
    <div className="mb-4 rounded-2xl border border-border/60 bg-card p-3">
      <div className="mb-2 flex items-center justify-between"><p className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" /> UPI Payment Verification</p><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${st.color}`}>{st.text}</span></div>
      {order.verifiedUtr && <div className="mb-2 rounded-lg bg-emerald-50 p-2 text-xs"><span className="font-bold text-emerald-700">Verified UTR: </span><code className="text-emerald-900">{order.verifiedUtr}</code></div>}
      {order.upiScreenshotUrl && <div className="mb-2"><p className="mb-1 flex items-center gap-1 text-[11px] font-bold uppercase text-muted-foreground"><ImageIcon className="h-3 w-3" /> Uploaded Screenshot</p><a href={order.upiScreenshotUrl} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg border border-border"><img src={order.upiScreenshotUrl} alt="Payment screenshot" className="max-h-64 w-full object-contain" /></a></div>}
      {attempt && attempt.status !== 'AWAITING_SCREENSHOT' && attempt.status !== 'EXPIRED' && <div className="mb-2 rounded-lg bg-muted/40 p-2.5 text-xs"><p className="mb-1.5 flex items-center gap-1 font-bold uppercase text-muted-foreground">{attempt.status === 'VERIFIED' ? <ShieldCheck className="h-3 w-3 text-emerald-600" /> : <ShieldAlert className="h-3 w-3 text-amber-600" />} AI Verification Result</p><div className="grid grid-cols-2 gap-x-3 gap-y-1"><DetailRow label="Authentic" value={attempt.geminiIsAuthentic == null ? '—' : attempt.geminiIsAuthentic ? 'Yes' : 'No'} /><DetailRow label="Confidence" value={attempt.geminiConfidence != null ? `${Math.round(attempt.geminiConfidence * 100)}%` : '—'} /><DetailRow label="Amount" value={attempt.geminiExtractedAmount != null ? `₹${attempt.geminiExtractedAmount}` : '—'} /><DetailRow label="Payee" value={attempt.geminiExtractedPayee ?? '—'} /><DetailRow label="Timestamp" value={attempt.geminiExtractedTimestamp ?? '—'} /><DetailRow label="UTR" value={attempt.geminiExtractedUtr ?? '—'} /></div>{attempt.geminiReasoning && <p className="mt-2 border-t border-border pt-1.5 text-[11px] italic text-muted-foreground">{attempt.geminiReasoning}</p>}{failedList.length > 0 && <div className="mt-2 rounded bg-amber-50 p-2"><p className="text-[11px] font-bold text-amber-700">Failed checks:</p><ul className="mt-0.5 space-y-0.5">{failedList.map((c) => <li key={c} className="flex items-center gap-1 text-[11px] text-amber-800"><XCircle className="h-3 w-3" /> {formatCheckName(c)}</li>)}</ul></div>}</div>}
      {order.upiStatus === 'PENDING_VERIFICATION' && <div className="mt-2"><input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Admin note (optional)" className="mb-2 w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand/40" /><div className="grid grid-cols-2 gap-2"><button onClick={() => doReview('approve')} disabled={busy} className="flex items-center justify-center gap-1 rounded-lg bg-emerald-600 py-2 text-xs font-bold text-white disabled:opacity-50"><CheckCircle2 className="h-3.5 w-3.5" /> Approve (mark Paid)</button><button onClick={() => doReview('reject')} disabled={busy} className="flex items-center justify-center gap-1 rounded-lg border border-red-300 py-2 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"><XCircle className="h-3.5 w-3.5" /> Reject (flag)</button></div><p className="mt-1.5 text-[11px] text-muted-foreground">Approving marks the order as Paid (UPI) and sends the Telegram payment-received alert.</p></div>}
      {attempt && <p className="mt-2 text-[10px] text-muted-foreground">Attempt #{attempt.attemptNumber} · Ref: {attempt.upiTxnRef} · Payee: {attempt.payeeVpa}</p>}
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <div><span className="text-muted-foreground">{label}: </span><span className="font-semibold text-foreground">{value}</span></div>
}

function formatCheckName(c: string): string {
  const map: Record<string, string> = { authenticity: 'Screenshot authenticity', timestamp: 'Payment timestamp within ±10 min', amount: 'Amount matches order total', payee: 'Payee UPI ID matches store', utr: 'UTR / transaction reference', gemini_api_error: 'AI verification service error' }
  return map[c] || c
}

async function printReceipt(order: AdminOrder) {
  // Fetch the PDF as a blob, then trigger it via a hidden <a download> click.
  // window.open() was used before but silently gets blocked as a popup
  // because it was called after two awaits — by then the browser no longer
  // treats it as part of the original click gesture. <a download>.click()
  // is not subject to that restriction and still avoids the sameSite-cookie
  // drop that a direct <a href="/api/..."> navigation caused on some
  // mobile browsers.
  try {
    const res = await fetch(`/api/orders/${order.id}/receipt?admin=1`, {
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
    console.error('Receipt fetch failed:', e)
    toast.error(e.message || 'Failed to load receipt')
  }
}
