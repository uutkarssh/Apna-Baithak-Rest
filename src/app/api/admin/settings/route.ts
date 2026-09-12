import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdminAuthorized } from '@/lib/admin-guard'

// GET /api/admin/settings — returns the full restaurant config (admin only).
// The public /api/settings route only exposes isAcceptingOrders; this admin
// route returns everything (for future fields that aren't public).
export async function GET(req: NextRequest) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    let config = await db.restaurantConfig.findUnique({ where: { id: 1 } })
    if (!config) {
      // Auto-create the singleton row if it's missing (shouldn't happen
      // since the migration script seeds it, but be defensive).
      config = await db.restaurantConfig.create({ data: { id: 1 } })
    }
    return NextResponse.json({ config })
  } catch (e) {
    console.error('[admin/settings] GET error:', e)
    return NextResponse.json(
      { error: 'Failed to read restaurant config' },
      { status: 500 }
    )
  }
}

// PATCH /api/admin/settings — toggles isAcceptingOrders.
// Body: { isAcceptingOrders: boolean }
//
// This is the ONLY way to toggle the setting (no env var, no redeploy).
// The change takes effect immediately — the next /api/checkout request
// will read the updated value from the DB.
export async function PATCH(req: NextRequest) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const body = await req.json()
    const isAcceptingOrders = Boolean(body?.isAcceptingOrders)

    // upsert in case the singleton row was somehow deleted
    const config = await db.restaurantConfig.upsert({
      where: { id: 1 },
      update: { isAcceptingOrders },
      create: { id: 1, isAcceptingOrders },
    })

    return NextResponse.json({ config })
  } catch (e) {
    console.error('[admin/settings] PATCH error:', e)
    return NextResponse.json(
      { error: 'Failed to update restaurant config' },
      { status: 500 }
    )
  }
}
