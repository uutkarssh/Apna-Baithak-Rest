/**
 * Find all addresses in the Turso DB that are "bad" — i.e. the customer's
 * saved lat/lng match the restaurant's (the AB-2026-0005 root cause), or the
 * stored distanceKm is below the plausibility floor, or NULL.
 *
 * These are existing rows that pre-date the GPS-required fix and would
 * otherwise let a returning customer silently re-use them at checkout
 * (now blocked client-side by the bad-address detection in checkout-view /
 * cart-view, and rejected server-side at /api/checkout).
 *
 * Usage:
 *   npx tsx scripts/find-bad-addresses.ts
 *   (or: bunx tsx scripts/find-bad-addresses.ts)
 *
 * Loads .env from the current working directory.
 */
import * as dotenv from 'dotenv'
dotenv.config()

import { createClient } from '@libsql/client'

const url = process.env.TURSO_DATABASE_URL
const token = process.env.TURSO_AUTH_TOKEN

if (!url) {
  console.error('TURSO_DATABASE_URL not set — copy .env.example to .env and fill it in first.')
  process.exit(1)
}

const client = createClient({ url, authToken: token })

const RESTAURANT_LAT = Number(process.env.RESTAURANT_LAT ?? 25.337698)
const RESTAURANT_LNG = Number(process.env.RESTAURANT_LNG ?? 82.351485)
const MIN_VALID_DISTANCE_KM = 0.05

async function main() {
  console.log('=============================================================')
  console.log('Finding bad saved addresses in the addresses table...')
  console.log(`Restaurant coords:  (${RESTAURANT_LAT}, ${RESTAURANT_LNG})`)
  console.log(`Plausibility floor: ${MIN_VALID_DISTANCE_KM} km (50 m)`)
  console.log('=============================================================\n')

  // A row is "bad" if any of the following are true:
  //   1. latitude  == restaurant_lat AND longitude == restaurant_lng
  //      (pin never moved off the restaurant)
  //   2. distanceKm < 0.05  (sub-plausibility floor; includes 0)
  //   3. distanceKm IS NULL (older schema migration left it NULL)
  //   4. latitude / longitude are NaN or NULL (defensive)
  //
  // We use a parameterized query so the SQL is portable and safe.
  const res = await client.execute({
    sql: `SELECT a.id, a.customerId, a.label, a.houseFlat, a.streetArea,
                 a.city, a.pincode, a.latitude, a.longitude,
                 a.distanceKm, a.isDefault, a.createdAt, a.updatedAt,
                 c.email AS customer_email,
                 c.name  AS customer_name
          FROM addresses a
          LEFT JOIN customers c ON c.id = a.customerId
          WHERE (a.latitude = ? AND a.longitude = ?)
             OR (a.distanceKm IS NOT NULL AND a.distanceKm < ?)
             OR (a.distanceKm IS NULL)
             OR (a.latitude IS NULL OR a.longitude IS NULL)
          ORDER BY a.createdAt DESC`,
    args: [RESTAURANT_LAT, RESTAURANT_LNG, MIN_VALID_DISTANCE_KM],
  })

  if (res.rows.length === 0) {
    console.log('✓ No bad addresses found. All saved addresses have plausible coordinates.')
    return
  }

  console.log(`⚠ Found ${res.rows.length} bad address(es):\n`)

  for (const r of res.rows) {
    const lat = r.latitude as number | null
    const lng = r.longitude as number | null
    const dist = r.distanceKm as number | null
    const isRestaurant = lat === RESTAURANT_LAT && lng === RESTAURANT_LNG
    const isBelowFloor = dist != null && dist < MIN_VALID_DISTANCE_KM
    const isNull = dist == null || lat == null || lng == null

    const reasons: string[] = []
    if (isRestaurant) reasons.push('lat/lng == restaurant (pin never moved)')
    if (isBelowFloor) reasons.push(`distanceKm=${dist} (< ${MIN_VALID_DISTANCE_KM})`)
    if (isNull) reasons.push('distanceKm or lat/lng is NULL')

    console.log(`--- ${r.id} ---`)
    console.log(`  customer:     ${r.customer_email ?? 'unknown'} (${r.customer_name ?? 'no name'})`)
    console.log(`  label:        ${r.label ?? 'no label'}`)
    console.log(`  address:      ${r.houseFlat}, ${r.streetArea}, ${r.city} - ${r.pincode}`)
    console.log(`  lat/lng:      (${lat}, ${lng})`)
    console.log(`  distanceKm:   ${dist === null ? 'NULL' : dist}`)
    console.log(`  isDefault:    ${r.isDefault}`)
    console.log(`  createdAt:    ${r.createdAt}`)
    console.log(`  bad reasons:  ${reasons.join(' | ')}`)
    console.log(`  ${isRestaurant || isBelowFloor ? '-> Customer must re-pick this address before placing an order.' : ''}`)
    console.log()
  }

  // Optional: list recent orders against these bad addresses, so we can see
  // historical impact (e.g. AB-2026-0005).
  const badAddressIds = res.rows.map((r) => String(r.id))
  if (badAddressIds.length > 0) {
    console.log('=== Recent orders using these bad addresses ===\n')
    // libsql doesn't easily bind an array — build placeholders.
    const placeholders = badAddressIds.map(() => '?').join(',')
    const ordersRes = await client.execute({
      sql: `SELECT o.id, o.orderNumber, o.customerName, o.addressId,
                   o.itemTotal, o.deliveryFee, o.totalAmount,
                   o.distanceKm AS order_distanceKm,
                   o.status, o.createdAt
            FROM orders o
            WHERE o.addressId IN (${placeholders})
            ORDER BY o.createdAt DESC
            LIMIT 50`,
      args: badAddressIds,
    })
    if (ordersRes.rows.length === 0) {
      console.log('  No orders have used these bad addresses.')
    } else {
      for (const o of ordersRes.rows) {
        console.log(`  ${o.orderNumber} | ${o.customerName} | itemTotal=₹${o.itemTotal} | deliveryFee=₹${o.deliveryFee} | total=₹${o.totalAmount} | distanceKm=${o.order_distanceKm} | ${o.status} | ${o.createdAt}`)
      }
    }
  }
}

main().catch((e) => {
  console.error('Error:', e)
  process.exit(1)
})
