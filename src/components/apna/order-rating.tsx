'use client'

import { useState } from 'react'
import { Star, Loader2, CheckCircle2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { authedFetch } from '@/components/providers/providers'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

/**
 * Star rating component for delivered orders.
 * Shows existing rating if already rated, or interactive stars + review textarea if not.
 */
export function OrderRating({ orderId, orderNumber }: { orderId: string; orderNumber: string }) {
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [review, setReview] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submittedRating, setSubmittedRating] = useState<number | null>(null)

  async function submit() {
    if (rating < 1) {
      toast.error('Please select a star rating')
      return
    }
    setSubmitting(true)
    try {
      const res = await authedFetch(`/api/orders/${orderId}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, review: review.trim() || undefined }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Failed to submit rating')
      }
      setSubmitted(true)
      setSubmittedRating(rating)
      toast.success('Thank you for your rating!')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted || submittedRating != null) {
    const displayRating = submittedRating ?? 0
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3"
      >
        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
        <div className="flex-1">
          <p className="text-xs font-bold text-emerald-700">Rated {displayRating} stars</p>
          <p className="text-[11px] text-emerald-600">Thanks for your feedback!</p>
        </div>
        <div className="flex gap-0.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <Star
              key={n}
              className={cn('h-3.5 w-3.5', n <= displayRating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30')}
            />
          ))}
        </div>
      </motion.div>
    )
  }

  return (
    <div className="rounded-xl bg-brand-softer p-3">
      <p className="mb-2 text-xs font-bold text-foreground">Rate your order</p>
      <div className="mb-2 flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => setRating(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            className="transition active:scale-90"
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
          >
            <Star
              className={cn(
                'h-7 w-7 transition',
                n <= (hover || rating)
                  ? 'fill-amber-400 text-amber-400'
                  : 'fill-muted/50 text-muted-foreground/50'
              )}
            />
          </button>
        ))}
      </div>
      <textarea
        value={review}
        onChange={(e) => setReview(e.target.value)}
        placeholder="Tell us about your experience (optional)…"
        rows={2}
        className="w-full resize-none rounded-lg bg-white px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-brand/40"
      />
      <button
        onClick={submit}
        disabled={submitting || rating < 1}
        className="mt-2 w-full rounded-lg bg-brand py-2 text-xs font-bold text-brand-foreground disabled:opacity-50"
      >
        {submitting ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Submit Rating'}
      </button>
    </div>
  )
}
