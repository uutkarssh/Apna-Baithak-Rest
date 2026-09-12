import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/settings — PUBLIC endpoint that exposes ONLY the isAcceptingOrders
// boolean. Nothing else from the RestaurantConfig table is returned here.
//
// Used by:
//   - Customer homepage (to show a "we'll be back soon" banner)
//   - Customer checkout view (to disable the Place Order button)
//
// If the config row doesn't exist yet (fresh DB), defaults to true (accepting).
export async function GET() {
  try {
    const config = await db.restaurantConfig.findUnique({
      where: { id: 1 },
      select: { isAcceptingOrders: true }, // ONLY this field is exposed
    })
    return NextResponse.json({
      isAcceptingOrders: config?.isAcceptingOrders ?? true,
    })
  } catch (e) {
    // If the table doesn't exist or DB is unreachable, default to accepting
    // so we don't accidentally block all orders on a misconfigured deployment.
    console.error('[settings] failed to read restaurant_config:', e)
    return NextResponse.json({ isAcceptingOrders: true })
  }
}
