'use client'

import Image from 'next/image'

/**
 * BrandWordmark — the "apna baithak" wordmark image (glossy red brush-script).
 *
 * Used in:
 * - Desktop/landscape top navigation bar (replaces typed "Apna Baithak" text)
 * - Mobile portrait top bar (replaces typed "Apna Baithak" text)
 * - Restaurant info card on product detail / menu pages
 * - Login/signup screens
 *
 * Display size is constrained by max-height (proportional — never distorted)
 * so the image renders crisply at all viewport widths. The `alt` text
 * preserves accessibility/SEO since the visible text is now an image.
 *
 * Uses `unoptimized` to bypass Next.js Image optimization — brand assets
 * are small, high-priority, and should load instantly without the
 * optimization round-trip (which can be slow in dev mode).
 *
 * Source asset: /public/brand/wordmark.png (2071x613, aspect ratio ~3.38:1)
 */
export function BrandWordmark({
  className = '',
  height = 28,
  priority = false,
}: {
  className?: string
  /** Display height in px — width scales proportionally from the source aspect ratio. */
  height?: number
  priority?: boolean
}) {
  const width = Math.round(height * (2071 / 613))
  return (
    <Image
      src="/brand/wordmark.png"
      alt="Apna Baithak"
      width={width}
      height={height}
      priority={priority}
      unoptimized
      className={className}
      style={{ height: `${height}px`, width: 'auto' }}
    />
  )
}

/**
 * BrandIcon — the "ab" lettermark icon.
 *
 * Used in:
 * - Admin panel header (next to "Apna Baithak" text or wordmark)
 * - Login/signup screens
 * - Splash screen / loading states
 * - Customer-facing top nav (landscape)
 *
 * Uses `unoptimized` for instant loading.
 *
 * Source asset: /public/brand/icon.png (1254x1254, square)
 */
export function BrandIcon({
  className = '',
  size = 40,
  priority = false,
}: {
  className?: string
  size?: number
  priority?: boolean
}) {
  return (
    <Image
      src="/brand/icon.png"
      alt="Apna Baithak"
      width={size}
      height={size}
      priority={priority}
      unoptimized
      className={className}
      style={{ height: `${size}px`, width: `${size}px`, borderRadius: '8px' }}
    />
  )
}
