'use client'

import { UtensilsCrossed, ShoppingBag, User as UserIcon, Store } from 'lucide-react'

/**
 * Placeholder icons used when a menu item / cart / profile image is missing.
 * Uses proper lucide-react icons (no emoji characters anywhere in the app).
 */

export function DishPlaceholder({ className = '' }: { className?: string }) {
  return <UtensilsCrossed className={className} aria-hidden />
}

export function CartPlaceholder({ className = '' }: { className?: string }) {
  return <ShoppingBag className={className} aria-hidden />
}

export function UserPlaceholder({ className = '' }: { className?: string }) {
  return <UserIcon className={className} aria-hidden />
}

export function StorePlaceholder({ className = '' }: { className?: string }) {
  return <Store className={className} aria-hidden />
}
