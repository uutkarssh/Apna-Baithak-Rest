'use client'
import { authedFetch } from '@/components/providers/providers'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  MapPin,
  CreditCard,
  Banknote,
  CheckCircle2,
  Loader2,
  ArrowRight,
} from 'lucide-react'
import { useApp } from '@/store/app'
import { useCart } from '@/store/cart'
import { useAuth } from '@/components/providers/auth-provider'
import { rupees } from '@/lib/format'
import { PAYMENT_MODES, RESTAURANT } from '@/lib/constants'
import { computeDeliveryCharge } from '@/lib/delivery'
import type { Address } from '@/lib/types'
import { toast } from 'sonner'
import type { Order } from '@/lib/types'

export function CheckoutView() {
  const back = useApp((s) => s.back)
  const setView = useApp((s) => s.setView)
  const goToUpiPayment = useApp((s) => s.goToUpiPayment)
  const goToOrderConfirmation = useApp((s) => s.goToOrderConfirmation)
  const selectedAddressId = useApp((s) => s.selectedAddressId)
  const lines = useCart((s) => s.lines)
  const subtotal = useCart((s) => s.subtotal())
  const clear = useCart((s) => s.clear)
  const { profile, loading: authLoading } = useAuth()
  const [paymentMode, setPaymentMode] = useState<'COD' | 'UPI'>('COD')
  const [notes, setNotes] = useState('')
  const [placing, setPlacing] = useState(false)

  const { data } = useQuery({
    queryKey: ['addresses'],
    queryFn: async () => {
      const res = await authedFetch('/api/addresses')
      if (!res.ok) return { addresses: [] }
      return res.json() as Promise<{ addresses: Address[] }>
    },
    enabled: !authLoading,
  })
  const addresses = data?.addresses ?? []
  const chosen =
    addresses.find((a) => a.id === selectedAddressId) ||
    addresses.find((a) => a.isDefault) ||
    null

  useEffect(() => {
    if (authLoading || !profile || profile.phone?.trim()) return
    try {
      localStorage.setItem('apna-baithak-require-phone', '1')
    } catch {}
    toast.error('Contact number is required before checkout')
    setView('profile')
  }, [authLoading, profile, setView])

  // === Dynamic delivery-charge calculation ===
  // Mirrors the server-side computation in /api/checkout. The server is the
  // source of truth for the stored charge, but we replicate it here so the
  // checkout preview matches what the customer will pay. The server will
  // recompute and validate this on submission — a client cannot bypass it.
  const distanceKm = chosen?.distanceKm ?? null
  const deliveryCalc =
    distanceKm != null ? computeDeliveryCharge(distanceKm, subtotal) : null
  const deliveryFee = deliveryCalc?.finalCharge ?? 0
  const total = subtotal + deliveryFee

  async function placeOrder() {
    if (authLoading) {
      toast.error('Please wait while your account loads')
      return
    }
    if (!profile?.phone?.trim()) {
      try {
        localStorage.setItem('apna-baithak-require-phone', '1')
      } catch {}
      toast.error('Contact number is required before placing an order')
      setView('profile')
      return
    }
    if (!chosen) {
      toast.error('Please choose a delivery address')
      setView('location')
      return
    }
    if (lines.length === 0) {
      toast.error('Your cart is empty')
      setView('cart')
      return
    }
    setPlacing(true)
    try {
      const res = await authedFetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity })),
          addressId: chosen.id,
          paymentMode,
          notes: notes.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Failed to place order')
      }
      const { order } = (await res.json()) as { order: Order }
      if (paymentMode === 'UPI') {
        goToUpiPayment(order)
        toast.success(`Order ${order.orderNumber} placed! Complete your UPI payment.`)
      } else {
        clear()
        toast.success(`Order ${order.orderNumber} placed!`)
        goToOrderConfirmation(order, 'PAID')
      }
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setPlacing(false)
    }
  }

  return (
    <div className="flex min-h-full flex-col pb-6">
      <header className="sticky top-0 z-10 bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <button onClick={back} className="grid h-9 w-9 place-items-center rounded-full bg-muted">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-xl font-bold text-foreground">Checkout</h1>
        </div>
      </header>

      <div className="flex flex-col gap-4 px-4">
        <section>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Delivery Address
          </h2>
          {chosen ? (
            <div className="rounded-2xl border border-border/60 bg-card p-3 shadow-sm">
              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-foreground">
                    {chosen.label ?? 'Address'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {chosen.houseFlat}, {chosen.streetArea}, {chosen.city} - {chosen.pincode}
                  </p>
                  {chosen.distanceKm != null && (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {chosen.distanceKm.toFixed(2)} km from restaurant
                    </p>
                  )}
                </div>
                <button onClick={() => setView('location')} className="text-xs font-semibold text-brand">
                  Change
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setView('location')}
              className="flex w-full items-center justify-between rounded-2xl border border-dashed border-border p-4 text-left"
            >
              <span className="text-sm text-muted-foreground">Add a delivery address to proceed</span>
              <ArrowRight className="h-4 w-4 text-brand" />
            </button>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Payment Mode
          </h2>
          <div className="flex flex-col gap-2">
            {PAYMENT_MODES.map((p) => (
              <button
                key={p.id}
                onClick={() => setPaymentMode(p.id as 'COD' | 'UPI')}
                className={`flex items-center gap-3 rounded-2xl border p-3 transition ${
                  paymentMode === p.id
                    ? 'border-brand bg-brand-softer'
                    : 'border-border bg-card'
                }`}
              >
                <span className="grid h-9 w-9 place-items-center rounded-full bg-white shadow-sm">
                  {p.id === 'COD' ? (
                    <Banknote className="h-5 w-5 text-brand" />
                  ) : (
                    <CreditCard className="h-5 w-5 text-brand" />
                  )}
                </span>
                <span className="flex-1 text-left">
                  <span className="block text-sm font-bold text-foreground">{p.label}</span>
                  <span className="block text-xs text-muted-foreground">{p.desc}</span>
                </span>
                <span
                  className={`grid h-5 w-5 place-items-center rounded-full border-2 ${
                    paymentMode === p.id ? 'border-brand bg-brand' : 'border-border'
                  }`}
                >
                  {paymentMode === p.id && <CheckCircle2 className="h-3 w-3 text-brand-foreground" />}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Order Notes (optional)
          </h2>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Less spicy, call on arrival…"
            rows={2}
            className="w-full resize-none rounded-xl bg-muted px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand/40"
          />
        </section>

        <section className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-bold text-foreground">Bill Details</h2>
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <dt>Item Total ({lines.reduce((n, l) => n + l.quantity, 0)} items)</dt>
              <dd className="font-semibold text-foreground">{rupees(subtotal)}</dd>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <dt>Delivery Fee</dt>
              <dd className="font-semibold text-foreground">
                {distanceKm == null
                  ? 'Select address'
                  : deliveryFee === 0
                  ? <span className="text-emerald-600">FREE</span>
                  : rupees(deliveryFee)}
              </dd>
            </div>
            <div className="mt-1 flex justify-between border-t border-border pt-2">
              <dt className="font-bold text-foreground">To Pay</dt>
              <dd className="text-lg font-extrabold text-brand">{rupees(total)}</dd>
            </div>
          </dl>
        </section>

        <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
          By placing this order you agree that orders cannot be cancelled or refunded once
          preparation begins at {RESTAURANT.name}.
        </p>
        <div className="h-24" />
      </div>

      <div className="sticky bottom-0 z-20 border-t border-border bg-background px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <button
          onClick={placeOrder}
          disabled={placing || authLoading || !profile?.phone?.trim() || !chosen || lines.length === 0}
          className="flex w-full items-center justify-between gap-3 rounded-xl bg-brand px-5 py-3.5 text-brand-foreground shadow-md transition active:scale-[0.99] disabled:opacity-50"
        >
          <span className="flex items-center gap-2 text-sm font-bold">
            {placing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {placing
              ? 'Placing order…'
              : paymentMode === 'UPI'
              ? `Pay ${rupees(total)}`
              : `Place Order · ${rupees(total)}`}
          </span>
          {!placing && <ArrowRight className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}
