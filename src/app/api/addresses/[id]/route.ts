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

// PATCH /api/addresses/[id] — update an address (e.g. set as default, or edit fields)
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
      latitude: body.latitude ?? addr.latitude,
      longitude: body.longitude ?? addr.longitude,
      distanceKm: body.distanceKm ?? addr.distanceKm,
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
