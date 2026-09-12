'use client'
import { authedFetch } from '@/components/providers/providers'

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  MapContainer,
  TileLayer,
  Marker,
  useMapEvents,
  useMap,
} from 'react-leaflet'
import L from 'leaflet'
import {
  ArrowLeft,
  Search,
  Crosshair,
  Plus,
  MapPin,
  Loader2,
  CheckCircle2,
  Navigation,
  AlertTriangle,
  Pencil,
  Trash2,
  Star,
  X,
} from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useApp } from '@/store/app'
import { useAuth } from '@/components/providers/auth-provider'
import { RESTAURANT } from '@/lib/constants'
import {
  distanceFromRestaurant,
  isWithinDeliveryRadius,
  reverseGeocode,
  geocode,
} from '@/lib/geo'
import { toast } from 'sonner'
import type { Address } from '@/lib/types'

// custom draggable pin icon
const pinIcon = L.divIcon({
  className: '',
  html: `<div style="transform: translate(-50%, -100%);"><svg width="34" height="42" viewBox="0 0 24 24" fill="#FF5252" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z"/></svg></div>`,
  iconSize: [34, 42],
  iconAnchor: [0, 0],
})
const restaurantIcon = L.divIcon({
  className: '',
  html: `<div style="transform: translate(-50%, -100%);"><svg width="30" height="36" viewBox="0 0 24 24" fill="#1a1a1a" xmlns="http://www.w3.org/2000/svg"><path d="M11 2v2h-1v6.6L4 19v3h16v-3l-6-8.4V4h-1V2h-2zm2 9.2L18.5 18h-13L11 11.2z"/></svg></div>`,
  iconSize: [30, 36],
  iconAnchor: [0, 0],
})

function DraggablePin({ position, onMove }: { position: [number, number]; onMove: (p: [number, number]) => void }) {
  return (
    <Marker
      position={position}
      icon={pinIcon}
      draggable
      eventHandlers={{
        dragend: (e: any) => {
          const m = e.target as L.Marker
          const ll = m.getLatLng()
          onMove([ll.lat, ll.lng])
        },
        drag: (e: any) => {
          // Live update during drag so the distance label updates in
          // real-time as the user moves the pin.
          const m = e.target as L.Marker
          const ll = m.getLatLng()
          onMove([ll.lat, ll.lng])
        },
      }}
    />
  )
}

function ClickToMove({ onMove }: { onMove: (p: [number, number]) => void }) {
  useMapEvents({
    click(e) {
      onMove([e.latlng.lat, e.latlng.lng])
    },
  })
  return null
}

function Recenter({ center }: { center: [number, number] }) {
  const map = useMap()
  useEffect(() => {
    map.flyTo(center, Math.max(map.getZoom(), 15), { duration: 0.6 })
  }, [center[0], center[1]])
  return null
}

export function LocationView() {
  const back = useApp((s) => s.back)
  const setView = useApp((s) => s.setView)
  const goToLogin = useApp((s) => s.goToLogin)
  const setSelectedAddressId = useApp((s) => s.setSelectedAddressId)
  const selectedAddressId = useApp((s) => s.selectedAddressId)
  const { profile, loading: authLoading } = useAuth()
  const qc = useQueryClient()

  const [pin, setPin] = useState<[number, number]>([RESTAURANT.lat, RESTAURANT.lng])
  const [reverseLabel, setReverseLabel] = useState('')
  const [reverseLoading, setReverseLoading] = useState(false)
  const [locating, setLocating] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{ lat: number; lon: number; label: string }[]>([])
  const [autoLocated, setAutoLocated] = useState(false)

  const [houseFlat, setHouseFlat] = useState('')
  const [streetArea, setStreetArea] = useState('')
  const [landmark, setLandmark] = useState('')
  const [city, setCity] = useState('')
  const [pincode, setPincode] = useState('')
  const [label, setLabel] = useState<'Home' | 'Work' | 'Other'>('Home')
  const [saving, setSaving] = useState(false)

  // Live distance between the current pin and the restaurant — updates on
  // every drag (see DraggablePin drag handler).
  const distKm = distanceFromRestaurant(pin[0], pin[1])
  const withinRadius = isWithinDeliveryRadius(pin[0], pin[1])

  const useCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error('Location not supported on this device')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPin([pos.coords.latitude, pos.coords.longitude])
        setLocating(false)
        toast.success('Moved pin to your current location')
      },
      (err) => {
        setLocating(false)
        toast.error('Could not get your location: ' + err.message)
      },
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }, [])

  // ===== AUTO-LOCATE ON MOUNT =====
  // As soon as the map screen opens, automatically fetch and center on the
  // user's current precise location. The user does NOT have to tap
  // "Use Current Location" first — that button stays available only for
  // re-centering if the pin has been moved.
  useEffect(() => {
    if (autoLocated) return
    if (typeof navigator === 'undefined' || !navigator.geolocation) return
    setAutoLocated(true)
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPin([pos.coords.latitude, pos.coords.longitude])
        setLocating(false)
      },
      () => {
        // Silent fail — user can manually tap the crosshair button later.
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }, [autoLocated])

  useEffect(() => {
    let active = true
    setReverseLoading(true)
    const t = setTimeout(async () => {
      const lbl = await reverseGeocode(pin[0], pin[1])
      if (!active) return
      setReverseLabel(lbl)
      setReverseLoading(false)
      if (lbl) {
        const pinMatch = lbl.match(/\b(\d{6})\b/)
        if (pinMatch) setPincode((p) => p || pinMatch[1])
        const parts = lbl.split(',').map((s) => s.trim())
        if (parts.length >= 3) {
          const last = parts[parts.length - 3] || ''
          if (last) setCity((c) => c || last)
        }
      }
    }, 500)
    return () => {
      active = false
      clearTimeout(t)
    }
  }, [pin[0], pin[1]])

  async function runSearch(q: string) {
    if (!q.trim()) {
      setSearchResults([])
      return
    }
    const results = await geocode(q)
    setSearchResults(results)
  }

  async function saveAddress() {
    // Gate on auth state — don't bounce while session is still loading.
    if (authLoading) return
    if (!profile) {
      // Remember location view as the return destination so after login
      // the user lands back here to continue saving the address.
      goToLogin('location')
      return
    }
    if (!houseFlat || !streetArea || !city || !pincode) {
      toast.error('Please fill all address fields (house/flat, street, city, pincode)')
      return
    }
    if (!withinRadius) {
      toast.error(`This location is ${distKm.toFixed(2)} km away — outside our ${RESTAURANT.deliveryRadiusKm} km delivery range.`)
      return
    }
    setSaving(true)
    try {
      const res = await authedFetch('/api/addresses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label,
          houseFlat,
          streetArea,
          landmark,
          city,
          pincode,
          latitude: pin[0],
          longitude: pin[1],
          distanceKm: Number(distKm.toFixed(2)),
          isDefault: true,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Failed to save address')
      }
      const { address } = await res.json()
      setSelectedAddressId(address.id)
      // Invalidate the shared ['addresses'] cache so any screen that
      // queries saved addresses (cart, checkout, top-bar, profile)
      // immediately re-fetches and shows the new address.
      qc.invalidateQueries({ queryKey: ['addresses'] })
      toast.success('Address saved')
      setView('cart')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-[500] bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mb-3 flex items-center gap-3">
          <button onClick={back} className="grid h-9 w-9 place-items-center rounded-full bg-muted">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-xl font-bold text-foreground">Select Your Location</h1>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-brand/20 bg-white px-4 py-2.5 shadow-sm">
          <Search className="h-4 w-4 text-brand" />
          <input
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              runSearch(e.target.value)
            }}
            placeholder="Search an area, landmark or pincode"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        {searchResults.length > 0 && (
          <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-border bg-card thin-scroll">
            {searchResults.map((r, i) => (
              <button
                key={i}
                onClick={() => {
                  setPin([r.lat, r.lon])
                  setSearchResults([])
                  setSearchQuery(r.label)
                }}
                className="flex w-full items-start gap-2 border-b border-border/50 p-2.5 text-left last:border-0"
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                <span className="text-xs leading-snug">{r.label}</span>
              </button>
            ))}
          </div>
        )}
      </header>

      {/* MAP — fills its allotted height; the pin is always draggable. */}
      <div className="relative z-0 h-[42vh] min-h-[260px] w-full">
        <MapContainer
          center={pin}
          zoom={15}
          scrollWheelZoom={false}
          className="h-full w-full"
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={[RESTAURANT.lat, RESTAURANT.lng]} icon={restaurantIcon} />
          <DraggablePin position={pin} onMove={setPin} />
          <ClickToMove onMove={setPin} />
          <Recenter center={pin} />
        </MapContainer>

        {/* Re-center button — top-right floating; for re-centering only. */}
        <button
          onClick={useCurrentLocation}
          className="absolute right-3 top-3 z-[600] grid h-11 w-11 place-items-center rounded-full bg-white shadow-md"
          aria-label="Use current location"
        >
          {locating ? <Loader2 className="h-5 w-5 animate-spin text-brand" /> : <Crosshair className="h-5 w-5 text-brand" />}
        </button>

        {/* LIVE distance badge — bottom of the map, updates as the pin moves. */}
        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-[600] flex items-center justify-between gap-2 rounded-xl bg-white/95 px-3 py-2 shadow-md backdrop-blur">
          <span className="flex items-center gap-2 text-xs font-semibold">
            <Navigation className="h-4 w-4 text-brand" />
            {distKm.toFixed(2)} km from restaurant
          </span>
          {withinRadius ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
              <CheckCircle2 className="h-3 w-3" /> Within {RESTAURANT.deliveryRadiusKm} km
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">
              <AlertTriangle className="h-3 w-3" /> Outside range
            </span>
          )}
        </div>
      </div>

      {/* CONTENT BELOW THE MAP — saved addresses, action buttons, address form. */}
      <div className="flex flex-col gap-4 px-4 py-4">
        {/* Reverse-geocoded label */}
        <div className="rounded-2xl border border-brand/20 bg-brand-softer p-3">
          <p className="text-xs font-semibold text-muted-foreground">Place the pin at exact delivery location</p>
          <p className="mt-1 line-clamp-2 text-xs text-foreground">
            {reverseLoading ? 'Resolving address…' : reverseLabel || 'Drag the pin to set your delivery point'}
          </p>
        </div>

        {/* ACTION BUTTONS — properly aligned, equal-width, evenly spaced. */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={useCurrentLocation}
            disabled={locating}
            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-bold text-brand-foreground shadow-sm transition active:scale-[0.99] disabled:opacity-50"
          >
            {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
            <span className="truncate">Use Current Location</span>
          </button>
          <button
            onClick={() => {
              setHouseFlat('')
              setStreetArea('')
              setLandmark('')
              setCity('')
              setPincode('')
              // scroll the form into view
              setTimeout(() => {
                document.getElementById('address-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              }, 50)
            }}
            className="flex h-12 items-center justify-center gap-2 rounded-xl border border-brand/30 bg-white px-4 text-sm font-bold text-brand shadow-sm transition active:scale-[0.99]"
          >
            <Plus className="h-4 w-4" />
            <span className="truncate">Add New Address</span>
          </button>
        </div>

        {/* SAVED ADDRESSES — below the map, NOT inside/over it. */}
        <SavedAddresses
          selectedId={selectedAddressId}
          onSelect={(id) => {
            setSelectedAddressId(id)
            setView('cart')
          }}
        />

        {/* ADDRESS FORM — same left margin as content; saved on submit. */}
        <form
          id="address-form"
          onSubmit={(e) => {
            e.preventDefault()
            saveAddress()
          }}
          className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm"
        >
          <h3 className="text-sm font-bold text-foreground">Address Details</h3>
          <div className="flex gap-2">
            {(['Home', 'Work', 'Other'] as const).map((l) => (
              <button
                type="button"
                key={l}
                onClick={() => setLabel(l)}
                className={`flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  label === l
                    ? 'bg-brand text-brand-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
          <Field label="House / Flat No." value={houseFlat} onChange={setHouseFlat} placeholder="e.g. House 12, Flat 2A" required />
          <Field label="Street / Area" value={streetArea} onChange={setStreetArea} placeholder="e.g. Subhash Nagar" required />
          <Field label="Landmark" value={landmark} onChange={setLandmark} placeholder="e.g. near Union Bank" />
          <div className="grid grid-cols-2 gap-2">
            <Field label="City" value={city} onChange={setCity} placeholder="e.g. Bankat Khas" required />
            <Field label="PIN Code" value={pincode} onChange={(v) => setPincode(v.replace(/[^0-9]/g, '').slice(0, 6))} placeholder="221308" required inputMode="numeric" />
          </div>
          {!withinRadius && (
            <p className="rounded-lg bg-red-50 p-2 text-xs font-medium text-red-700">
              This location is {distKm.toFixed(2)} km away — outside our {RESTAURANT.deliveryRadiusKm} km delivery range. Move the pin closer to proceed.
            </p>
          )}
          <button
            type="submit"
            disabled={saving || !withinRadius}
            className="mt-1 w-full rounded-xl bg-brand py-3 text-sm font-bold text-brand-foreground shadow-md transition active:scale-[0.99] disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Confirm & Proceed'}
          </button>
        </form>
        <div className="h-4" />
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
  inputMode,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  required?: boolean
  inputMode?: 'text' | 'numeric'
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-foreground">{label}{required && <span className="text-brand"> *</span>}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        inputMode={inputMode}
        className="w-full rounded-xl bg-muted px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand/40"
      />
    </label>
  )
}

function SavedAddresses({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string) => void }) {
  const { profile, loading: authLoading } = useAuth()
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['addresses'],
    queryFn: async () => {
      const res = await authedFetch('/api/addresses')
      if (!res.ok) return { addresses: [] }
      return res.json() as Promise<{ addresses: Address[] }>
    },
    enabled: !authLoading && !!profile,
  })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState<'Home' | 'Work' | 'Other'>('Home')

  if (authLoading) return null
  if (!profile) return null
  const addresses = data?.addresses ?? []

  if (isLoading && addresses.length === 0) {
    return (
      <section>
        <h3 className="mb-2 text-sm font-bold text-foreground">Saved Addresses</h3>
        <div className="flex flex-col gap-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-start gap-2 rounded-xl border border-border/60 bg-card p-3">
              <div className="mt-0.5 h-4 w-4 animate-pulse rounded bg-muted" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
                <div className="h-2.5 w-2/3 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </section>
    )
  }
  if (addresses.length === 0) return null

  async function setDefault(id: string) {
    try {
      const res = await authedFetch(`/api/addresses/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDefault: true }),
      })
      if (!res.ok) throw new Error('Failed to set default')
      toast.success('Default address updated')
      qc.invalidateQueries({ queryKey: ['addresses'] })
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  async function deleteAddress(id: string) {
    if (!confirm('Delete this saved address?')) return
    try {
      const res = await authedFetch(`/api/addresses/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      toast.success('Address deleted')
      qc.invalidateQueries({ queryKey: ['addresses'] })
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  return (
    <section>
      <h3 className="mb-2 text-sm font-bold text-foreground">Saved Addresses</h3>
      <div className="flex flex-col gap-2">
        {addresses.map((a) => {
          const isSelected = selectedId === a.id
          const isEditing = editingId === a.id
          return (
            <div
              key={a.id}
              className={`rounded-xl border p-3 transition ${
                isSelected ? 'border-brand bg-brand-softer' : 'border-border bg-card'
              }`}
            >
              <button
                onClick={() => !isEditing && onSelect(a.id)}
                className="flex w-full items-start gap-2 text-left"
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-bold text-foreground">
                      {a.label ?? 'Address'}
                    </span>
                    {a.isDefault && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-brand-softer px-1.5 py-0.5 text-[10px] font-bold text-brand">
                        <Star className="h-2.5 w-2.5 fill-brand" /> Default
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {a.houseFlat}, {a.streetArea}, {a.city} - {a.pincode}
                  </span>
                  {a.distanceKm != null && (
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      {a.distanceKm.toFixed(2)} km from restaurant
                    </span>
                  )}
                </span>
              </button>
              {/* Edit / Delete / Set-default row */}
              {!isEditing && (
                <div className="mt-2 flex flex-wrap items-center gap-2 pl-6">
                  {!a.isDefault && (
                    <button
                      onClick={() => setDefault(a.id)}
                      className="rounded-md bg-muted px-2 py-1 text-[11px] font-semibold text-foreground hover:bg-muted/70"
                    >
                      Set as default
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setEditingId(a.id)
                      setEditLabel((a.label as 'Home' | 'Work' | 'Other') ?? 'Other')
                    }}
                    className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] font-semibold text-foreground hover:bg-muted/70"
                  >
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                  <button
                    onClick={() => deleteAddress(a.id)}
                    className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-100"
                  >
                    <Trash2 className="h-3 w-3" /> Delete
                  </button>
                </div>
              )}
              {isEditing && (
                <EditAddressForm
                  address={a}
                  initialLabel={editLabel}
                  onCancel={() => setEditingId(null)}
                  onSaved={() => {
                    setEditingId(null)
                    qc.invalidateQueries({ queryKey: ['addresses'] })
                  }}
                />
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function EditAddressForm({
  address,
  initialLabel,
  onCancel,
  onSaved,
}: {
  address: Address
  initialLabel: 'Home' | 'Work' | 'Other'
  onCancel: () => void
  onSaved: () => void
}) {
  const [label, setLabel] = useState<'Home' | 'Work' | 'Other'>(initialLabel)
  const [houseFlat, setHouseFlat] = useState(address.houseFlat)
  const [streetArea, setStreetArea] = useState(address.streetArea)
  const [landmark, setLandmark] = useState(address.landmark ?? '')
  const [city, setCity] = useState(address.city)
  const [pincode, setPincode] = useState(address.pincode)
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    try {
      const res = await authedFetch(`/api/addresses/${address.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, houseFlat, streetArea, landmark, city, pincode }),
      })
      if (!res.ok) throw new Error('Failed to update')
      toast.success('Address updated')
      onSaved()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
      <div className="mb-2 flex gap-2">
        {(['Home', 'Work', 'Other'] as const).map((l) => (
          <button
            key={l}
            onClick={() => setLabel(l)}
            className={`flex-1 rounded-full px-2 py-1 text-[11px] font-semibold transition ${
              label === l ? 'bg-brand text-brand-foreground' : 'bg-muted text-muted-foreground'
            }`}
          >
            {l}
          </button>
        ))}
      </div>
      <input
        value={houseFlat}
        onChange={(e) => setHouseFlat(e.target.value)}
        placeholder="House / Flat"
        className="mb-2 w-full rounded-md bg-white px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand/40"
      />
      <input
        value={streetArea}
        onChange={(e) => setStreetArea(e.target.value)}
        placeholder="Street / Area"
        className="mb-2 w-full rounded-md bg-white px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand/40"
      />
      <input
        value={landmark}
        onChange={(e) => setLandmark(e.target.value)}
        placeholder="Landmark (optional)"
        className="mb-2 w-full rounded-md bg-white px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand/40"
      />
      <div className="mb-2 grid grid-cols-2 gap-2">
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="City"
          className="w-full rounded-md bg-white px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand/40"
        />
        <input
          value={pincode}
          onChange={(e) => setPincode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
          placeholder="PIN"
          inputMode="numeric"
          className="w-full rounded-md bg-white px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand/40"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={busy}
          className="flex-1 rounded-md bg-brand py-1.5 text-xs font-bold text-brand-foreground disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          className="flex-1 inline-flex items-center justify-center gap-1 rounded-md border border-border py-1.5 text-xs font-semibold text-foreground"
        >
          <X className="h-3 w-3" /> Cancel
        </button>
      </div>
    </div>
  )
}
