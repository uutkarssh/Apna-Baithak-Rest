import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSupabaseForUser } from '@/lib/supabase-server'

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
    distanceKm,
    isDefault,
  } = body ?? {}

  if (!houseFlat || !streetArea || !city || !pincode || latitude == null || longitude == null) {
    return NextResponse.json(
      { error: 'All address fields are required.' },
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
      latitude,
      longitude,
      distanceKm,
      isDefault: makeDefault,
    },
  })

  return NextResponse.json({ address: addr })
}
