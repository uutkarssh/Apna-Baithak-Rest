'use client'
import { authedFetch } from '@/components/providers/providers'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  MapPin,
  CreditCard,
  Receipt,
  LogOut,
  Phone,
  Mail,
  ChevronRight,
  Heart,
  Trash2,
  User as UserIcon,
  UtensilsCrossed,
  Pencil,
  X,
  Loader2,
} from 'lucide-react'
import { useApp } from '@/store/app'
import { useAuth } from '@/components/providers/auth-provider'
import { useCart } from '@/store/cart'
import { useFavorites } from '@/store/favorites'
import { rupees, formatRelative } from '@/lib/format'
import { PAYMENT_MODES, RESTAURANT } from '@/lib/constants'
import type { Address, Order } from '@/lib/types'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'

export function ProfileView() {
  const back = useApp((s) => s.back)
  const setView = useApp((s) => s.setView)
  const goToLogin = useApp((s) => s.goToLogin)
  const { profile, signOut, updateProfile, loading: authLoading } = useAuth()
  const clearCart = useCart((s) => s.clear)
  const [editOpen, setEditOpen] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    let required = false
    try {
      required = localStorage.getItem('apna-baithak-require-phone') === '1'
      if (required) localStorage.removeItem('apna-baithak-require-phone')
    } catch {}
    if (required) setEditOpen(true)
  }, [])

  const { data } = useQuery({
    queryKey: ['orders'],
    queryFn: async () => {
      const res = await authedFetch('/api/orders')
      if (!res.ok) return { orders: [] }
      return res.json() as Promise<{ orders: Order[] }>
    },
    enabled: !authLoading && !!profile,
  })
  const orders = data?.orders ?? []

  const { data: addrData } = useQuery({
    queryKey: ['addresses'],
    queryFn: async () => {
      const res = await authedFetch('/api/addresses')
      if (!res.ok) return { addresses: [] }
      return res.json() as Promise<{ addresses: Address[] }>
    },
    enabled: !authLoading && !!profile,
  })
  const addresses = addrData?.addresses ?? []

  if (authLoading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 py-20 text-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-muted border-t-brand" />
        <p className="text-sm text-muted-foreground">Loading your profile…</p>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 px-6 py-20 text-center">
        <div className="grid h-20 w-20 place-items-center rounded-full bg-brand-softer">
          <UserIcon className="h-10 w-10 text-brand/60" />
        </div>
        <h2 className="text-lg font-bold text-foreground">You're not signed in</h2>
        <p className="text-sm text-muted-foreground">Sign in to see your orders & saved addresses.</p>
        <button
          onClick={() => goToLogin('profile')}
          className="rounded-full bg-brand px-6 py-2.5 text-sm font-bold text-brand-foreground"
        >
          Sign in
        </button>
      </div>
    )
  }

  const initial = (profile.name ?? profile.email)[0]?.toUpperCase() ?? '?'

  return (
    <div className="flex min-h-full flex-col pb-6">
      <header className="px-4 py-3">
        <button onClick={back} className="grid h-9 w-9 place-items-center rounded-full bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </button>
      </header>

      <section className="flex flex-col items-center px-5 pt-2 pb-6 text-center">
        <div className="grid h-24 w-24 place-items-center rounded-full bg-brand text-3xl font-extrabold text-brand-foreground shadow-md">
          {profile.avatarUrl ? (
            <img src={profile.avatarUrl} alt={profile.name ?? ''} className="h-full w-full rounded-full object-cover" />
          ) : (
            initial
          )}
        </div>
        <h1 className="mt-3 text-xl font-extrabold text-foreground">
          {profile.name ?? profile.email.split('@')[0]}
        </h1>
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Mail className="h-3 w-3" /> {profile.email}
        </p>
        {profile.phone && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Phone className="h-3 w-3" /> {profile.phone}
          </p>
        )}
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => setEditOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-1.5 text-xs font-semibold text-brand-foreground shadow-sm"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit Profile
          </button>
          <button
            onClick={async () => {
              await signOut()
              clearCart()
              toast.success('Signed out')
              setView('home')
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-1.5 text-xs font-semibold text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" /> Logout
          </button>
        </div>
      </section>

      <AnimatePresence>
        {editOpen && profile && (
          <EditProfileModal
            profile={profile}
            updateProfile={updateProfile}
            onClose={() => setEditOpen(false)}
          />
        )}
      </AnimatePresence>

      <section className="px-4">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Account</h2>
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
          <Row
            icon={<MapPin className="h-5 w-5 text-brand" />}
            label="Saved Address"
            sub={`${addresses.length} address${addresses.length === 1 ? '' : 'es'}`}
            onClick={() => setView('location')}
          />
          <Divider />
          <Row
            icon={<CreditCard className="h-5 w-5 text-brand" />}
            label="Payment Modes"
            sub={PAYMENT_MODES.map((p) => p.id).join(' · ')}
            onClick={() => setView('cart')}
          />
        </div>
      </section>

      <FavoritesSection />

      <section className="mt-6 px-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            My Orders
          </h2>
          {orders.length > 0 && (
            <button onClick={() => setView('orders')} className="text-xs font-semibold text-brand">
              View all →
            </button>
          )}
        </div>
        {orders.length === 0 ? (
          <div className="grid place-items-center rounded-2xl border border-dashed border-border py-10 text-center">
            <Receipt className="h-8 w-8 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">No orders yet</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {orders.slice(0, 3).map((o) => (
              <button
                key={o.id}
                onClick={() => setView('orders')}
                className="rounded-2xl border border-border/60 bg-card p-3 text-left shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-foreground">{o.orderNumber}</span>
                  <span className="text-xs font-semibold text-brand">{rupees(o.totalAmount)}</span>
                </div>
                <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                  {o.items.map((i) => `${i.itemName} ×${i.quantity}`).join(', ')}
                </p>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">{formatRelative(o.createdAt)}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground">
                    {o.status.replace(/_/g, ' ')}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6 px-4">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Restaurant
        </h2>
        <div className="rounded-2xl border border-border/60 bg-card p-4 text-sm shadow-sm">
          <p className="font-bold text-foreground">{RESTAURANT.name}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{RESTAURANT.address}</p>
          <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-brand">
            <Phone className="h-3.5 w-3.5" /> {RESTAURANT.phone}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-brand">
            <Mail className="h-3.5 w-3.5" /> {RESTAURANT.email}
          </p>
        </div>
      </section>
    </div>
  )
}

function Row({
  icon,
  label,
  sub,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  sub: string
  onClick: () => void
}) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 p-3 text-left">
      <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-softer">{icon}</span>
      <span className="flex-1">
        <span className="block text-sm font-bold text-foreground">{label}</span>
        <span className="block text-xs text-muted-foreground">{sub}</span>
      </span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
  )
}
function Divider() {
  return <div className="ml-16 border-t border-border/50" />
}

function FavoritesSection() {
  const favorites = useFavorites((s) => s.favorites)
  const toggle = useFavorites((s) => s.toggle)
  const openItem = useApp((s) => s.openItem)
  const addItem = useCart((s) => s.addItem)

  if (favorites.length === 0) return null

  return (
    <section className="mt-6 px-4">
      <h2 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Heart className="h-3.5 w-3.5 fill-brand text-brand" /> My Favorites
      </h2>
      <div className="flex flex-col gap-2">
        <AnimatePresence>
          {favorites.map((fav) => (
            <motion.div
              key={fav.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
              className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-2.5 shadow-sm"
            >
              <button
                onClick={() => openItem(fav.slug)}
                className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted"
              >
                {fav.imageUrl ? (
                  <img src={fav.imageUrl} alt={fav.name} className="h-full w-full object-cover" />
                ) : (
                  <UtensilsCrossed className="h-6 w-6 text-brand/40" />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-1 text-sm font-bold text-foreground">{fav.name}</p>
                <p className="text-sm font-extrabold text-brand">{rupees(fav.price)}</p>
              </div>
              <button
                onClick={() => {
                  addItem({
                    itemId: fav.id,
                    name: fav.name,
                    slug: fav.slug,
                    price: fav.price,
                    imageUrl: fav.imageUrl,
                  })
                  toast.success(`${fav.name} added to cart`)
                }}
                className="shrink-0 rounded-full bg-brand px-4 py-1.5 text-xs font-bold text-brand-foreground"
              >
                ADD
              </button>
              <button
                onClick={() => {
                  toggle(fav)
                  toast.success('Removed from favorites')
                }}
                className="shrink-0 grid h-8 w-8 place-items-center rounded-full bg-red-50 text-red-600 hover:bg-red-100"
                aria-label="Remove from favorites"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </section>
  )
}

function EditProfileModal({
  profile,
  updateProfile,
  onClose,
}: {
  profile: { name: string | null; phone: string | null; email: string }
  updateProfile: (data: { name?: string; phone?: string }) => Promise<{ error: string | null }>
  onClose: () => void
}) {
  const currentPhoneDigits = profile.phone
    ? (() => {
        const digits = profile.phone.replace(/\D/g, '')
        return digits.length === 12 && digits.startsWith('91')
          ? digits.slice(2)
          : digits.length === 11 && digits.startsWith('0')
            ? digits.slice(1)
            : digits
      })()
    : ''
  const [name, setName] = useState(profile.name ?? '')
  const [phone, setPhone] = useState(currentPhoneDigits)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!name.trim()) {
      toast.error('Name cannot be empty')
      return
    }
    const rawDigits = phone.replace(/\D/g, '')
    const digits =
      rawDigits.length === 12 && rawDigits.startsWith('91')
        ? rawDigits.slice(2)
        : rawDigits.length === 11 && rawDigits.startsWith('0')
          ? rawDigits.slice(1)
          : rawDigits
    if (!/^[6-9]\d{9}$/.test(digits)) {
      toast.error('Please enter a valid 10-digit Indian mobile number')
      return
    }
    setSaving(true)
    try {
      const { error } = await updateProfile({
        name: name.trim(),
        phone: `+91 ${digits}`,
      })
      if (error) {
        toast.error(error)
      } else {
        toast.success('Profile updated successfully')
        onClose()
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-end bg-black/50 sm:place-items-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%', opacity: 0.5 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="flex w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-card shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="text-base font-bold text-foreground">Edit Profile</h2>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-4 p-4">
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-foreground">Full Name</span>
            <div className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2.5 focus-within:ring-2 focus-within:ring-brand/40">
              <UserIcon className="h-4 w-4 text-muted-foreground" />
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="flex-1 bg-transparent text-sm outline-none"
                maxLength={100}
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-bold text-foreground">
              Contact Number <span className="text-red-500">*</span>
            </span>
            <div className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2.5 focus-within:ring-2 focus-within:ring-brand/40">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-muted-foreground">+91</span>
              <input
                type="tel"
                name="phone"
                autoComplete="tel-national"
                inputMode="numeric"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="10-digit mobile number"
                className="flex-1 bg-transparent text-sm outline-none"
                maxLength={10}
              />
            </div>
            <span className="mt-1 block text-[10px] text-muted-foreground">
              Used for delivery — we&apos;ll call/SMS on this number.
            </span>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-bold text-muted-foreground">Email</span>
            <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2.5">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <input
                value={profile.email}
                disabled
                className="flex-1 cursor-not-allowed bg-transparent text-sm text-muted-foreground outline-none"
              />
            </div>
            <span className="mt-1 block text-[10px] text-muted-foreground">
              Email cannot be changed.
            </span>
          </label>
        </div>

        <div className="flex gap-2 border-t border-border p-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-xl border border-border py-2.5 text-sm font-bold text-foreground disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand py-2.5 text-sm font-bold text-brand-foreground disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Saving…
              </>
            ) : (
              'Save Changes'
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
