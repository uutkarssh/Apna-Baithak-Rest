'use client'

import { cn } from '@/lib/utils'

/** Skeleton shimmer card for loading states. */
export function ItemCardSkeleton() {
  return (
    <div className="flex w-full flex-col overflow-hidden rounded-2xl border border-border/60 bg-card">
      <div className="aspect-square w-full animate-pulse bg-muted" />
      <div className="flex flex-col gap-2 p-3 pb-3">
        <div className="h-3.5 w-3/4 animate-pulse rounded bg-muted" />
        <div className="h-3 w-full animate-pulse rounded bg-muted" />
        <div className="mt-1 flex items-center justify-between">
          <div className="h-4 w-12 animate-pulse rounded bg-muted" />
          <div className="h-7 w-14 animate-pulse rounded-full bg-muted" />
        </div>
      </div>
    </div>
  )
}

export function ItemRowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-2.5">
      <div className="h-20 w-20 shrink-0 animate-pulse rounded-xl bg-muted" />
      <div className="flex flex-1 flex-col gap-1.5">
        <div className="h-3.5 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-3 w-full animate-pulse rounded bg-muted" />
        <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
      </div>
    </div>
  )
}

export function CategorySkeleton() {
  return (
    <div className="flex w-16 shrink-0 flex-col items-center gap-1.5">
      <div className="h-16 w-16 animate-pulse rounded-full bg-muted" />
      <div className="h-2.5 w-12 animate-pulse rounded bg-muted" />
    </div>
  )
}

export function CategoryGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex flex-col items-center gap-2 rounded-2xl border border-border/60 bg-card p-4">
          <div className="h-16 w-16 animate-pulse rounded-full bg-muted" />
          <div className="h-3 w-16 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  )
}

export function OrderCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
      <div className="flex items-center gap-3 border-b border-border/50 p-3">
        <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3.5 w-24 animate-pulse rounded bg-muted" />
          <div className="h-2.5 w-32 animate-pulse rounded bg-muted" />
        </div>
        <div className="h-4 w-12 animate-pulse rounded bg-muted" />
      </div>
      <div className="space-y-2 p-3">
        <div className="h-3 w-full animate-pulse rounded bg-muted" />
        <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
      </div>
    </div>
  )
}

/** Skeleton for the cart line items list while the page mounts. */
export function CartLineSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-2.5 shadow-sm">
      <div className="h-16 w-16 shrink-0 animate-pulse rounded-xl bg-muted" />
      <div className="flex flex-1 flex-col gap-1.5">
        <div className="h-3.5 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-2.5 w-1/3 animate-pulse rounded bg-muted" />
        <div className="h-2.5 w-1/4 animate-pulse rounded bg-muted" />
      </div>
      <div className="h-7 w-16 animate-pulse rounded-full bg-muted" />
    </div>
  )
}

/** Skeleton for the bill details card while loading. */
export function BillSummarySkeleton() {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
      <div className="mb-3 h-3.5 w-24 animate-pulse rounded bg-muted" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex justify-between">
            <div className="h-3 w-20 animate-pulse rounded bg-muted" />
            <div className="h-3 w-12 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Skeleton for a saved-address row while the list is loading. */
export function AddressRowSkeleton() {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-border/60 bg-card p-3">
      <div className="mt-0.5 h-4 w-4 animate-pulse rounded bg-muted" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
        <div className="h-2.5 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-2.5 w-1/4 animate-pulse rounded bg-muted" />
      </div>
    </div>
  )
}

/** Skeleton for an admin order card. */
export function AdminOrderRowSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
      <div className="flex items-center gap-3 p-3">
        <div className="h-11 w-11 animate-pulse rounded-full bg-muted" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3.5 w-32 animate-pulse rounded bg-muted" />
          <div className="h-2.5 w-48 animate-pulse rounded bg-muted" />
        </div>
        <div className="space-y-1.5">
          <div className="ml-auto h-3.5 w-16 animate-pulse rounded bg-muted" />
          <div className="ml-auto h-2.5 w-10 animate-pulse rounded bg-muted" />
        </div>
      </div>
    </div>
  )
}

/** Skeleton for an admin stat card. */
export function StatCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
      <div className="mb-2 h-9 w-9 animate-pulse rounded-lg bg-muted" />
      <div className="h-2.5 w-20 animate-pulse rounded bg-muted" />
      <div className="mt-1.5 h-5 w-16 animate-pulse rounded bg-muted" />
    </div>
  )
}

/** Skeleton for an admin menu-item row. */
export function AdminItemRowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-3 shadow-sm">
      <div className="h-14 w-14 shrink-0 animate-pulse rounded-xl bg-muted" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3.5 w-1/3 animate-pulse rounded bg-muted" />
        <div className="h-2.5 w-2/5 animate-pulse rounded bg-muted" />
      </div>
      <div className="h-9 w-9 animate-pulse rounded-lg bg-muted" />
      <div className="h-9 w-9 animate-pulse rounded-lg bg-muted" />
    </div>
  )
}

/** Full-screen loading spinner. */
export function LoadingSpinner({ label }: { label?: string }) {
  return (
    <div className="grid place-items-center py-16">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-muted border-t-brand" />
        {label && <p className="text-sm text-muted-foreground">{label}</p>}
      </div>
    </div>
  )
}
