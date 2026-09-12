'use client'

import { cn } from '@/lib/utils'

/** Small circular qty stepper — used on item cards, item detail, cart rows. */
export function QtyStepper({
  qty,
  onInc,
  onDec,
  size = 'md',
  className,
}: {
  qty: number
  onInc: () => void
  onDec: () => void
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const dims =
    size === 'sm' ? 'h-7 text-xs gap-2 px-1' : size === 'lg' ? 'h-12 text-base gap-4 px-2' : 'h-9 text-sm gap-3 px-1.5'
  const btn =
    size === 'sm' ? 'h-5 w-5' : size === 'lg' ? 'h-9 w-9' : 'h-7 w-7'
  return (
    <div
      className={cn(
        'inline-flex items-center justify-between rounded-full border border-brand/30 bg-brand-softer text-brand',
        dims,
        className
      )}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onDec()
        }}
        className={cn(
          'grid place-items-center rounded-full text-brand hover:bg-brand/10',
          btn
        )}
        aria-label="Decrease quantity"
      >
        <MinusIcon className={size === 'lg' ? 'h-4 w-4' : 'h-3 w-3'} />
      </button>
      <span className="font-bold tabular-nums min-w-4 text-center text-foreground">{qty}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onInc()
        }}
        className={cn(
          'grid place-items-center rounded-full bg-brand text-brand-foreground hover:opacity-90',
          btn
        )}
        aria-label="Increase quantity"
      >
        <PlusIcon className={size === 'lg' ? 'h-4 w-4' : 'h-3 w-3'} />
      </button>
    </div>
  )
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className={className}>
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  )
}
function MinusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className={className}>
      <path d="M5 12h14" strokeLinecap="round" />
    </svg>
  )
}
