import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSupabaseForUser } from '@/lib/supabase-server'
import { ORDER_STATUSES } from '@/lib/constants'
import { orderNumberFromSeq } from '@/lib/format'
import { distanceFromRestaurant } from '@/lib/geo'
import { computeDeliveryCharge, isDistanceServiceable } from '@/lib/delivery'
import { notifyNewOrder } from '@/lib/telegram'

// POST /api/checkout — creates a new order from the current cart.
// Body: {
//   items: [{ itemId, quantity }],
//   addressId: string (must belong to caller),
//   paymentMode: 'COD' | 'UPI',
//   notes?: string,
// }
export async function POST(req: NextRequest) {
  // === STEP 0: Order-acceptance check ===
  // This runs BEFORE auth, BEFORE delivery eligibility, BEFORE everything.
  // If the admin has paused orders, reject immediately with a 503 "orders
  // paused" response. The frontend detects this and shows a calm
  // "We'll be back soon" message — not a jarring error.
  //
  // The check reads from the DB at the actual moment of order creation,
  // so toggling the setting in the admin panel takes effect instantly
  // for the next checkout attempt (no cache, no redeploy).
  try {
    const config = await db.restaurantConfig.findUnique({
      where: { id: 1 },
      select: { isAcceptingOrders: true },
    })
    // Default to accepting if the config row is missing (defensive —
    // shouldn't happen since the migration seeds it, but never block
    // orders on a missing config row).
    const isAccepting = config?.isAcceptingOrders ?? true
    if (!isAccepting) {
      return NextResponse.json(
        {
          error: "We're currently closed — we'll be back soon!",
          code: 'ORDERS_PAUSED',
        },
        { status: 503 }
      )
    }
  } catch (e) {
    // If the DB query itself fails, default to accepting (don't block
    // orders on an infrastructure error).
    console.error('[checkout] failed to check isAcceptingOrders:', e)
  }

  const supabase = await getSupabaseForUser(req)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Please sign in to place an order.' }, { status: 401 })
  }

  const customer = await db.customer.findUnique({ where: { supabaseUserId: user.id } })
  if (!customer) {
    return NextResponse.json({ error: 'Customer profile missing.' }, { status: 400 })
  }

  // A contact number is mandatory for delivery. Keep this check server-side
  // so checkout cannot be bypassed by calling the API directly.
  const phoneDigits = (customer.phone ?? '').replace(/\D/g, '')
  const normalizedPhone =
    phoneDigits.length === 12 && phoneDigits.startsWith('91')
      ? phoneDigits.slice(2)
      : phoneDigits.length === 11 && phoneDigits.startsWith('0')
        ? phoneDigits.slice(1)
        : phoneDigits
  if (!/^[6-9]\d{9}$/.test(normalizedPhone)) {
    return NextResponse.json(
      { error: 'Contact number is required before checkout. Please add your 10-digit mobile number in your profile.' },
      { status: 400 }
    )
  }

  const body = await req.json()
  const { items, addressId, paymentMode = 'COD', notes } = body ?? {}

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'Your cart is empty.' }, { status: 400 })
  }
  if (!addressId) {
    return NextResponse.json({ error: 'Please choose a delivery address.' }, { status: 400 })
  }
  if (!ORDER_STATUSES.includes('NEW')) {
    return NextResponse.json({ error: 'Bad status.' }, { status: 400 })
  }

  const address = await db.address.findUnique({ where: { id: addressId } })
  if (!address || address.customerId !== customer.id) {
    return NextResponse.json({ error: 'Address not found.' }, { status: 404 })
  }

  // Delivery-radius check (10km). Compute the straight-line distance from
  // the restaurant — prefer the value stored on the address (it was
  // computed at geocode time and may be more accurate than re-running
  // haversine on rounded lat/lng), fall back to a live calculation.
  const distKm =
    address.distanceKm ?? distanceFromRestaurant(address.latitude, address.longitude)
  if (!isDistanceServiceable(distKm)) {
    return NextResponse.json(
      {
        error: `Sorry, we only deliver within ${process.env.DELIVERY_RADIUS_KM ?? 10} km of the restaurant. Your address is ${distKm.toFixed(2)} km away.`,
      },
      { status: 400 }
    )
  }

  // Fetch live menu items (re-validate price/availability server-side).
  // Fetch ALL items in the cart (not just isAvailable=true) so we can
  // check for out-of-stock items and return a clear error naming the
  // specific item(s) that are unavailable.
  const itemIds = items.map((i: any) => i.itemId)
  const menuItems = await db.menuItem.findMany({
    where: { id: { in: itemIds } },
    include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } },
  })
  const byId = new Map(menuItems.map((m) => [m.id, m]))

  // === Out-of-stock check ===
  // If any item in the cart is currently marked isAvailable=false, reject
  // with a clear message naming the specific item(s). This catches the
  // edge case where an item was in stock when added to cart, but the admin
  // marked it out of stock before the customer checked out.
  const outOfStockItems = items
    .map((i: any) => {
      const m = byId.get(i.itemId)
      if (!m) return null
      if (!m.isAvailable) return m.name
      return null
    })
    .filter((x: string | null): x is string => x !== null)

  if (outOfStockItems.length > 0) {
    const itemNames = outOfStockItems.join(', ')
    return NextResponse.json(
      {
        error: `The following item(s) are currently out of stock: ${itemNames}. Please remove them from your cart to proceed.`,
        code: 'ITEMS_OUT_OF_STOCK',
        outOfStockItems,
      },
      { status: 400 }
    )
  }

  let itemTotal = 0
  const orderItemsData = items.map((i: any) => {
    const m = byId.get(i.itemId)
    if (!m) return null
    const qty = Math.max(1, Math.min(50, Number(i.quantity) || 1))
    itemTotal += m.price * qty
    return {
      itemId: m.id,
      itemName: m.name,
      itemPrice: m.price,
      quantity: qty,
      imageUrl: m.images[0]?.url ?? null,
    }
  }).filter((x): x is NonNullable<typeof x> => x !== null)

  if (orderItemsData.length === 0) {
    return NextResponse.json({ error: 'No valid items in cart.' }, { status: 400 })
  }

  // === FINAL delivery-pricing system (replaces all previous logic) ===
  // Single source of truth: src/lib/delivery.ts. The frontend runs the same
  // computation for live preview, but the SERVER value is what gets stored —
  // a malicious client cannot bypass eligibility, the free-delivery override,
  // or send a custom charge.
  //
  // Step 0: service radius (already checked above — non-serviceable addresses
  //         are rejected before reaching here)
  // Step 1: eligibility (₹200 min, ₹800 min for 7km+) — if not eligible,
  //         return 400 with the block message. Never reach order.create().
  // Step 2: charge calculation (₹20-₹70 scaled by distance, rounded to ₹5;
  //         ₹0 if subtotal >= ₹2000)
  //
  // Bill breakdown:
  //   itemTotal   = sum(item.price * qty)
  //   deliveryFee = computeDeliveryCharge(distKm, itemTotal).finalCharge
  //                 (0 if free-delivery override applies, else rounded to ₹5)
  //   handlingFee   = 0  (removed — kept in schema for historical orders)
  //   gstAndCharges = 0  (removed — kept in schema for historical orders)
  //   totalAmount = itemTotal + deliveryFee
  const deliveryCalc = computeDeliveryCharge(distKm, itemTotal)

  // Step 1 enforcement — hard-block ineligible orders server-side
  if (!deliveryCalc.eligible) {
    return NextResponse.json(
      { error: deliveryCalc.message },
      { status: 400 }
    )
  }

  const deliveryFee = deliveryCalc.finalCharge
  const handlingFee = 0
  const gstAndCharges = 0
  const totalAmount = itemTotal + deliveryFee

  // human-friendly order number: AB-YYYY-000N
  // IMPORTANT: use MAX(orderNumber) + 1, NOT COUNT(*) + 1. Count-based
  // generation breaks when orders are deleted — count returns N, but the
  // highest existing number may be N+k, so count+1 collides with an
  // existing order's unique constraint, the create() throws, the route
  // returns 500 with HTML, and the customer sees "Failed to place order".
  // See: scripts/diagnose-checkout.ts for the diagnostic that proved this.
  const year = new Date().getFullYear()
  const prefix = `AB-${year}-`
  const lastOrder = await db.order.findFirst({
    where: { orderNumber: { startsWith: prefix } },
    orderBy: { orderNumber: 'desc' },
    select: { orderNumber: true },
  })
  const lastSeq = lastOrder
    ? (parseInt(lastOrder.orderNumber.slice(prefix.length), 10) || 0)
    : 0
  const orderNumber = orderNumberFromSeq(lastSeq + 1)

  const addressLine = [
    address.houseFlat,
    address.streetArea,
    address.landmark,
    `${address.city} - ${address.pincode}`,
  ]
    .filter(Boolean)
    .join(', ')

  // Create the order. Retry up to 5 times on unique-constraint violation
  // (P2002) — handles the rare race condition where two customers check
  // out at the same millisecond and both compute the same orderNumber.
  // Each retry bumps the sequence by 1 and tries again.
  let order
  let attempts = 0
  while (attempts < 5) {
    const candidateNumber = attempts === 0
      ? orderNumber
      : orderNumberFromSeq(lastSeq + 1 + attempts)
    try {
      order = await db.order.create({
        data: {
          orderNumber: candidateNumber,
          customerId: customer.id,
          addressId: address.id,
          customerName: customer.name ?? customer.email.split('@')[0],
          customerPhone: customer.phone,
          addressLine,
          status: 'NEW',
          paymentMode,
          paymentStatus: paymentMode === 'UPI' ? 'PENDING' : 'PENDING',
          itemTotal,
          handlingFee,
          deliveryFee,
          gstAndCharges,
          totalAmount,
          distanceKm: Number(distKm.toFixed(2)),
          notes: notes || null,
          items: { create: orderItemsData },
          statusHistory: {
            create: { status: 'NEW', note: 'Order placed by customer' },
          },
        },
        include: { items: true },
      })
      break
    } catch (e: any) {
      // P2002 = Prisma unique constraint violation
      if (e?.code === 'P2002' && attempts < 4) {
        attempts++
        continue
      }
      throw e
    }
  }
  if (!order) {
    return NextResponse.json(
      { error: 'Could not generate a unique order number after multiple attempts. Please try again.' },
      { status: 500 },
    )
  }

  // Fire Telegram new-order notification (non-blocking — don't fail the
  // checkout if Telegram is down)
  notifyNewOrder(order.id).catch((e) =>
    console.error('[checkout] telegram notify error:', e)
  )

  return NextResponse.json({ order })
}
