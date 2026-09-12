'use client'
import { authedFetch } from '@/components/providers/providers'

import { ChevronDown, MapPin, Bell, User as UserIcon } from 'lucide-react'
import { useApp } from '@/store/app'
import { useAuth } from '@/components/providers/auth-provider'
import { RESTAURANT } from '@/lib/constants'
import { useQuery } from '@tanstack/react-query'

export function TopBar() {
  const setView = useApp((s) => s.setView)
  const goToLogin = useApp((s) => s.goToLogin)
  const selectedAddressId = useApp((s) => s.selectedAddressId)
  const { profile, loading: authLoading } = useAuth()

  // fetch saved addresses to display the default/selected one in the top bar
  const { data } = useQuery({
    queryKey: ['addresses'],
    queryFn: async () => {
      const res = await authedFetch('/api/addresses')
      if (!res.ok) return { addresses: [] }
      return res.json() as Promise<{ addresses: any[] }>
    },
    enabled: !authLoading && !!profile,
  })

  const chosen =
    data?.addresses.find((a) => a.id === selectedAddressId) ||
    data?.addresses.find((a) => a.isDefault) ||
    null

  const label = chosen
    ? `${chosen.houseFlat}, ${chosen.streetArea}`.slice(0, 32)
    : 'Select delivery location'

  return (
    // Mobile-only top location chip — shown only in PORTRAIT orientation
    // (any width). In landscape, the BottomNav component renders as a top
    // nav bar that includes the brand + location chip + tabs + profile,
    // so we hide this separate TopBar there to avoid duplication.
    <div className="relative z-20 bg-gradient-to-b from-brand-softer to-background px-4 pt-3 pb-3 landscape:hidden">
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => setView('location')}
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
        >
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white shadow-sm">
            <MapPin className="h-5 w-5 text-brand" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Deliver to · {RESTAURANT.deliveryEtaMin}
            </span>
            <span className="flex items-center gap-1">
              <span className="truncate text-sm font-bold text-foreground">{label}</span>
              <ChevronDown className="h-4 w-4 shrink-0 text-brand" />
            </span>
          </span>
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView('orders')}
            aria-label="Notifications"
            className="relative grid h-10 w-10 place-items-center rounded-full bg-white shadow-sm"
          >
            <Bell className="h-5 w-5 text-foreground" />
            <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-brand" />
          </button>
          <button
            onClick={() => (profile ? setView('profile') : goToLogin('profile'))}
            aria-label="Profile"
            className="grid h-10 w-10 place-items-center rounded-full bg-white shadow-sm"
          >
            <UserIcon className="h-5 w-5 text-foreground" />
          </button>
        </div>
      </div>
    </div>
  )
}
