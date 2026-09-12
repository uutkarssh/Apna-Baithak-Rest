'use client'
import { authedFetch } from '@/components/providers/providers'

import { useQuery } from '@tanstack/react-query'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Plus, MapPin, ShieldCheck, ShoppingBag, UtensilsCrossed, Truck } from 'lucide-react'
import { useApp } from '@/store/app'
import { useCart } from '@/store/cart'
import { useAuth } from '@/components/providers/auth-provider'
import { QtyStepper } from '@/components/apna/qty-stepper'
import { rupees } from '@/lib/format'
import { RESTAURANT } from '@/lib/constants'
import { computeDeliveryCharge, remainingForFreeDelivery } from '@/lib/delivery'
import type { Address } from '@/lib/types'

export function CartView() {
  const back = useApp((s) => s.back)
  const setView = useApp((s) => s.setView)
  const goToLogin = useApp((s) => s.goToLogin)
  const setSelectedAddressId = useApp((s) => s.setSelectedAddressId)
  const selectedAddressId = useApp((s) => s.selectedAddressId)
  const { profile, loading: authLoading } = useAuth()

  const lines = useCart((s) => s.lines)
  const increment = useCart((s) => s.increment)
  const decrement = useCart((s) => s.decrement)
  const removeItem = useCart((s) => s.removeItem)
  const subtotal = useCart((s) => s.subtotal())

  const { data, isLoading: addrLoading } = useQuery({
    queryKey: ['addresses'],
    queryFn: async () => {
      const res = await authedFetch('/api/addresses')
      if (!res.ok) return { addresses: [] }
      return res.json() as Promise<{ addresses: Address[] }>
    },
    // Only fetch once we know there's a session; if there's no session
    // after the auth state settles, we redirect to login anyway.
    enabled: !authLoading,
  })
  const addresses = data?.addresses ?? []
  const chosen =
    addresses.find((a) => a.id === selectedAddressId) ||
    addresses.find((a) => a.isDefault) ||
    null

  // === Dynamic delivery-charge calculation ===
  // Same formula as the backend (src/lib/delivery.ts). The server is the
  // source of truth for the stored charge, but we mirror it here so the
  // cart preview matches what the customer will actually pay.
  //
  // If no address is chosen yet, we can't compute distance — fall back to
  // showing the minimum charge (1km rate) as a placeholder so the total
  // isn't misleadingly low.
  const distanceKm = chosen?.distanceKm ?? null
  const deliveryCalc =
    distanceKm != null
      ? computeDeliveryCharge(distanceKm, subtotal)
      : null
  const deliveryFee = deliveryCalc?.finalCharge ?? 0
  const total = subtotal + deliveryFee
  const remainingForFree =
    distanceKm != null ? remainingForFreeDelivery(distanceKm, subtotal) : null
  const hasFreeDelivery = distanceKm != null && remainingForFree === 0

  function checkout() {
    // Don't bounce to login while the initial session check is still in
    // progress — the user may already be logged in (cookies are hydrating).
    if (authLoading) return
    if (!profile) {
      // Remember cart as the return destination after login.
      goToLogin('cart')
      return
    }
    if (!chosen) {
      setView('location')
      return
    }
    setView('checkout')
  }

  return (
    <div className="flex min-h-full flex-col pb-4">
      <header className="sticky top-0 z-10 bg-background/95 px-4 py-3 backdrop-blur sm:px-0">
        <div className="flex items-center gap-3">
          <button onClick={back} className="grid h-9 w-9 place-items-center rounded-full bg-muted">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-xl font-bold text-foreground">Your Cart</h1>
          {lines.length > 0 && (
            <span className="ml-auto rounded-full bg-brand-softer px-3 py-1 text-xs font-semibold text-brand">
              {lines.reduce((n, l) => n + l.quantity, 0)} items
            </span>
          )}
        </div>
      </header>

      {lines.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-4 mt-6 grid place-items-center rounded-2xl border border-dashed border-border py-16 text-center"
        >
          <div className="relative mb-4">
            <div className="absolute inset-0 -z-10 rounded-full bg-brand-softer blur-xl" />
            <div className="grid h-24 w-24 place-items-center rounded-full bg-brand-softer">
              <ShoppingBag className="h-10 w-10 text-brand/60" />
            </div>
          </div>
          <p className="text-base font-bold text-foreground">Your cart is empty</p>
          <p className="mt-1 max-w-[240px] text-xs leading-relaxed text-muted-foreground">
            Browse our menu and add your favourite pizzas, burgers, pasta and more to get started.
          </p>
          <button
            onClick={() => setView('home')}
            className="mt-5 rounded-full bg-brand px-6 py-3 text-sm font-bold text-brand-foreground shadow-md transition hover:brightness-105 active:scale-95"
          >
            Browse menu →
          </button>
          <button
            onClick={() => setView('categories')}
            className="mt-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            Or search for a specific dish
          </button>
        </motion.div>
      ) : (
        <div className="flex flex-col gap-4 px-4">
          {/* Address confirmation card (Instamart-style) */}
          <button
            onClick={() => {
              if (authLoading) return
              if (profile) setView('location')
              else goToLogin('cart')
            }}
            className="flex items-start gap-3 rounded-2xl border border-brand/20 bg-brand-softer p-3 text-left"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white shadow-sm">
              <MapPin className="h-5 w-5 text-brand" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {chosen ? 'Delivering to' : 'Add address to proceed'}
              </span>
              <span className="block text-sm font-bold text-foreground">
                {chosen ? `${chosen.houseFlat}, ${chosen.streetArea}` : 'No address selected yet'}
              </span>
              <span className="block text-[11px] text-muted-foreground">
                {chosen
                  ? `${chosen.city} - ${chosen.pincode}${chosen.distanceKm != null ? ` · ${chosen.distanceKm.toFixed(2)} km away` : ''}`
                  : 'Tap to choose or add a delivery address within 10 km of the restaurant'}
              </span>
            </span>
            {chosen ? (
              <span className="text-xs font-semibold text-brand">Change</span>
            ) : (
              <ArrowRight className="h-4 w-4 text-brand" />
            )}
          </button>

          {/* Cart items */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">Items in cart</h3>
              <button onClick={() => setView('home')} className="text-xs font-semibold text-brand">
                + Add more items
              </button>
            </div>
            <div className="flex flex-col gap-2.5">
              {lines.map((l) => (
                <div
                  key={l.itemId}
                  className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-2.5 shadow-sm"
                >
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-muted">
                    {l.imageUrl ? (
                      <Image src={l.imageUrl} alt={l.name} fill sizes="64px" className="object-cover" />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-brand/40"><UtensilsCrossed className="h-5 w-5" /></div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="line-clamp-1 text-sm font-bold text-foreground">{l.name}</h4>
                    <p className="text-xs text-muted-foreground">{rupees(l.price)} each</p>
                    <button
                      onClick={() => removeItem(l.itemId)}
                      className="mt-0.5 text-[11px] font-medium text-destructive"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <QtyStepper
                      qty={l.quantity}
                      onInc={() => increment(l.itemId)}
                      onDec={() => decrement(l.itemId)}
                      size="sm"
                    />
                    <span className="text-sm font-extrabold text-foreground">
                      {rupees(l.price * l.quantity)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Free-delivery progress message — only shown when an address
              is selected (so distance is known). Updates live as the cart
              subtotal changes or the selected address changes. */}
          {chosen && distanceKm != null && (
            <div
              className={`flex items-start gap-2 rounded-2xl p-3 text-xs leading-relaxed ${
                hasFreeDelivery
                  ? 'bg-emerald-50 text-emerald-900'
                  : 'bg-brand-softer text-foreground'
              }`}
            >
              <Truck className={`mt-0.5 h-4 w-4 shrink-0 ${hasFreeDelivery ? 'text-emerald-600' : 'text-brand'}`} />
              <p className="flex-1">
                {hasFreeDelivery ? (
                  <span className="font-bold">You've unlocked free delivery!</span>
                ) : (
                  <>
                    Add <span className="font-bold text-brand">{rupees(remainingForFree ?? 0)}</span> more
                    to get free delivery.
                    <span className="mt-0.5 block text-muted-foreground">
                      Free delivery at {rupees(computeDeliveryCharge(distanceKm, 0).freeThreshold)} for this distance ({distanceKm.toFixed(2)} km).
                    </span>
                  </>
                )}
              </p>
            </div>
          )}

          {/* Bill details — only item subtotal + delivery charge + total. */}
          <section className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-bold text-foreground">Bill Details</h3>
            <dl className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <dt>Item Total</dt>
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

          {/* Non-cancellable note */}
          <div className="flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-amber-900">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-xs leading-relaxed">
              Orders cannot be cancelled or refunded once preparation begins. By placing an order you
              agree to <span className="font-semibold">Apna Baithak</span>'s cancellation & refund policy.
            </p>
          </div>

          <div className="h-24" />
        </div>
      )}

      {/* Sticky checkout bar */}
      {lines.length > 0 && (
        <div className="sticky bottom-0 z-20 border-t border-border bg-background px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <button
            onClick={checkout}
            className="flex w-full items-center justify-between gap-3 rounded-xl bg-brand px-5 py-3.5 text-brand-foreground shadow-md transition active:scale-[0.99]"
          >
            <span className="flex flex-col items-start">
              <span className="text-[11px] font-medium uppercase tracking-wide opacity-80">
                {chosen ? `${chosen.houseFlat}, ${chosen.city}` : 'Select address'}
              </span>
              <span className="text-base font-extrabold">{rupees(total)} · {lines.reduce((n, l) => n + l.quantity, 0)} items</span>
            </span>
            <span className="flex items-center gap-1 text-sm font-bold">
              {profile ? 'Place Order' : 'Sign in to order'}
              <ArrowRight className="h-4 w-4" />
            </span>
          </button>
        </div>
      )}
    </div>
  )
}
