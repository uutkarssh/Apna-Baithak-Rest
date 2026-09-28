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

// PATCH /api/addresses/[id] — update an address (e.g. set as default, or edit fields)
//
// SECURITY: If the client supplies new lat/lng, recompute distance server-side
// (never trust the client's `distanceKm`) and validate plausibility before
// persisting. If the client doesn't supply lat/lng, leave the existing stored
// values untouched (the customer is only editing text fields like house/street).
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const customer = await getCustomer(req)
  if (!customer) {
    return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })
  }
  const { id } = await ctx.params
  const addr = await db.address.findUnique({ where: { id } })
  if (!addr || addr.customerId !== customer.id) {
    return NextResponse.json({ error: 'Address not found' }, { status: 404 })
  }
  const body = await req.json()

  // === Resolve final lat/lng (body or existing) ===
  // If the client is updating coordinates, parse + validate them. Otherwise
  // keep the existing stored coordinates.
  let lat: number = addr.latitude
  let lng: number = addr.longitude
  let coordsChanged = false
  if (body.latitude != null || body.longitude != null) {
    // Both must be supplied together when updating coords.
    if (body.latitude == null || body.longitude == null) {
      return NextResponse.json(
        { error: 'Both latitude and longitude must be supplied together.', code: 'INVALID_COORDS' },
        { status: 400 }
      )
    }
    const parsedLat = Number(body.latitude)
    const parsedLng = Number(body.longitude)
    if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) {
      return NextResponse.json(
        { error: 'Invalid coordinates. Please re-pick your location on the map.', code: 'INVALID_COORDS' },
        { status: 400 }
      )
    }
    lat = parsedLat
    lng = parsedLng
    coordsChanged = true

    // Plausibility check on the new coordinates.
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
  }

  // === Recompute distance server-side if coords changed ===
  // Never persist the client's `distanceKm` — always recompute.
  let distanceKm: number = addr.distanceKm ?? 0
  if (coordsChanged) {
    const computed = recomputeDistanceFromRestaurant(lat, lng)
    const validation = validateDistance(computed)
    if (!validation.ok) {
      return NextResponse.json(
        { error: validation.message, code: validation.reason },
        { status: 400 }
      )
    }
    distanceKm = Number(computed.toFixed(4))
  }

  if (body.isDefault) {
    await db.address.updateMany({
      where: { customerId: customer.id },
      data: { isDefault: false },
    })
  }

  const updated = await db.address.update({
    where: { id },
    data: {
      label: body.label ?? addr.label,
      houseFlat: body.houseFlat ?? addr.houseFlat,
      streetArea: body.streetArea ?? addr.streetArea,
      landmark: body.landmark ?? addr.landmark,
      city: body.city ?? addr.city,
      pincode: body.pincode ?? addr.pincode,
      latitude: lat,
      longitude: lng,
      // SERVER-COMPUTED — never the client's value.
      distanceKm,
      isDefault: body.isDefault ?? addr.isDefault,
    },
  })
  return NextResponse.json({ address: updated })
}

// DELETE /api/addresses/[id]
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const customer = await getCustomer(req)
  if (!customer) {
    return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })
  }
  const { id } = await ctx.params
  const addr = await db.address.findUnique({ where: { id } })
  if (!addr || addr.customerId !== customer.id) {
    return NextResponse.json({ error: 'Address not found' }, { status: 404 })
  }
  await db.address.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
