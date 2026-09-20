'use client'

import { useQuery } from '@tanstack/react-query'
import Image from 'next/image'
import { Search, Star, Clock, MapPin, UtensilsCrossed, AlertCircle } from 'lucide-react'
import { motion } from 'framer-motion'
import { useApp } from '@/store/app'
import { ItemCard } from '@/components/apna/item-card'
import { ItemCardSkeleton, CategorySkeleton } from '@/components/apna/skeletons'
import { RESTAURANT } from '@/lib/constants'
import { BrandWordmark } from '@/components/brand/brand-logo'
import { CustomerPushHomePrompt } from '@/components/apna/customer-push-home-prompt'
import type { Category, MenuItem } from '@/lib/types'

export function HomeView() {
  const openCategory = useApp((s) => s.openCategory)
  const setView = useApp((s) => s.setView)

  // Fetch the restaurant's order-acceptance status. When false, we show a
  // calm banner at the top of the homepage so customers know before they
  // even build a cart. The hard block still exists at /api/checkout.
  const { data: settingsData } = useQuery({
    queryKey: ['restaurant-settings'],
    queryFn: async () => {
      const res = await fetch('/api/settings')
      if (!res.ok) return { isAcceptingOrders: true as const }
      return res.json() as Promise<{ isAcceptingOrders: boolean }>
    },
    refetchInterval: 30_000,
  })
  const isAcceptingOrders = settingsData?.isAcceptingOrders ?? true

  const { data: catData, isLoading: catsLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await fetch('/api/menu/categories')
      if (!res.ok) return { categories: [] }
      return res.json() as Promise<{ categories: Category[] }>
    },
  })

  const { data: itemsData, isLoading: itemsLoading } = useQuery({
    queryKey: ['menu-items', 'home'],
    queryFn: async () => {
      const res = await fetch('/api/menu/items')
      if (!res.ok) return { items: [] }
      return res.json() as Promise<{ items: MenuItem[] }>
    },
  })

  // Fetch featured items — these are the items the admin has marked as
  // featured (via drag-and-drop in the admin panel). Ordered by featuredOrder.
  // If zero items are featured, this returns an empty array and the homepage
  // hides the Featured Items section entirely (graceful fallback).
  const { data: featuredData } = useQuery({
    queryKey: ['menu-featured'],
    queryFn: async () => {
      const res = await fetch('/api/menu/featured')
      if (!res.ok) return { items: [] }
      return res.json() as Promise<{ items: MenuItem[] }>
    },
  })

  // Fetch restaurant average rating
  const { data: ratingData } = useQuery({
    queryKey: ['restaurant-rating'],
    queryFn: async () => {
      const res = await fetch('/api/ratings')
      if (!res.ok) return { avgRating: 0, totalReviews: 0 }
      return res.json() as Promise<{ avgRating: number; totalReviews: number }>
    },
  })

  const categories = catData?.categories ?? []
  const items = itemsData?.items ?? []
  // Featured items come from the dedicated /api/menu/featured endpoint
  // (admin-controlled via drag-and-drop). Fall back to first 10 of all items
  // only if the featured endpoint hasn't loaded yet AND items have loaded —
  // this prevents a flash of empty content on first paint.
  const featured = featuredData?.items ?? []
  const popular = items.slice(6, 20)
  const avgRating = ratingData?.avgRating ?? 0
  const totalReviews = ratingData?.totalReviews ?? 0

  return (
    <div className="flex flex-col gap-5 pb-6">
      {/* Search */}
      <div className="px-4 sm:px-0">
        <button
          onClick={() => setView('categories')}
          className="flex w-full items-center gap-2 rounded-full border border-brand/20 bg-white px-4 py-3 text-left shadow-sm transition hover:shadow-md"
        >
          <Search className="h-4 w-4 text-brand" />
          <span className="text-sm text-muted-foreground">Search for pizzas, burgers, chaat…</span>
        </button>
      </div>

      {/* Calm "we'll be back soon" banner — shown when the admin has paused
          orders. This is a friendly heads-up so customers know before they
          build a cart. The hard block still exists at /api/checkout. */}
      {!isAcceptingOrders && (
        <div className="px-4 sm:px-0">
          <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-blue-900">
            <Clock className="mt-0.5 h-5 w-5 shrink-0 text-blue-500" />
            <div>
              <p className="text-sm font-bold">We're currently closed</p>
              <p className="mt-1 text-xs leading-relaxed text-blue-700">
                We'll be back soon! Please check back in a little while. Thank you for your patience.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Web Push opt-in banner — dismissible, only shows for logged-in
          customers who haven't enabled push and haven't dismissed this prompt
          in the last 14 days. Auto-hides for unsupported browsers, denied
          permission, already-subscribed, etc. See component for full rules. */}
      <CustomerPushHomePrompt />

      {/* Categories — horizontal rail on mobile, responsive grid on >= sm */}
      <section className="px-4 sm:px-0">
        {catsLoading ? (
          <>
            <div className="no-scrollbar flex gap-4 overflow-x-auto pb-1 sm:hidden">
              {Array.from({ length: 8 }).map((_, i) => <CategorySkeleton key={i} />)}
            </div>
            <div className="hidden grid-cols-4 gap-3 sm:grid md:grid-cols-6 lg:grid-cols-8">
              {Array.from({ length: 8 }).map((_, i) => <CategorySkeleton key={i} />)}
            </div>
          </>
        ) : (
          <>
            <div className="no-scrollbar flex gap-4 overflow-x-auto pb-1 sm:hidden">
              {categories.map((c, i) => (
                <CategoryButton key={c.id} category={c} index={i} onClick={() => openCategory(c.slug)} />
              ))}
            </div>
            <div className="hidden grid-cols-4 gap-3 sm:grid md:grid-cols-6 lg:grid-cols-8">
              {categories.map((c, i) => (
                <CategoryButton key={c.id} category={c} index={i} onClick={() => openCategory(c.slug)} />
              ))}
            </div>
          </>
        )}
      </section>

      {/* Promo / brand hero card */}
      <section className="px-4 sm:px-0">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand to-red-700 p-5 text-white shadow-lg sm:p-8 lg:p-10"
        >
          <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-white/10 sm:h-40 sm:w-40" />
          <div className="absolute -bottom-10 -right-2 h-32 w-32 rounded-full bg-white/5 sm:h-52 sm:w-52" />
          <div className="relative z-10 max-w-[75%] sm:max-w-[60%] lg:max-w-[50%]">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/80 sm:text-sm">
              {RESTAURANT.name}
            </p>
            <h2 className="mt-1 text-2xl font-extrabold leading-tight sm:text-3xl lg:text-4xl">
              Freshly made.<br />Delivered within 10 km.
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-white/90 sm:text-sm">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3 sm:h-4 sm:w-4" /> {RESTAURANT.deliveryEtaMin}
              </span>
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3 sm:h-4 sm:w-4" /> 10 km radius
              </span>
              {avgRating > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 backdrop-blur">
                  <Star className="h-3 w-3 fill-amber-300 text-amber-300 sm:h-3.5 sm:w-3.5" />
                  {avgRating.toFixed(1)} ({totalReviews})
                </span>
              )}
            </div>
          </div>
        </motion.div>
      </section>

      {/* Featured items — horizontal scroll on mobile, responsive grid on >= sm.
          Hidden entirely when zero items are featured (graceful fallback —
          the admin hasn't marked any items as featured yet, or has unmarked
          all of them). The count badge shows the actual number of featured
          items, not a hardcoded number. */}
      {featured.length > 0 && (
      <section className="px-4 sm:px-0">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <h3 className="text-base font-bold text-foreground sm:text-lg">Featured Items</h3>
            <span className="rounded-full bg-brand-softer px-2 py-0.5 text-[10px] font-bold text-brand">
              {featured.length}
            </span>
          </div>
          <button
            onClick={() => setView('categories')}
            className="text-xs font-semibold text-brand sm:text-sm"
          >
            See all →
          </button>
        </div>
        <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1 sm:hidden">
          {itemsLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="w-40 shrink-0"><ItemCardSkeleton /></div>
              ))
            : featured.map((it, i) => (
                <div key={it.id} className="w-40 shrink-0">
                  <ItemCard item={it} index={i} />
                </div>
              ))}
        </div>
        <div className="hidden grid-cols-2 gap-3 sm:grid md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {itemsLoading
            ? Array.from({ length: 8 }).map((_, i) => <ItemCardSkeleton key={i} />)
            : featured.map((it, i) => <ItemCard key={it.id} item={it} index={i} />)}
        </div>
      </section>
      )}

      {/* Popular items — always a grid, with responsive column counts */}
      <section className="px-4 sm:px-0">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <h3 className="text-base font-bold text-foreground sm:text-lg">Popular Near You</h3>
            <span className="rounded-full bg-brand-softer px-2 py-0.5 text-[10px] font-bold text-brand">
              {popular.length}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-6">
          {itemsLoading
            ? Array.from({ length: 6 }).map((_, i) => <ItemCardSkeleton key={i} />)
            : popular.map((it, i) => <ItemCard key={it.id} item={it} index={i} />)}
        </div>
      </section>

      {/* Restaurant info footer card */}
      <section className="px-4 sm:px-0">
        <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:p-6">
          <div className="flex items-start gap-3 sm:gap-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-softer sm:h-12 sm:w-12">
              <MapPin className="h-5 w-5 text-brand sm:h-6 sm:w-6" />
            </span>
            <div className="min-w-0 flex-1">
              {/* Brand wordmark image replaces the typed restaurant name heading */}
              <BrandWordmark height={32} className="mb-1" />
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                {RESTAURANT.address}
              </p>
              <p className="mt-1 text-xs font-semibold text-brand sm:text-sm">{RESTAURANT.phone}</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function CategoryButton({
  category,
  index,
  onClick,
}: {
  category: Category
  index: number
  onClick: () => void
}) {
  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.05, 0.4) }}
      onClick={onClick}
      className="flex w-16 shrink-0 flex-col items-center gap-1.5 sm:w-auto sm:shrink"
    >
      <span className="grid h-16 w-16 place-items-center overflow-hidden rounded-full border-2 border-brand/10 bg-brand-softer shadow-sm transition hover:scale-105 hover:border-brand/30 sm:h-20 sm:w-20">
        {category.iconUrl ? (
          <Image
            src={category.iconUrl}
            alt={category.name}
            width={56}
            height={56}
            className="h-14 w-14 rounded-full object-cover sm:h-16 sm:w-16"
          />
        ) : (
          <UtensilsCrossed className="h-7 w-7 text-brand/60 sm:h-8 sm:w-8" />
        )}
      </span>
      <span className="line-clamp-1 text-center text-[11px] font-medium text-foreground sm:text-xs">
        {category.name}
      </span>
    </motion.button>
  )
}
