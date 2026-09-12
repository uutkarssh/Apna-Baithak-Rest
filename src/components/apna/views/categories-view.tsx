'use client'

import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import Image from 'next/image'
import { ArrowLeft, Search, X, Clock, TrendingUp, Trash2, UtensilsCrossed } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useApp } from '@/store/app'
import { useRecentSearch } from '@/store/recent-search'
import { ItemRow } from '@/components/apna/item-card'
import { authedFetch } from '@/components/providers/providers'
import type { Category, MenuItem } from '@/lib/types'

// Popular search suggestions (static — based on the restaurant's actual menu)
const POPULAR_SEARCHES = ['Pizza', 'Burger', 'Pasta', 'Maggie', 'Chaat', 'Fries']

export function CategoriesView() {
  const setView = useApp((s) => s.setView)
  const openCategory = useApp((s) => s.openCategory)
  const back = useApp((s) => s.back)
  const search = useApp((s) => s.search)
  const setSearch = useApp((s) => s.setSearch)

  const recent = useRecentSearch((s) => s.recent)
  const addRecent = useRecentSearch((s) => s.add)
  const clearRecent = useRecentSearch((s) => s.clear)

  const { data: catData } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await fetch('/api/menu/categories')
      if (!res.ok) return { categories: [] }
      return res.json() as Promise<{ categories: Category[] }>
    },
  })

  const { data: itemsData } = useQuery({
    queryKey: ['menu-items-search', search],
    queryFn: async () => {
      if (!search?.trim()) return { items: [] }
      const res = await authedFetch(`/api/menu/items?search=${encodeURIComponent(search)}`)
      if (!res.ok) return { items: [] }
      return res.json() as Promise<{ items: MenuItem[] }>
    },
    enabled: !!search?.trim(),
  })

  // Record the search in recent history when results are found
  const lastRecorded = useRef<string>('')
  useEffect(() => {
    if (
      search &&
      search.trim().length >= 2 &&
      itemsData?.items &&
      itemsData.items.length > 0 &&
      lastRecorded.current !== search
    ) {
      addRecent(search)
      lastRecorded.current = search
    }
  }, [search, itemsData, addRecent])

  const categories = catData?.categories ?? []
  const searchResults = itemsData?.items ?? []
  const isSearching = !!search?.trim()

  function runSearch(q: string) {
    setSearch(q)
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 px-4 py-3 backdrop-blur sm:px-0">
        <div className="mb-3 flex items-center gap-3">
          <button onClick={back} className="grid h-9 w-9 place-items-center rounded-full bg-muted">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">Menu</h1>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-brand/20 bg-white px-4 py-2.5 shadow-sm">
          <Search className="h-4 w-4 text-brand" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search dishes…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            autoFocus
          />
          {search && (
            <button onClick={() => setSearch('')} aria-label="Clear">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>
      </header>

      {isSearching ? (
        <section className="px-4 sm:px-0">
          <p className="mb-2 text-xs text-muted-foreground">
            {searchResults.length} result{searchResults.length === 1 ? '' : 's'} for “{search}”
          </p>
          {searchResults.length === 0 ? (
            <div className="grid place-items-center rounded-2xl border border-dashed border-border py-12 text-center">
              <p className="text-sm text-muted-foreground">
                No items match “{search}”.<br />Try “pizza”, “burger” or “chaat”.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {searchResults.map((it, i) => (
                <ItemRow key={it.id} item={it} index={i} />
              ))}
            </div>
          )}
        </section>
      ) : (
        <>
          {/* Recent + Popular searches */}
          {(recent.length > 0 || POPULAR_SEARCHES.length > 0) && (
            <section className="px-4 sm:px-0">
              {recent.length > 0 && (
                <div className="mb-4">
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      <Clock className="h-3 w-3" /> Recent Searches
                    </h2>
                    <button
                      onClick={clearRecent}
                      className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                    >
                      <Trash2 className="h-3 w-3" /> Clear
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <AnimatePresence>
                      {recent.map((r) => (
                        <motion.button
                          key={r}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          onClick={() => runSearch(r)}
                          className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-brand/30 hover:bg-brand-softer"
                        >
                          {r}
                        </motion.button>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              )}

              <div className="mb-4">
                <h2 className="mb-2 flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  <TrendingUp className="h-3 w-3" /> Popular Searches
                </h2>
                <div className="flex flex-wrap gap-2">
                  {POPULAR_SEARCHES.map((s) => (
                    <button
                      key={s}
                      onClick={() => runSearch(s)}
                      className="rounded-full bg-brand-softer px-3 py-1.5 text-xs font-semibold text-brand transition hover:bg-brand/10"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Category grid */}
          <section className="px-4 sm:px-0">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              All categories
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {categories.map((c, i) => (
                <motion.button
                  key={c.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.2, delay: i * 0.04 }}
                  onClick={() => openCategory(c.slug)}
                  className="flex flex-col items-center gap-2 rounded-2xl border border-border/60 bg-card p-4 shadow-sm transition active:scale-[0.98] hover:shadow-md"
                >
                  <span className="grid h-16 w-16 place-items-center overflow-hidden rounded-full bg-brand-softer">
                    {c.iconUrl ? (
                      <Image
                        src={c.iconUrl}
                        alt={c.name}
                        width={56}
                        height={56}
                        className="h-14 w-14 rounded-full object-cover"
                      />
                    ) : (
                      <UtensilsCrossed className="h-7 w-7 text-brand/60" />
                    )}
                  </span>
                  <span className="text-center text-sm font-bold text-foreground">{c.name}</span>
                  {typeof c.itemCount === 'number' && (
                    <span className="text-[11px] text-muted-foreground">
                      {c.itemCount} item{c.itemCount === 1 ? '' : 's'}
                    </span>
                  )}
                </motion.button>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
