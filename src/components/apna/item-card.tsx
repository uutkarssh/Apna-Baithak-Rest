'use client'

import Image from 'next/image'
import { useState } from 'react'
import { useCart } from '@/store/cart'
import { useFavorites } from '@/store/favorites'
import { useApp } from '@/store/app'
import { useAuth } from '@/components/providers/auth-provider'
import { QtyStepper } from './qty-stepper'
import { rupees } from '@/lib/format'
import type { MenuItem } from '@/lib/types'
import { motion, AnimatePresence } from 'framer-motion'
import { Heart, UtensilsCrossed } from 'lucide-react'
import { toast } from 'sonner'

function HeartButton({ item }: { item: MenuItem }) {
  const toggle = useFavorites((s) => s.toggle)
  const isFav = useFavorites((s) => s.isFavorite(item.id))
  const goToLogin = useApp((s) => s.goToLogin)
  const { profile, loading: authLoading } = useAuth()
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        // Restrict: only logged-in users can favorite items.
        if (authLoading) return
        if (!profile) {
          toast.info('Please sign in to save favorites')
          // Remember the item-detail view as the return destination so after
          // login the user lands back on the item they were trying to favorite.
          goToLogin('item-detail')
          return
        }
        toggle({ id: item.id, name: item.name, slug: item.slug, price: item.price, imageUrl: item.imageUrl })
        toast.success(isFav ? 'Removed from favorites' : 'Added to favorites')
      }}
      className="absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-full bg-white/90 shadow-sm backdrop-blur transition hover:bg-white active:scale-90"
      aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
    >
      <motion.span
        initial={false}
        animate={{ scale: isFav ? [1, 1.3, 1] : 1 }}
        transition={{ duration: 0.3 }}
      >
        <Heart
          className={`h-4 w-4 ${isFav ? 'fill-brand text-brand' : 'text-foreground'}`}
        />
      </motion.span>
    </button>
  )
}

/** Image with a shimmer loading placeholder. */
function ShimmerImage({ src, alt, sizes, priority }: { src: string; alt: string; sizes: string; priority?: boolean }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <>
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted via-muted/80 to-muted" />
      )}
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        onLoad={() => setLoaded(true)}
        className={`object-cover transition duration-300 group-hover:scale-110 ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />
    </>
  )
}

/** Grid card — used on Home featured rail + Popular grid. */
export function ItemCard({ item, index = 0 }: { item: MenuItem; index?: number }) {
  const addItem = useCart((s) => s.addItem)
  const lines = useCart((s) => s.lines)
  const increment = useCart((s) => s.increment)
  const decrement = useCart((s) => s.decrement)
  const openItem = useApp((s) => s.openItem)

  const inCart = lines.find((l) => l.itemId === item.id)
  const qty = inCart?.quantity ?? 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.04, 0.3) }}
      className="group flex w-full flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm transition hover:shadow-md"
    >
      {/* Clickable image + title area (opens detail) */}
      <button
        type="button"
        onClick={() => openItem(item.slug)}
        className="block w-full text-left"
      >
        <div className="relative aspect-square w-full overflow-hidden bg-muted">
          {item.imageUrl ? (
            <ShimmerImage
              src={item.imageUrl}
              alt={item.name}
              sizes="(max-width:768px) 50vw, 220px"
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-brand/40"><UtensilsCrossed className="h-6 w-6" /></div>
          )}
          {item.isVeg && (
            <span className="absolute left-2 top-2 grid h-5 w-5 place-items-center rounded border-2 border-emerald-600 bg-white/95 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-emerald-600" />
            </span>
          )}
          <HeartButton item={item} />
          {item.rating > 0 && (
            <span className="absolute bottom-2 left-2 inline-flex items-center gap-0.5 rounded-full bg-black/75 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur">
              <StarIcon className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
              {item.rating.toFixed(1)}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-0.5 p-3 pb-2">
          <h3 className="line-clamp-1 text-sm font-bold text-foreground">{item.name}</h3>
          <p className="line-clamp-2 min-h-[2rem] text-xs text-muted-foreground">
            {item.description ?? 'Delicious freshly prepared.'}
          </p>
        </div>
      </button>

      {/* Price + ADD/Stepper — sibling of the clickable area */}
      <div className="flex items-center justify-between gap-2 px-3 pb-3">
        <span className="text-base font-extrabold text-foreground">{rupees(item.price)}</span>
        {qty > 0 ? (
          <QtyStepper
            qty={qty}
            onInc={() => increment(item.id)}
            onDec={() => decrement(item.id)}
            size="sm"
          />
        ) : (
          <button
            type="button"
            onClick={() =>
              addItem({
                itemId: item.id,
                name: item.name,
                slug: item.slug,
                price: item.price,
                imageUrl: item.imageUrl,
              })
            }
            className="rounded-full bg-brand px-5 py-1.5 text-xs font-bold text-brand-foreground shadow-sm transition hover:brightness-110 active:scale-95"
          >
            ADD
          </button>
        )}
      </div>
    </motion.div>
  )
}

/** Horizontal row card — used in category listing + search results. */
export function ItemRow({ item, index = 0 }: { item: MenuItem; index?: number }) {
  const addItem = useCart((s) => s.addItem)
  const lines = useCart((s) => s.lines)
  const increment = useCart((s) => s.increment)
  const decrement = useCart((s) => s.decrement)
  const openItem = useApp((s) => s.openItem)

  const inCart = lines.find((l) => l.itemId === item.id)
  const qty = inCart?.quantity ?? 0

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.25) }}
      className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-2.5 shadow-sm transition hover:shadow-md"
    >
      {/* Clickable image + text */}
      <button
        type="button"
        onClick={() => openItem(item.slug)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-muted">
          {item.imageUrl ? (
            <ShimmerImage src={item.imageUrl} alt={item.name} sizes="80px" />
          ) : (
            <div className="grid h-full w-full place-items-center text-brand/40"><UtensilsCrossed className="h-5 w-5" /></div>
          )}
          {item.isVeg && (
            <span className="absolute left-1 top-1 grid h-3.5 w-3.5 place-items-center rounded border border-emerald-600 bg-white/95">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className="line-clamp-1 text-sm font-bold text-foreground">{item.name}</h3>
          <p className="line-clamp-1 text-xs text-muted-foreground">{item.description}</p>
          <span className="mt-0.5 text-sm font-extrabold text-foreground">{rupees(item.price)}</span>
        </div>
      </button>

      {/* ADD / Stepper — sibling */}
      {qty > 0 ? (
        <QtyStepper
          qty={qty}
          onInc={() => increment(item.id)}
          onDec={() => decrement(item.id)}
          size="sm"
        />
      ) : (
        <button
          type="button"
          onClick={() =>
            addItem({
              itemId: item.id,
              name: item.name,
              slug: item.slug,
              price: item.price,
              imageUrl: item.imageUrl,
            })
          }
          className="shrink-0 rounded-full bg-brand px-5 py-1.5 text-xs font-bold text-brand-foreground transition hover:brightness-110 active:scale-95"
        >
          ADD
        </button>
      )}
    </motion.div>
  )
}

function StarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  )
}
