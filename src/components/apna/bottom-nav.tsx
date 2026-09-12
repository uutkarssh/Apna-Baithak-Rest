'use client'

import { Home, LayoutGrid, ShoppingBag, User as UserIcon, MapPin, ChevronDown } from 'lucide-react'
import { useApp } from '@/store/app'
import { useCart } from '@/store/cart'
import { useAuth } from '@/components/providers/auth-provider'
import { authedFetch } from '@/components/providers/providers'
import { RESTAURANT } from '@/lib/constants'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { BrandIcon, BrandWordmark } from '@/components/brand/brand-logo'

const TABS: { id: 'home' | 'categories' | 'cart'; label: string; icon: any }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'categories', label: 'Menu', icon: LayoutGrid },
  { id: 'cart', label: 'Cart', icon: ShoppingBag },
]

function useNavState() {
  const view = useApp((s) => s.view)
  const setView = useApp((s) => s.setView)
  const count = useCart((s) => s.count())
  const { profile } = useAuth()
  const selectedAddressId = useApp((s) => s.selectedAddressId)

  // Fetch the user's saved addresses so the desktop top-nav can show the
  // currently selected delivery location (just like the mobile TopBar does).
  const { data: addrData } = useQuery({
    queryKey: ['addresses'],
    queryFn: async () => {
      const res = await authedFetch('/api/addresses')
      if (!res.ok) return { addresses: [] }
      return res.json() as Promise<{ addresses: any[] }>
    },
    enabled: !!profile,
  })
  const chosen =
    addrData?.addresses.find((a) => a.id === selectedAddressId) ||
    addrData?.addresses.find((a) => a.isDefault) ||
    null
  const locationLabel = chosen
    ? `${chosen.houseFlat}, ${chosen.streetArea}`.slice(0, 32)
    : 'Select delivery location'

  // map any view to its nav-tab highlight
  const activeTab: 'home' | 'categories' | 'cart' =
    view === 'cart' || view === 'checkout' || view === 'location'
      ? 'cart'
      : view === 'categories' || view === 'category-listing' || view === 'item-detail'
      ? 'categories'
      : 'home'

  return { view, setView, count, profile, locationLabel, activeTab, tabs: TABS }
}

/**
 * Top navigation bar — shown ONLY in LANDSCAPE orientation (any width).
 * Renders brand mark + location chip + Home/Menu/Cart tabs + Sign-in/Profile.
 * Placed BEFORE <main> in the DOM so it sits at the top of the page.
 */
export function TopNav() {
  const { setView, count, profile, locationLabel, activeTab, tabs } = useNavState()

  return (
    <nav className="sticky top-0 z-30 hidden border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 landscape:block">
      <div className="mx-auto flex w-full max-w-screen-2xl items-center gap-6 px-8 py-3">
        {/* Brand mark — icon + wordmark image (replaces typed "Apna Baithak" text) */}
        <button
          onClick={() => setView('home')}
          className="flex items-center gap-2"
          aria-label="Apna Baithak home"
        >
          <BrandIcon size={36} priority />
          <BrandWordmark height={26} priority />
        </button>

        {/* Delivery location chip */}
        <button
          onClick={() => setView('location')}
          className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-left hover:bg-muted"
        >
          <MapPin className="h-4 w-4 shrink-0 text-brand" />
          <span className="min-w-0">
            <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
              Deliver to · {RESTAURANT.deliveryEtaMin}
            </span>
            <span className="flex items-center gap-1">
              <span className="truncate text-xs font-bold text-foreground">{locationLabel}</span>
              <ChevronDown className="h-3 w-3 shrink-0 text-brand" />
            </span>
          </span>
        </button>

        {/* Primary nav tabs (centered) */}
        <div className="flex flex-1 items-center justify-center gap-1">
          {tabs.map((t) => {
            const active = activeTab === t.id
            const Icon = t.icon
            return (
              <button
                key={t.id}
                onClick={() => setView(t.id)}
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition',
                  active
                    ? 'bg-brand-softer text-brand'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={active ? 2.5 : 2} />
                {t.label}
                {t.id === 'cart' && count > 0 && (
                  <span className="grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-brand-foreground">
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Profile / account (right) */}
        <button
          onClick={() => (profile ? setView('profile') : setView('login'))}
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted"
        >
          <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-softer">
            <UserIcon className="h-4 w-4 text-brand" />
          </span>
          {profile ? profile.name ?? profile.email.split('@')[0] : 'Sign in'}
        </button>
      </div>
    </nav>
  )
}

/**
 * Bottom tab bar — shown ONLY in PORTRAIT orientation (any width, including
 * tablets in portrait mode). Placed AFTER <main> in the DOM so it sits at
 * the bottom of the page; `sticky bottom-0` keeps it pinned to the viewport
 * bottom while scrolling.
 */
export function BottomNav() {
  const { setView, count, activeTab, tabs } = useNavState()

  return (
    <nav
      className="sticky bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 pb-[env(safe-area-inset-bottom)] landscape:hidden"
    >
      <div className="mx-auto grid max-w-md grid-cols-3">
        {tabs.map((t) => {
          const active = activeTab === t.id
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => setView(t.id)}
              className="relative flex flex-col items-center gap-0.5 py-2.5"
              suppressHydrationWarning
            >
              <span className="relative">
                <Icon
                  className={cn(
                    'h-6 w-6 transition',
                    active ? 'text-brand' : 'text-muted-foreground'
                  )}
                  strokeWidth={active ? 2.5 : 2}
                />
                {t.id === 'cart' && count > 0 && (
                  <span className="absolute -right-2 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-brand-foreground">
                    {count}
                  </span>
                )}
              </span>
              <span
                className={cn(
                  'text-[11px] font-medium',
                  active ? 'text-brand' : 'text-muted-foreground'
                )}
              >
                {t.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
