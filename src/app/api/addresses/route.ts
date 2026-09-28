import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSupabaseForUser } from '@/lib/supabase-server'
import { recomputeDistanceFromRestaurant, isPlausibleCustomerLocation } from '@/lib/geo'
import { validateDistance } from '@/lib/delivery'

async function getCustomer(req: Request) {
  const supabase = await getSupabaseForUser(req)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  return db.customer.findUnique({ where: { supabaseUserId: user.id } })
}

// GET /api/addresses — list current customer's saved addresses
export async function GET(req: NextRequest) {
  const customer = await getCustomer(req)
  if (!customer) return NextResponse.json({ addresses: [] })
  const addresses = await db.address.findMany({
    where: { customerId: customer.id },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  })
  return NextResponse.json({
    addresses: addresses.map((a) => ({
      id: a.id,
      label: a.label,
      houseFlat: a.houseFlat,
      streetArea: a.streetArea,
      landmark: a.landmark,
      city: a.city,
      pincode: a.pincode,
      latitude: a.latitude,
      longitude: a.longitude,
      distanceKm: a.distanceKm,
      isDefault: a.isDefault,
    })),
  })
}

// POST /api/addresses — create a new address (marks default if first or flag set)
//
// SECURITY: Never trust the client's `distanceKm`. Always recompute from the
// supplied lat/lng server-side. The client could be:
//   - a malicious user sending a custom `distanceKm: 0` to get free delivery
//   - a buggy client whose geolocation failed silently and left the pin on
//     the restaurant's coordinates (the AB-2026-0005 root cause)
// In either case, the server-side recompute + plausibility validation catches
// it before the address is persisted.
export async function POST(req: NextRequest) {
  const customer = await getCustomer(req)
  if (!customer) {
    return NextResponse.json({ error: 'Please sign in to save an address.' }, { status: 401 })
  }
  const body = await req.json()
  const {
    label,
    houseFlat,
    streetArea,
    landmark,
    city,
    pincode,
    latitude,
    longitude,
    // NOTE: `distanceKm` from the client is intentionally ignored. We recompute
    // it below from `latitude`/`longitude` server-side. Keeping the field in the
    // destructure would be misleading — it has no effect.
    isDefault,
  } = body ?? {}

  if (!houseFlat || !streetArea || !city || !pincode || latitude == null || longitude == null) {
    return NextResponse.json(
      { error: 'All address fields are required.' },
      { status: 400 }
    )
  }

  // === SERVER-SIDE COORDINATE VALIDATION ===
  // Parse and validate the supplied lat/lng.
  const lat = Number(latitude)
  const lng = Number(longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json(
      { error: 'Invalid coordinates. Please re-pick your location on the map.', code: 'INVALID_COORDS' },
      { status: 400 }
    )
  }

  // Plausibility check — reject if the pin is at the restaurant (the customer
  // never moved it, geolocation failed silently, etc.).
  if (!isPlausibleCustomerLocation(lat, lng)) {
    return NextResponse.json(
      {
        error:
          'Saved location appears to be at the restaurant. Please move the pin to your actual delivery location.',
        code: 'BELOW_MIN_VALID',
      },
      { status: 400 }
    )
  }

  // === SERVER-SIDE DISTANCE RECOMPUTE (single source of truth) ===
  const computedDistanceKm = recomputeDistanceFromRestaurant(lat, lng)
  const distanceValidation = validateDistance(computedDistanceKm)
  if (!distanceValidation.ok) {
    return NextResponse.json(
      { error: distanceValidation.message, code: distanceValidation.reason },
      { status: 400 }
    )
  }

  const count = await db.address.count({ where: { customerId: customer.id } })
  const makeDefault = isDefault || count === 0

  if (makeDefault) {
    await db.address.updateMany({
      where: { customerId: customer.id },
      data: { isDefault: false },
    })
  }

  const addr = await db.address.create({
    data: {
      customerId: customer.id,
      label: label || (count === 0 ? 'Home' : 'Other'),
      houseFlat,
      streetArea,
      landmark,
      city,
      pincode,
      latitude: lat,
      longitude: lng,
      // SERVER-COMPUTED — never the client's value.
      distanceKm: Number(computedDistanceKm.toFixed(4)),
      isDefault: makeDefault,
    },
  })

  return NextResponse.json({ address: addr })
}
