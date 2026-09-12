'use client'

import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Search, SlidersHorizontal, Package } from 'lucide-react'
import { motion } from 'framer-motion'
import { useApp } from '@/store/app'
import { ItemRow } from '@/components/apna/item-card'
import { ItemRowSkeleton } from '@/components/apna/skeletons'
import type { Category, MenuItem } from '@/lib/types'

export function CategoryListingView() {
  const slug = useApp((s) => s.activeCategorySlug)
  const back = useApp((s) => s.back)

  const { data: catData } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await fetch('/api/menu/categories')
      if (!res.ok) return { categories: [] }
      return res.json() as Promise<{ categories: Category[] }>
    },
  })
  const category = catData?.categories.find((c) => c.slug === slug) ?? null

  const { data, isLoading } = useQuery({
    queryKey: ['menu-items', slug],
    queryFn: async () => {
      const res = await fetch(`/api/menu/items?category=${slug}`)
      if (!res.ok) return { items: [] }
      return res.json() as Promise<{ items: MenuItem[] }>
    },
    enabled: !!slug,
  })

  const items = data?.items ?? []

  return (
    <div className="flex flex-col gap-4 pb-6">
      <header className="sticky top-0 z-10 bg-background/95 px-4 py-3 backdrop-blur sm:px-0">
        <div className="flex items-center gap-3">
          <button onClick={back} className="grid h-9 w-9 place-items-center rounded-full bg-muted transition hover:bg-muted/80 active:scale-95">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="flex-1 truncate text-xl font-bold text-foreground sm:text-2xl">
            {category?.name ?? 'Category'}
          </h1>
          {items.length > 0 && (
            <span className="rounded-full bg-brand-softer px-2.5 py-1 text-[11px] font-bold text-brand">
              {items.length} item{items.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
      </header>

      {category?.description && (
        <p className="px-4 text-sm leading-relaxed text-muted-foreground sm:px-0">{category.description}</p>
      )}

      {isLoading ? (
        <div className="flex flex-col gap-2.5 px-4 sm:px-0">
          {[0, 1, 2, 3].map((i) => <ItemRowSkeleton key={i} />)}
        </div>
      ) : items.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mx-4 mt-4 grid place-items-center rounded-2xl border border-dashed border-border py-16 text-center sm:mx-0"
        >
          <Package className="h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-semibold text-foreground">No items in this category yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Please check back soon.</p>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          // Mobile: single column list view. sm+: 2 cols. md+: 3 cols. lg+: 4 cols.
          className="grid grid-cols-1 gap-2.5 px-4 sm:grid-cols-2 sm:px-0 md:grid-cols-3 lg:grid-cols-4"
        >
          {items.map((it, i) => <ItemRow key={it.id} item={it} index={i} />)}
        </motion.div>
      )}
    </div>
  )
}
