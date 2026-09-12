'use client'

import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Star, MessageSquare, Loader2, TrendingUp } from 'lucide-react'
import { rupees, formatRelative } from '@/lib/format'

type Review = {
  id: string
  orderNumber: string
  rating: number
  review: string | null
  customerName: string
  totalAmount: number
  updatedAt: string
  items: string
}

type ReviewsData = {
  avgRating: number
  totalReviews: number
  ratingCounts: number[]
  reviews: Review[]
}

export function ReviewsPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-reviews'],
    queryFn: async () => {
      const res = await fetch('/api/admin/reviews')
      if (!res.ok) throw new Error('failed')
      return res.json() as Promise<ReviewsData>
    },
  })

  const reviews = data?.reviews ?? []
  const avg = data?.avgRating ?? 0
  const total = data?.totalReviews ?? 0
  const counts = data?.ratingCounts ?? [0, 0, 0, 0, 0]

  return (
    <div className="space-y-4">
      {/* Summary card */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
          <div className="mb-2 grid h-9 w-9 place-items-center rounded-lg bg-amber-100 text-amber-700">
            <Star className="h-5 w-5 fill-amber-500 text-amber-500" />
          </div>
          <p className="text-xs text-muted-foreground">Avg Rating</p>
          <p className="text-xl font-extrabold text-foreground">{avg > 0 ? avg.toFixed(1) : '—'}</p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
          <div className="mb-2 grid h-9 w-9 place-items-center rounded-lg bg-blue-100 text-blue-700">
            <MessageSquare className="h-5 w-5" />
          </div>
          <p className="text-xs text-muted-foreground">Total Reviews</p>
          <p className="text-xl font-extrabold text-foreground">{total}</p>
        </div>
        <div className="col-span-2 rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Rating Distribution</p>
          <div className="flex flex-col gap-1">
            {[5, 4, 3, 2, 1].map((star, i) => {
              const count = counts[star - 1]
              const pct = total > 0 ? (count / total) * 100 : 0
              return (
                <div key={star} className="flex items-center gap-2">
                  <span className="flex w-8 items-center gap-0.5 text-[11px] font-semibold text-muted-foreground">
                    {star} <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.5, delay: i * 0.1 }}
                      className="h-full rounded-full bg-amber-400"
                    />
                  </div>
                  <span className="w-6 text-right text-[10px] font-semibold text-muted-foreground">{count}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Reviews list */}
      <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
        <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-foreground">
          <MessageSquare className="h-4 w-4 text-brand" /> Customer Reviews
        </h3>

        {isLoading ? (
          <div className="grid place-items-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-brand" />
          </div>
        ) : reviews.length === 0 ? (
          <div className="grid place-items-center py-12 text-center">
            <MessageSquare className="h-10 w-10 text-muted-foreground/40" />
            <p className="mt-2 text-sm text-muted-foreground">No reviews yet.</p>
            <p className="text-xs text-muted-foreground">Customer ratings will appear here once orders are delivered and rated.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {reviews.map((r, i) => (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: i * 0.04 }}
                className="rounded-xl border border-border/50 bg-muted/20 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-foreground">{r.customerName}</span>
                      <span className="text-[11px] text-muted-foreground">{r.orderNumber}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {formatRelative(r.updatedAt)} · {rupees(r.totalAmount)} · {r.items}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        className={`h-3.5 w-3.5 ${
                          n <= r.rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'
                        }`}
                      />
                    ))}
                  </div>
                </div>
                {r.review && (
                  <p className="mt-2 text-sm leading-relaxed text-foreground">"{r.review}"</p>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
