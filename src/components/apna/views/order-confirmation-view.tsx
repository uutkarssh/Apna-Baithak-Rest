'use client'

import { useEffect } from 'react'
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Clock,
  MapPin,
  Receipt,
  Home as HomeIcon,
  Package,
} from 'lucide-react'
import { useApp } from '@/store/app'
import { useCart } from '@/store/cart'
import { rupees } from '@/lib/format'
import { RESTAURANT } from '@/lib/constants'
import type { Order } from '@/lib/types'

/**
 * Order Confirmation screen — shown after:
 *  - COD checkout (status = NEW, paymentMode = COD)
 *  - UPI payment verified (upiStatus = PAID)
 *  - UPI payment pending verification (upiStatus = PENDING_VERIFICATION)
 *
 * This screen is reached via goToOrderConfirmation() which REPLACES history,
 * so pressing the back button does NOT return to checkout/payment.
 */
export function OrderConfirmationView({ order }: { order: Order }) {
  const back = useApp((s) => s.back)
  const setView = useApp((s) => s.setView)
  const upiConfirmationStatus = useApp((s) => s.upiConfirmationStatus)
  const clearCart = useCart((s) => s.clear)

  // Clear the cart on mount (the order is placed, cart is no longer needed)
  useEffect(() => {
    clearCart()
  }, [clearCart])

  // Determine the confirmation state
  const isPaid = upiConfirmationStatus === 'PAID' || order.paymentMode === 'COD'
  const isPendingVerification = upiConfirmationStatus === 'PENDING_VERIFICATION'

  return (
    <div className="flex min-h-full flex-col pb-6">
      <header className="sticky top-0 z-10 bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setView('home')}
            className="grid h-9 w-9 place-items-center rounded-full bg-muted"
            aria-label="Back to home"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-xl font-bold text-foreground">Order Confirmation</h1>
        </div>
      </header>

      <div className="flex flex-col gap-4 px-4">
        {/* Status hero */}
        <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
          {isPendingVerification ? (
            <>
              <div className="grid h-20 w-20 place-items-center rounded-full bg-amber-100">
                <AlertTriangle className="h-12 w-12 text-amber-600" />
              </div>
              <h2 className="text-2xl font-extrabold text-foreground">Payment Under Review</h2>
              <p className="max-w-sm px-4 text-sm text-muted-foreground">
                We couldn&apos;t automatically verify your payment, but your order{' '}
                <span className="font-bold text-foreground">{order.orderNumber}</span> has been
                placed. Our team will confirm your payment shortly — you&apos;ll receive a
                notification once confirmed.
              </p>
            </>
          ) : (
            <>
              <div className="grid h-20 w-20 place-items-center rounded-full bg-emerald-100">
                <CheckCircle2 className="h-12 w-12 text-emerald-600" />
              </div>
              <h2 className="text-2xl font-extrabold text-foreground">Order Confirmed!</h2>
              <p className="max-w-sm px-4 text-sm text-muted-foreground">
                Your order{' '}
                <span className="font-bold text-foreground">{order.orderNumber}</span> has been
                received by {RESTAURANT.name}. We&apos;ll start preparing it right away!
              </p>
            </>
          )}
        </div>

        {/* Order summary card */}
        <section className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between border-b border-border/50 pb-2">
            <span className="text-xs font-bold uppercase text-muted-foreground">Order Summary</span>
            <span className="text-sm font-bold text-foreground">{order.orderNumber}</span>
          </div>
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Package className="h-4 w-4" /> Items
              </span>
              <span className="font-semibold text-foreground">
                {order.items.reduce((n, i) => n + i.quantity, 0)} item
                {order.items.reduce((n, i) => n + i.quantity, 0) === 1 ? '' : 's'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Receipt className="h-4 w-4" /> Amount
              </span>
              <span className="text-lg font-extrabold text-brand">
                {rupees(order.totalAmount)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Clock className="h-4 w-4" /> Payment
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                  isPendingVerification
                    ? 'bg-amber-100 text-amber-700'
                    : isPaid
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-muted text-foreground'
                }`}
              >
                {isPendingVerification
                  ? 'Pending Verification'
                  : order.paymentMode === 'UPI'
                  ? 'Paid (UPI)'
                  : 'Cash on Delivery'}
              </span>
            </div>
            {order.distanceKm != null && (
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <MapPin className="h-4 w-4" /> Distance
                </span>
                <span className="font-semibold text-foreground">
                  {order.distanceKm.toFixed(2)} km
                </span>
              </div>
            )}
          </div>
        </section>

        {/* Delivery address */}
        <section className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
          <p className="mb-1 flex items-center gap-1 text-xs font-bold uppercase text-muted-foreground">
            <MapPin className="h-3 w-3" /> Delivery Address
          </p>
          <p className="text-sm text-foreground">{order.addressLine}</p>
          {order.distanceKm != null && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {order.distanceKm.toFixed(2)} km from restaurant · ETA ~{RESTAURANT.deliveryEtaMin}
            </p>
          )}
        </section>

        {/* Pending verification info box */}
        {isPendingVerification && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5" /> What happens next?
            </p>
            <ul className="mt-2 space-y-1.5 text-xs text-amber-900">
              <li>• Our team will manually review your payment screenshot</li>
              <li>• Confirmation usually takes a few minutes during business hours</li>
              <li>• You can track your order status anytime from the Orders page</li>
              <li>• If there&apos;s an issue, we&apos;ll call you at the number provided</li>
            </ul>
          </section>
        )}

        {/* Actions */}
        <div className="mt-2 flex flex-col gap-2">
          <button
            onClick={() => setView('orders')}
            className="w-full rounded-xl bg-brand py-3.5 text-sm font-bold text-brand-foreground shadow-md"
          >
            Track my order
          </button>
          <button
            onClick={() => setView('home')}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-border py-3 text-sm font-bold text-foreground"
          >
            <HomeIcon className="h-4 w-4" /> Back to home
          </button>
        </div>

        <p className="mt-2 px-1 text-center text-[11px] leading-relaxed text-muted-foreground">
          Need help? Call us at {RESTAURANT.phone} or email {RESTAURANT.email}
        </p>
        <div className="h-8" />
      </div>
    </div>
  )
}
