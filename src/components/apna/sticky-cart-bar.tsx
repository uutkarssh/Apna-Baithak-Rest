'use client'

import { ShoppingBag } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useCart } from '@/store/cart'
import { useApp } from '@/store/app'
import { rupees } from '@/lib/format'

/**
 * Sticky cart bar — shows above the bottom nav once the cart has items.
 * This component is now ONLY rendered on Home / Categories / Category-listing
 * / Item-detail views (gated by the parent ApnaBaithakApp) so it never
 * appears on the Cart page, Address screen, Checkout, Profile, etc.
 *
 * STACKING / POSITIONING:
 * - The bottom nav has z-30. The cart bar uses z-40 so it ALWAYS renders
 *   above the nav, never behind/under it.
 * - The bottom offset is `4rem + env(safe-area-inset-bottom)` — slightly
 *   more than the nav's ~3.5rem height — so there's a small visible gap
 *   between the cart bar and the nav bar (no visual merging).
 * - A `pb-1` on the bar's inner div adds a few pixels of breathing room.
 */
export function StickyCartBar() {
  const count = useCart((s) => s.count())
  const subtotal = useCart((s) => s.subtotal())
  const setView = useApp((s) => s.setView)

  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.button
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 60 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          onClick={() => setView('cart')}
          // z-40 = above the bottom nav (z-30). bottom offset = 4rem +
          // safe-area-inset so there's a clear ~8px gap between the cart
          // bar and the nav bar (no overlap, no clipping).
          // Only shows in PORTRAIT orientation (above the bottom nav) —
          // in landscape the top nav already has a Cart button with a count
          // badge, so this floating bar would be redundant.
          className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-screen-md items-center justify-between gap-3 px-4 pb-1 sm:px-6 landscape:hidden"
        >
          <div className="flex w-full items-center justify-between gap-3 rounded-2xl bg-brand px-4 py-3 text-brand-foreground shadow-lg shadow-brand/30 ring-1 ring-black/5 transition active:scale-[0.99]">
            <span className="flex items-center gap-2">
              <span className="relative">
                <ShoppingBag className="h-5 w-5" />
                <motion.span
                  key={count}
                  initial={{ scale: 0.5 }}
                  animate={{ scale: 1 }}
                  className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand-foreground px-1 text-[10px] font-bold text-brand"
                >
                  {count}
                </motion.span>
              </span>
              <span className="text-sm font-semibold">{count} item{count > 1 ? 's' : ''} added</span>
            </span>
            <span className="flex items-center gap-1.5 text-sm font-bold">
              {rupees(subtotal)} · View Cart →
            </span>
          </div>
        </motion.button>
      )}
    </AnimatePresence>
  )
}
