'use client'

import { useSyncExternalStore, useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useApp } from '@/store/app'
import { useCart } from '@/store/cart'
import { TopBar } from './top-bar'
import { TopNav, BottomNav } from './bottom-nav'
import { StickyCartBar } from './sticky-cart-bar'
import { HomeView } from './views/home-view'
import { CategoriesView } from './views/categories-view'
import { CategoryListingView } from './views/category-listing-view'
import { ItemDetailView } from './views/item-detail-view'
import { CartView } from './views/cart-view'
import LocationView from './views/location-view'
import { ProfileView } from './views/profile-view'
import { OrdersView } from './views/orders-view'
import { CheckoutView } from './views/checkout-view'
import { UpiPaymentView } from './views/upi-payment-view'
import { OrderConfirmationView } from './views/order-confirmation-view'
import { LoginView } from './views/login-view'

const emptySubscribe = () => () => {}
function useMounted() {
  return useSyncExternalStore(emptySubscribe, () => true, () => false)
}

const VIEW_VARIANTS = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
}

const CART_BAR_VIEWS = new Set(['home', 'categories', 'category-listing', 'item-detail'])

const HIDE_TOPBAR_VIEWS = new Set([
  'item-detail', 'cart', 'category-listing', 'categories', 'location', 'checkout',
  'orders', 'profile', 'login', 'upi-payment', 'order-confirmation',
])

export function ApnaBaithakApp() {
  const view = useApp((s) => s.view)
  const activeOrder = useApp((s) => s.activeOrder)
  const openItem = useApp((s) => s.openItem)
  const back = useApp((s) => s.back)
  const count = useCart((s) => s.count())
  const mounted = useMounted()
  const skipHistoryPush = useRef(false)
  const historyReady = useRef(false)

  const hideTopBar = HIDE_TOPBAR_VIEWS.has(view)
  const showCartBar = mounted && count > 0 && CART_BAR_VIEWS.has(view)

  // Treat the in-app views as a browser history stack too. This makes the
  // Android/iOS hardware back button behave like the app's own back button:
  // any internal screen goes back inside Apna Baithak, while Home is the
  // boundary and the next back press is allowed to leave the website.
  useEffect(() => {
    if (typeof window === 'undefined') return

    if (!historyReady.current) {
      window.history.replaceState(
        { apnaBaithak: true, view: 'home' },
        '',
        window.location.href
      )
      historyReady.current = true
      return
    }

    if (skipHistoryPush.current) {
      skipHistoryPush.current = false
      return
    }

    window.history.pushState(
      { apnaBaithak: true, view },
      '',
      window.location.href
    )
  }, [view])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handlePopState = (event: PopStateEvent) => {
      if (event.state?.apnaBaithak) {
        skipHistoryPush.current = true
        back()
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [back])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      document.documentElement.scrollTop = 0
      document.body.scrollTop = 0
      const main = document.querySelector('main')
      if (main instanceof HTMLElement) main.scrollTop = 0
    })
    return () => window.cancelAnimationFrame(frame)
  }, [view])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const itemSlug = params.get('item')
    if (itemSlug) {
      openItem(itemSlug)
      const url = new URL(window.location.href)
      url.searchParams.delete('item')
      window.history.replaceState({}, '', url.toString())
    }
  }, [openItem])

  return (
    <div className="flex min-h-[100dvh] flex-col bg-muted/30" suppressHydrationWarning>
      <TopNav />
      <main
        className="mx-auto w-full max-w-screen-2xl flex-1 bg-background px-0 pb-24 sm:px-6 landscape:pb-6 lg:px-8"
        suppressHydrationWarning
      >
        {!hideTopBar && <TopBar />}
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={VIEW_VARIANTS.initial}
            animate={VIEW_VARIANTS.animate}
            exit={VIEW_VARIANTS.exit}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            {view === 'home' && <HomeView />}
            {view === 'categories' && <CategoriesView />}
            {view === 'category-listing' && <CategoryListingView />}
            {view === 'item-detail' && <ItemDetailView />}
            {view === 'cart' && <CartView />}
            {view === 'location' && <LocationView />}
            {view === 'profile' && <ProfileView />}
            {view === 'orders' && <OrdersView />}
            {view === 'checkout' && <CheckoutView />}
            {view === 'login' && <LoginView />}
            {view === 'upi-payment' && activeOrder && <UpiPaymentView order={activeOrder} />}
            {view === 'order-confirmation' && activeOrder && (
              <OrderConfirmationView order={activeOrder} />
            )}
          </motion.div>
        </AnimatePresence>
      </main>
      {showCartBar && <StickyCartBar />}
      <BottomNav />
      {count > 0 && mounted && <div className="h-4 landscape:hidden" />}
    </div>
  )
}
