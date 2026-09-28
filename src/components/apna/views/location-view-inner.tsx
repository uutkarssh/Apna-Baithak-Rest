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
  RefreshCw,
  Lock,
  ShieldAlert,
  WifiOff,
} from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useApp } from '@/store/app'
import { useAuth } from '@/components/providers/auth-provider'
import { RESTAURANT } from '@/lib/constants'
import {
  distanceFromRestaurant,
  isWithinDeliveryRadius,
  isPlausibleCustomerLocation,
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

// ============================================================================
// STATE MACHINE
// ============================================================================
//
// The map screen has a strict state machine that refuses to let the customer
// save an address until we have a real GPS fix. The previous version silently
// fell back to the restaurant's coordinates when geolocation failed — that was
// the root cause of the AB-2026-0005 incident (a ₹20 charge for a 5.4 km
// order). This version does NOT have a fallback path; every blocking state
// forces the user to take an action.
//
// States:
//
//   checking       — initial. We're querying navigator.permissions to find
//                    out whether geolocation is granted/prompt/denied.
//
//   unsupported    — navigator.geolocation doesn't exist (very old browser).
//                    Full-screen block; no recovery.
//
//   insecure       — page is served over HTTP (not HTTPS) and geolocation
//                    is therefore disabled by the browser. Full-screen
//                    block; the only recovery is "use HTTPS".
//
//   denied         — user has previously denied geolocation permission.
//                    Full-screen block with Chrome-Android + PWA unblock
//                    steps; "I've enabled it, try again" button.
//                    Listens for permission.onchange; auto-resumes to
//                    "locating" when the user flips it back to granted.
//
//   locating       — permission is granted; we're calling getCurrentPosition.
//                    Spinner UI.
//
//   fix_failed     — getCurrentPosition's error callback fired (timeout,
//                    position unavailable). Show retry button. Does NOT
//                    fall back to anything — the customer must retry and
//                    get a real fix.
//
//   low_accuracy   — fix succeeded but coords.accuracy > 500 m. Show
//                    "Your GPS fix was inaccurate — try again or adjust
//                    the pin" UI. The pin is now draggable, but the user
//                    is encouraged to retry for a better fix.
//
//   located        — fix succeeded with accuracy <= 500 m. Pin is placed
//                    at the GPS fix and is now draggable. Search box is
//                    enabled. Customer can edit/save the address.
//
// The "Confirm & Proceed" button is gated on state === 'located' (or
// 'low_accuracy' once the user has moved the pin from the initial fix).

type GpsState =
  | { kind: 'checking' }
  | { kind: 'unsupported' }
  | { kind: 'insecure' }
  | { kind: 'denied' }
  | { kind: 'locating' }
  | { kind: 'fix_failed'; message: string }
  | { kind: 'low_accuracy'; accuracy: number }
  | { kind: 'located'; accuracy: number }

// Maximum acceptable GPS inaccuracy (meters). Coarser fixes must be retried
// or manually adjusted by the customer. 500 m is roughly half a city block —
// tight enough that the delivery charge will be accurate, loose enough to
// not frustrate users on devices with weak GPS.
const MAX_ACCURACY_M = 500

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

  // === GPS STATE MACHINE ===
  // Pin starts as null — there is NO default restaurant-coordinate fallback.
  // The pin is only placed once a real GPS fix is obtained.
  const [gps, setGps] = useState<GpsState>({ kind: 'checking' })
  const [pin, setPin] = useState<[number, number] | null>(null)
  // Tracks whether the user has manually moved the pin after the initial fix.
  // Used by low_accuracy state to allow the "Confirm" button if the user
  // drags the pin to a sensible place even with a poor fix.
  const [pinMoved, setPinMoved] = useState(false)
  const [reverseLabel, setReverseLabel] = useState('')
  const [reverseLoading, setReverseLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{ lat: number; lon: number; label: string }[]>([])

  const [houseFlat, setHouseFlat] = useState('')
  const [streetArea, setStreetArea] = useState('')
  const [landmark, setLandmark] = useState('')
  const [city, setCity] = useState('')
  const [pincode, setPincode] = useState('')
  const [label, setLabel] = useState<'Home' | 'Work' | 'Other'>('Home')
  const [saving, setSaving] = useState(false)

  // Live distance — only computed when pin is set.
  const distKm = pin ? distanceFromRestaurant(pin[0], pin[1]) : null
  const withinRadius = pin ? isWithinDeliveryRadius(pin[0], pin[1]) : false
  const plausible = pin ? isPlausibleCustomerLocation(pin[0], pin[1]) : false

  // ===== GPS fix helper =====
  // Used both on mount (after permission resolves to 'granted') and on retry
  // button presses. Updates the state machine based on the outcome — there
  // is NO silent fallback path.
  const fetchGpsFix = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGps({ kind: 'unsupported' })
      return
    }
    setGps({ kind: 'locating' })
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const acc = pos.coords.accuracy ?? Number.MAX_SAFE_INTEGER
        setPin([pos.coords.latitude, pos.coords.longitude])
        setPinMoved(false)
        if (acc > MAX_ACCURACY_M) {
          setGps({ kind: 'low_accuracy', accuracy: acc })
        } else {
          setGps({ kind: 'located', accuracy: acc })
        }
      },
      (err) => {
        // err.code: 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT
        // We do NOT silently fall back to the restaurant. The user must retry.
        if (err.code === err.PERMISSION_DENIED) {
          // The user denied the prompt just now. Treat same as 'denied' so
          // they see the full-screen unblock instructions.
          setGps({ kind: 'denied' })
        } else {
          setGps({
            kind: 'fix_failed',
            message: err.message || 'Could not get your location. Please try again.',
          })
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )
  }, [])

  // ===== PERMISSION CHECK ON MOUNT =====
  // Use the Permissions API to discover the current geolocation permission
  // state without triggering a prompt. Then act accordingly.
  useEffect(() => {
    if (typeof window === 'undefined') return
    // Insecure context (HTTP, not localhost) — geolocation is disabled by
    // the browser. Show the insecure-context block.
    const isSecure =
      typeof window.isSecureContext === 'boolean'
        ? window.isSecureContext
        : window.location.protocol === 'https:' || window.location.hostname === 'localhost'
    if (!isSecure) {
      setGps({ kind: 'insecure' })
      return
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGps({ kind: 'unsupported' })
      return
    }
    // Permissions API may be missing on some browsers (notably older iOS Safari).
    // In that case, we fall through to triggering the prompt via getCurrentPosition.
    if (!navigator.permissions || typeof navigator.permissions.query !== 'function') {
      // No Permissions API — trigger the prompt directly.
      fetchGpsFix()
      return
    }
    let permStatus: PermissionStatus | null = null
    let cancelled = false
    navigator.permissions
      .query({ name: 'geolocation' as PermissionName })
      .then((status) => {
        if (cancelled) return
        permStatus = status
        const apply = () => {
          if (status.state === 'granted') {
            fetchGpsFix()
          } else if (status.state === 'denied') {
            setGps({ kind: 'denied' })
          } else {
            // 'prompt' — trigger the browser geolocation prompt. The
            // resulting success/error callback advances the state machine.
            fetchGpsFix()
          }
        }
        apply()
        // Listen for permission changes — e.g. the customer flips it back
        // to 'granted' after seeing our full-screen blocked UI.
        status.onchange = () => {
          if (status.state === 'granted') {
            fetchGpsFix()
          } else if (status.state === 'denied') {
            setGps({ kind: 'denied' })
          }
        }
      })
      .catch(() => {
        if (cancelled) return
        // Permissions query failed (rare). Fall through to direct prompt.
        fetchGpsFix()
      })
    return () => {
      cancelled = true
      if (permStatus) permStatus.onchange = null
    }
  }, [fetchGpsFix])

  // ===== Reverse geocode whenever pin moves (only after fix obtained) =====
  useEffect(() => {
    if (!pin) return
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
  }, [pin ? pin[0] : null, pin ? pin[1] : null])

  // ===== Pin move handler — also flags pinMoved for the low-accuracy path =====
  const onPinMove = useCallback((p: [number, number]) => {
    setPin(p)
    setPinMoved(true)
  }, [])

  async function runSearch(q: string) {
    if (!q.trim()) {
      setSearchResults([])
      return
    }
    const results = await geocode(q)
    setSearchResults(results)
  }

  // ===== "Confirm & Proceed" save handler =====
  // Gated on the GPS fix being obtained. We DO NOT save if pin is null,
  // if pin is at the restaurant, or if pin is outside the radius.
  async function saveAddress() {
    if (authLoading) return
    if (!profile) {
      goToLogin('location')
      return
    }
    if (!houseFlat || !streetArea || !city || !pincode) {
      toast.error('Please fill all address fields (house/flat, street, city, pincode)')
      return
    }
    if (!pin) {
      toast.error('Please wait for your GPS location to be set first.')
      return
    }
    if (!plausible) {
      toast.error('Your pin appears to be at the restaurant. Please move it to your delivery location.')
      return
    }
    if (!withinRadius) {
      toast.error(`This location is ${distKm!.toFixed(2)} km away — outside our ${RESTAURANT.deliveryRadiusKm} km delivery range.`)
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
          // NOTE: we DO NOT send distanceKm — the backend recomputes it
          // server-side. Sending it would be misleading; the backend ignores
          // it anyway as of the incident fix.
          isDefault: true,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Failed to save address')
      }
      const { address } = await res.json()
      setSelectedAddressId(address.id)
      qc.invalidateQueries({ queryKey: ['addresses'] })
      toast.success('Address saved')
      setView('cart')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  // ============================================================================
  // RENDER HELPERS — each GPS state has its own UI
  // ============================================================================

  // The full-screen blocking UI is shown for 'checking', 'unsupported',
  // 'insecure', 'denied', 'locating', and 'fix_failed'. Only when we
  // have a real fix (or low-accuracy fix) do we show the full map UI.
  const showFullMap = pin != null && (gps.kind === 'located' || gps.kind === 'low_accuracy')
  const canSave =
    pin != null &&
    plausible &&
    withinRadius &&
    (gps.kind === 'located' || (gps.kind === 'low_accuracy' && pinMoved))

  // ===== Full-screen blocked UI (denied / unsupported / insecure) =====
  if (gps.kind === 'denied' || gps.kind === 'unsupported' || gps.kind === 'insecure') {
    return <LocationPermissionBlock kind={gps.kind} onRetry={fetchGpsFix} onBack={back} />
  }

  // ===== Full-screen loading / retry UI (checking / locating / fix_failed) =====
  if (gps.kind === 'checking' || gps.kind === 'locating' || gps.kind === 'fix_failed') {
    return (
      <LocationAcquiringScreen
        kind={gps.kind}
        message={gps.kind === 'fix_failed' ? gps.message : undefined}
        onRetry={fetchGpsFix}
        onBack={back}
      />
    )
  }

  // ===== Map + form UI (located OR low_accuracy) =====
  // (low_accuracy shows an extra retry banner above the map.)
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-[500] bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mb-3 flex items-center gap-3">
          <button onClick={back} className="grid h-9 w-9 place-items-center rounded-full bg-muted">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-xl font-bold text-foreground">Select Your Location</h1>
        </div>
        {/* Search is only enabled once we have a GPS fix. The user can refine
            the pin by searching for an area, but they cannot use search as a
            way to bypass the GPS requirement. */}
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
                  setPinMoved(true)
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

      {/* Low-accuracy banner — shows above the map when the fix was poor.
          The pin is already placed (we still trust the GPS coords, just
          loosely), but the user is encouraged to retry or manually adjust. */}
      {gps.kind === 'low_accuracy' && (
        <div className="flex items-start gap-2 bg-amber-50 px-4 py-3 text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="flex-1 text-xs leading-relaxed">
            <p className="font-bold">GPS fix was inaccurate (~{Math.round(gps.accuracy)} m)</p>
            <p className="mt-0.5">
              The pin has been placed at your approximate location. Please drag it to your exact
              delivery spot, or retry for a more accurate fix.
            </p>
            <button
              onClick={fetchGpsFix}
              className="mt-2 inline-flex items-center gap-1 rounded-md bg-amber-600 px-3 py-1.5 text-[11px] font-bold text-white shadow-sm"
            >
              <RefreshCw className="h-3 w-3" /> Retry GPS
            </button>
          </div>
        </div>
      )}

      {/* MAP — fills its allotted height; the pin is always draggable. */}
      <div className="relative z-0 h-[42vh] min-h-[260px] w-full">
        {showFullMap && pin ? (
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
            <DraggablePin position={pin} onMove={onPinMove} />
            <ClickToMove onMove={onPinMove} />
            <Recenter center={pin} />
          </MapContainer>
        ) : (
          <div className="grid h-full place-items-center bg-muted text-sm text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}

        {/* Re-center button — re-runs the GPS fetch. While the fetch is in
            flight, gps.kind flips to 'locating' and the whole component
            switches to the full-screen LocationAcquiringScreen (handled by
            the early-return above). So in this map UI we only see
            'located' or 'low_accuracy' — the button is always enabled here.
            Tapping it briefly flips the screen to the acquiring UI. */}
        <button
          onClick={fetchGpsFix}
          className="absolute right-3 top-3 z-[600] grid h-11 w-11 place-items-center rounded-full bg-white shadow-md"
          aria-label="Re-acquire GPS"
        >
          <Crosshair className="h-5 w-5 text-brand" />
        </button>

        {/* LIVE distance badge — bottom of the map, updates as the pin moves. */}
        {pin && (
          <div className="pointer-events-none absolute inset-x-3 bottom-3 z-[600] flex items-center justify-between gap-2 rounded-xl bg-white/95 px-3 py-2 shadow-md backdrop-blur">
            <span className="flex items-center gap-2 text-xs font-semibold">
              <Navigation className="h-4 w-4 text-brand" />
              {distKm!.toFixed(2)} km from restaurant
            </span>
            {withinRadius ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                <CheckCircle2 className="h-3 w-3" /> Within {RESTAURANT.deliveryRadiusKm} km
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">
                <AlertTriangle className="h-3 w-3" /> Outside delivery area
              </span>
            )}
          </div>
        )}
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
            onClick={fetchGpsFix}
            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-bold text-brand-foreground shadow-sm transition active:scale-[0.99]"
          >
            <Crosshair className="h-4 w-4" />
            <span className="truncate">Re-acquire GPS</span>
          </button>
          <button
            onClick={() => {
              setHouseFlat('')
              setStreetArea('')
              setLandmark('')
              setCity('')
              setPincode('')
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
          {!withinRadius && pin && (
            <p className="rounded-lg bg-red-50 p-2 text-xs font-medium text-red-700">
              This location is {distKm!.toFixed(2)} km away — outside our {RESTAURANT.deliveryRadiusKm} km delivery range. Move the pin closer to proceed.
            </p>
          )}
          <button
            type="submit"
            disabled={saving || !canSave}
            className="mt-1 w-full rounded-xl bg-brand py-3 text-sm font-bold text-brand-foreground shadow-md transition active:scale-[0.99] disabled:opacity-50"
          >
            {saving ? 'Saving…' : gps.kind === 'low_accuracy' && !pinMoved ? 'Adjust pin to confirm' : 'Confirm & Proceed'}
          </button>
        </form>
        <div className="h-4" />
      </div>
    </div>
  )
}

// ============================================================================
// FULL-SCREEN PERMISSION BLOCK
// ============================================================================

function LocationPermissionBlock({
  kind,
  onRetry,
  onBack,
}: {
  kind: 'denied' | 'unsupported' | 'insecure'
  onRetry: () => void
  onBack: () => void
}) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-[500] bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="grid h-9 w-9 place-items-center rounded-full bg-muted">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-xl font-bold text-foreground">Location Required</h1>
        </div>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-12 text-center">
        <div className="grid h-24 w-24 place-items-center rounded-full bg-red-100">
          {kind === 'insecure' ? (
            <WifiOff className="h-10 w-10 text-red-600" />
          ) : kind === 'unsupported' ? (
            <ShieldAlert className="h-10 w-10 text-red-600" />
          ) : (
            <Lock className="h-10 w-10 text-red-600" />
          )}
        </div>

        <div className="max-w-md space-y-2">
          <h2 className="text-lg font-bold text-foreground">
            {kind === 'denied'
              ? 'Location access is required to place an order'
              : kind === 'insecure'
              ? 'This page must be served over HTTPS to use location'
              : 'Location is not supported on this device'}
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {kind === 'denied'
              ? "We need your real GPS location to place your pin at the right spot and compute the correct delivery fee. We don't store your live location after the address is saved."
              : kind === 'insecure'
              ? "Browsers disable geolocation on non-HTTPS pages. Please open this site via the secure https:// link (or run on localhost during development)."
              : "Your browser does not support the Geolocation API. Please use a recent version of Chrome, Firefox, Safari, or Edge."}
          </p>
        </div>

        {kind === 'denied' && (
          <div className="max-w-md space-y-4 rounded-2xl border border-border bg-card p-4 text-left text-sm shadow-sm">
            <div>
              <p className="mb-1 font-bold text-foreground">Chrome on Android</p>
              <ol className="list-decimal space-y-1 pl-5 text-xs leading-relaxed text-muted-foreground">
                <li>Tap the <span className="font-semibold">lock icon</span> in the address bar (left of the URL).</li>
                <li>Tap <span className="font-semibold">Permissions</span> → <span className="font-semibold">Location</span>.</li>
                <li>Select <span className="font-semibold">Allow</span>.</li>
                <li>Tap <span className="font-semibold">"I've enabled it, try again"</span> below.</li>
              </ol>
            </div>
            <div>
              <p className="mb-1 font-bold text-foreground">Installed PWA (Add to Home Screen)</p>
              <ol className="list-decimal space-y-1 pl-5 text-xs leading-relaxed text-muted-foreground">
                <li>Long-press the app icon on your home screen.</li>
                <li>Tap <span className="font-semibold">App info</span> → <span className="font-semibold">Permissions</span>.</li>
                <li>Tap <span className="font-semibold">Location</span> → <span className="font-semibold">Allow only while using the app</span>.</li>
                <li>Re-open the app and tap <span className="font-semibold">"I've enabled it, try again"</span> below.</li>
              </ol>
            </div>
          </div>
        )}

        {kind === 'denied' && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3 text-sm font-bold text-brand-foreground shadow-md active:scale-[0.99]"
          >
            <RefreshCw className="h-4 w-4" />
            I've enabled it, try again
          </button>
        )}

        {kind === 'insecure' && (
          <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
            If you reached this page via an http:// link, please ask the site owner to enable HTTPS. Geolocation is
            blocked by the browser on insecure origins for your safety.
          </p>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// FULL-SCREEN "ACQUIRING GPS" / RETRY SCREEN
// ============================================================================

function LocationAcquiringScreen({
  kind,
  message,
  onRetry,
  onBack,
}: {
  kind: 'checking' | 'locating' | 'fix_failed'
  message?: string
  onRetry: () => void
  onBack: () => void
}) {
  const title =
    kind === 'checking' ? 'Checking location permission…' :
    kind === 'locating' ? 'Getting your GPS location…' :
    'Could not get your location'
  const body =
    kind === 'checking' ? 'Please wait a moment while we check whether location access is enabled.' :
    kind === 'locating' ? 'We are acquiring a real GPS fix to place your pin at the right spot. Please keep your device still.' :
    (message || 'Your GPS could not be reached in time. Please retry — we will not proceed without a real fix.')
  const showRetry = kind === 'fix_failed'
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-[500] bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="grid h-9 w-9 place-items-center rounded-full bg-muted">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-xl font-bold text-foreground">Select Your Location</h1>
        </div>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-12 text-center">
        <div className="grid h-24 w-24 place-items-center rounded-full bg-brand-softer">
          {showRetry ? (
            <AlertTriangle className="h-10 w-10 text-amber-600" />
          ) : (
            <Loader2 className="h-10 w-10 animate-spin text-brand" />
          )}
        </div>
        <div className="max-w-md space-y-2">
          <h2 className="text-lg font-bold text-foreground">{title}</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
        </div>
        {showRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3 text-sm font-bold text-brand-foreground shadow-md active:scale-[0.99]"
          >
            <RefreshCw className="h-4 w-4" />
            Retry GPS
          </button>
        )}
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
          // Detect bad saved addresses (created before the GPS-required fix):
          //   - lat/lng exactly match the restaurant's
          //   - distanceKm is below the plausibility floor (0.05 km)
          //   - distanceKm is null (older schema migrations may have left it NULL)
          const isBadAddress =
            (a.latitude === RESTAURANT.lat && a.longitude === RESTAURANT.lng) ||
            (a.distanceKm != null && a.distanceKm < 0.05) ||
            a.distanceKm == null
          return (
            <div
              key={a.id}
              className={`rounded-xl border p-3 transition ${
                isSelected ? 'border-brand bg-brand-softer' : 'border-border bg-card'
              } ${isBadAddress ? 'ring-2 ring-red-300' : ''}`}
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
                  {a.distanceKm != null ? (
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      {a.distanceKm.toFixed(2)} km from restaurant
                    </span>
                  ) : (
                    <span className="mt-0.5 block text-[11px] font-bold text-red-600">
                      No distance recorded — please re-pick this address
                    </span>
                  )}
                  {isBadAddress && (
                    <span className="mt-0.5 block text-[11px] font-bold text-red-600">
                      ⚠ Saved location is invalid. Please tap to re-pick.
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
