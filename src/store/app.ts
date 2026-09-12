'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Order } from '@/lib/types'

export type View =
  | 'home'
  | 'categories'
  | 'category-listing'
  | 'item-detail'
  | 'cart'
  | 'location'
  | 'profile'
  | 'orders'
  | 'checkout'
  | 'login'
  | 'upi-payment'
  | 'order-confirmation'

type AppState = {
  view: View
  activeCategorySlug: string | null
  activeItemSlug: string | null
  selectedAddressId: string | null
  search: string
  _stack: View[]
  // Where the user was BEFORE they got bounced to the login screen — used by
  // LoginView to return them to where they came from after a successful login
  // (instead of always forcing them to the cart).
  loginReturnTo: View | null
  // The order being paid for via UPI (set when navigating to 'upi-payment')
  activeOrder: Order | null
  // The UPI confirmation status to show on the order-confirmation screen
  // ('PAID' | 'PENDING_VERIFICATION') — set when navigating from the payment
  // screen to the confirmation screen.
  upiConfirmationStatus: string | null

  setView: (v: View) => void
  openCategory: (slug: string) => void
  openItem: (slug: string) => void
  setSelectedAddressId: (id: string | null) => void
  setSearch: (q: string) => void
  /** Navigate to login, remembering where to return to after successful auth. */
  goToLogin: (returnTo?: View) => void
  /** Called by LoginView after successful login — returns to the remembered
   *  view, or to the cart if none was remembered. Clears the field. */
  returnFromLogin: () => void
  /** Navigate to the UPI payment screen for the given order. */
  goToUpiPayment: (order: Order) => void
  /** Navigate to the order confirmation screen, REPLACING the current
   *  history entry (so back-button doesn't return to checkout/payment). */
  goToOrderConfirmation: (order: Order, upiStatus: string) => void
  back: () => void
}

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      view: 'home',
      activeCategorySlug: null,
      activeItemSlug: null,
      selectedAddressId: null,
      search: '',
      _stack: [],
      loginReturnTo: null,
      activeOrder: null,
      upiConfirmationStatus: null,
      setView: (v) =>
        set((s) => (s.view === v ? {} : { view: v, _stack: [...s._stack, s.view].slice(-30) })),
      openCategory: (slug) =>
        set((s) => ({
          activeCategorySlug: slug,
          view: 'category-listing',
          _stack: [...s._stack, s.view].slice(-30),
        })),
      openItem: (slug) =>
        set((s) => ({
          activeItemSlug: slug,
          view: 'item-detail',
          _stack: [...s._stack, s.view].slice(-30),
        })),
      setSelectedAddressId: (id) => set({ selectedAddressId: id }),
      setSearch: (q) => set({ search: q }),
      goToLogin: (returnTo) =>
        set((s) => ({
          // Remember where to return to. Defaults to the current view.
          loginReturnTo: returnTo ?? s.view,
          view: 'login',
          _stack: [...s._stack, s.view].slice(-30),
        })),
      returnFromLogin: () =>
        set((s) => {
          const target = s.loginReturnTo ?? 'cart'
          return { view: target, loginReturnTo: null }
        }),
      goToUpiPayment: (order) =>
        set((s) => ({
          activeOrder: order,
          view: 'upi-payment',
          _stack: [...s._stack, s.view].slice(-30),
        })),
      // Navigate to order confirmation, REPLACING the current history entry.
      // We do NOT push the current view (upi-payment) onto the stack — instead
      // we pop one level (removing 'upi-payment' and 'checkout' from the back
      // chain) so pressing back from the confirmation screen goes to the cart
      // or home, never back into the payment/checkout flow.
      //
      // The stack at this point typically looks like:
      //   [..., 'cart', 'checkout', 'upi-payment']  (current = 'upi-payment')
      // We want back from 'order-confirmation' to go to 'cart', so we trim
      // the stack down to remove 'checkout' and 'upi-payment'.
      goToOrderConfirmation: (order, upiStatus) =>
        set((s) => {
          // Trim the stack: remove 'checkout' and 'upi-payment' entries so
          // back-button skips the entire payment flow.
          let stack = [...s._stack]
          // Pop 'upi-payment' (the current view, not in stack yet) — nothing to pop
          // Pop 'checkout' and 'upi-payment' from the stack if present
          stack = stack.filter((v) => v !== 'checkout' && v !== 'upi-payment')
          return {
            activeOrder: order,
            upiConfirmationStatus: upiStatus,
            view: 'order-confirmation',
            _stack: stack,
          }
        }),
      back: () =>
        set((s) => {
          if (s._stack.length === 0) return { view: 'home' }
          const prev = s._stack[s._stack.length - 1]
          return { view: prev, _stack: s._stack.slice(0, -1) }
        }),
    }),
    {
      name: 'apna-baithak-app',
      storage: createJSONStorage(() => localStorage),
      // Persist selectedAddressId + activeOrder + upiConfirmationStatus so
      // that refreshing the page on the UPI payment or order-confirmation
      // screen doesn't show a blank page (activeOrder would be null otherwise,
      // and the render guard in apna-baithak-app.tsx would render nothing).
      partialize: (s) => ({
        selectedAddressId: s.selectedAddressId,
        activeOrder: s.activeOrder,
        upiConfirmationStatus: s.upiConfirmationStatus,
      }),
    }
  )
)
