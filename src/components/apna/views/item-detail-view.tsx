'use client'

import { useQuery } from '@tanstack/react-query'
import Image from 'next/image'
import { ArrowLeft, Share2, Star, Clock, Flame, Plus, Minus, UtensilsCrossed, Store } from 'lucide-react'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { useApp } from '@/store/app'
import { useCart } from '@/store/cart'
import { rupees } from '@/lib/format'
import { RESTAURANT } from '@/lib/constants'
import { toast } from 'sonner'
import { ImageGallery } from '@/components/apna/image-gallery'
import type { MenuItem } from '@/lib/types'

export function ItemDetailView() {
  const slug = useApp((s) => s.activeItemSlug)
  const back = useApp((s) => s.back)
  const addItem = useCart((s) => s.addItem)
  const setQty = useCart((s) => s.setQty)
  const lines = useCart((s) => s.lines)
  const setView = useApp((s) => s.setView)
  const openItem = useApp((s) => s.openItem)

  const [qty, setLocalQty] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['item', slug],
    queryFn: async () => {
      const res = await fetch(`/api/menu/items/${slug}`)
      if (!res.ok) return { item: null }
      return res.json() as Promise<{ item: MenuItem & { images?: string[] } }>
    },
    enabled: !!slug,
  })

  const item = data?.item
  const inCart = lines.find((l) => l.slug === slug)
  const price = item?.price ?? 0

  // Fetch related items from the same category
  const { data: relatedData } = useQuery({
    queryKey: ['menu-items', item?.category?.slug],
    queryFn: async () => {
      if (!item?.category?.slug) return { items: [] }
      const res = await fetch(`/api/menu/items?category=${item.category.slug}`)
      if (!res.ok) return { items: [] }
      return res.json() as Promise<{ items: MenuItem[] }>
    },
    enabled: !!item?.category?.slug,
  })
  const related = (relatedData?.items ?? []).filter((it) => it.slug !== slug).slice(0, 6)

  function addToCart() {
    if (!item) return
    addItem(
      {
        itemId: item.id,
        name: item.name,
        slug: item.slug,
        price: item.price,
        imageUrl: item.imageUrl,
      },
      qty
    )
    toast.success(`${qty} × ${item.name} added to cart`)
    setView('cart')
  }

  function updateCartQty() {
    if (!item || !inCart) return
    setQty(item.id, inCart.quantity + qty)
    toast.success(`Updated ${item.name} quantity`)
    setView('cart')
  }

  return (
    <div className="flex min-h-full flex-col pb-2">
      {/* Hero — image gallery (single image or carousel if multiple) */}
      <div className="relative aspect-square w-full bg-muted">
        {item ? (
          <ImageGallery
            images={item.images && item.images.length > 0 ? item.images : (item.imageUrl ? [item.imageUrl] : [])}
            alt={item.name}
            priority
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-brand/40"><UtensilsCrossed className="h-12 w-12" /></div>
        )}
        {/* gradient overlay for button legibility */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/20 to-transparent" />
        <button
          onClick={back}
          className="absolute left-4 top-4 z-20 grid h-10 w-10 place-items-center rounded-full bg-white/90 shadow-md backdrop-blur transition hover:bg-white active:scale-90"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <button
          onClick={async () => {
            try {
              if (navigator.share) {
                await navigator.share({ title: item?.name, text: item?.description ?? '' })
              } else if (item) {
                await navigator.clipboard.writeText(`${window.location.origin}/?item=${item.slug}`)
                toast.success('Link copied')
              }
            } catch {}
          }}
          className="absolute right-4 top-4 z-20 grid h-10 w-10 place-items-center rounded-full bg-white/90 shadow-md backdrop-blur transition hover:bg-white active:scale-90"
          aria-label="Share"
        >
          <Share2 className="h-5 w-5" />
        </button>
      </div>

      {/* Content card */}
      <div className="relative -mt-6 flex-1 rounded-t-3xl bg-background px-5 pt-6">
        {isLoading || !item ? (
          <div className="space-y-3">
            <div className="h-7 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-5 w-1/3 animate-pulse rounded bg-muted" />
            <div className="h-20 animate-pulse rounded bg-muted" />
          </div>
        ) : (
          <>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-1.5">
                    {item.isVeg && (
                      <span className="grid h-4 w-4 place-items-center rounded border-2 border-emerald-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                      </span>
                    )}
                    {item.category && (
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {item.category.name}
                      </span>
                    )}
                  </div>
                  <h1 className="text-2xl font-extrabold leading-tight text-foreground">{item.name}</h1>
                </div>
                {/* Inline qty selector */}
                <div className="flex items-center gap-2 rounded-full border border-brand/30 bg-brand-softer px-1 py-1">
                  <button
                    onClick={() => setLocalQty((q) => Math.max(1, q - 1))}
                    className="grid h-8 w-8 place-items-center rounded-full bg-white text-brand shadow-sm transition hover:brightness-95 active:scale-90"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="min-w-6 text-center text-sm font-bold tabular-nums text-foreground">{qty}</span>
                  <button
                    onClick={() => setLocalQty((q) => q + 1)}
                    className="grid h-8 w-8 place-items-center rounded-full bg-brand text-brand-foreground shadow-sm transition hover:brightness-110 active:scale-90"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <p className="mt-2 text-2xl font-extrabold text-brand">
                {rupees(price)}
                <span className="ml-2 text-xs font-medium text-muted-foreground">per piece</span>
              </p>

              {/* Meta badges */}
              <div className="mt-3 flex flex-wrap gap-2">
                {item.rating > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                    <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                    {item.rating.toFixed(1)}
                  </span>
                )}
                {item.prepTimeMins && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                    <Clock className="h-3.5 w-3.5" />
                    {item.prepTimeMins}-{item.prepTimeMins + 10} mins
                  </span>
                )}
                {item.calories && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">
                    <Flame className="h-3.5 w-3.5" />
                    {item.calories} kcal
                  </span>
                )}
              </div>

              {/* Description */}
              {item.description && (
                <div className="mt-5">
                  <h2 className="mb-1 text-sm font-bold text-foreground">About this dish</h2>
                  <p className="text-sm leading-relaxed text-muted-foreground">{item.description}</p>
                </div>
              )}

              {/* Restaurant note */}
              <div className="mt-5 flex items-start gap-2.5 rounded-2xl bg-brand-softer p-3">
                <Store className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Prepared fresh at <span className="font-semibold text-foreground">{RESTAURANT.name}</span>. Orders
                  cannot be cancelled once preparation begins.
                </p>
              </div>
            </motion.div>

            {/* Related items */}
            {related.length > 0 && (
              <div className="mt-6">
                <h2 className="mb-2 text-sm font-bold text-foreground">
                  More from {item.category?.name}
                </h2>
                <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 pb-2">
                  {related.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => {
                        openItem(r.slug)
                        setLocalQty(1)
                      }}
                      className="w-32 shrink-0 rounded-2xl border border-border/60 bg-card p-2 text-left shadow-sm transition hover:shadow-md active:scale-95"
                    >
                      <div className="relative h-24 w-full overflow-hidden rounded-xl bg-muted">
                        {r.imageUrl ? (
                          <Image src={r.imageUrl} alt={r.name} fill sizes="128px" className="object-cover" />
                        ) : (
                          <div className="grid h-full w-full place-items-center text-brand/40"><UtensilsCrossed className="h-5 w-5" /></div>
                        )}
                      </div>
                      <p className="mt-1.5 line-clamp-1 text-xs font-bold text-foreground">{r.name}</p>
                      <p className="text-xs font-extrabold text-brand">{rupees(r.price)}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="h-24" />
          </>
        )}
      </div>

      {/* Sticky bottom bar */}
      {item && (
        <div className="sticky bottom-0 z-20 border-t border-border bg-background/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="flex flex-1 flex-col rounded-xl bg-muted px-3 py-2">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {qty} item{qty > 1 ? 's' : ''} · Total
              </span>
              <span className="text-base font-extrabold text-foreground">{rupees(price * qty)}</span>
            </div>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={inCart ? updateCartQty : addToCart}
              className="flex-[1.4] rounded-xl bg-brand py-3 text-center text-sm font-bold text-brand-foreground shadow-md transition hover:brightness-105"
            >
              {inCart ? `Add ${qty} more · ${rupees(price * qty)}` : 'Add to cart'}
            </motion.button>
          </div>
        </div>
      )}
    </div>
  )
}
