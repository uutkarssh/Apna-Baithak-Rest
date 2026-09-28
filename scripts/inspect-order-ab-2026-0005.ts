/**
 * Inspect Turso DB for order AB-2026-0005 — incident: only ₹20 delivery charged
 * for a customer ~5.4 km away; saved customer lat/lng match the restaurant's.
 *
 * Usage (from project root that contains a real .env):
 *   npx tsx scripts/inspect-order-ab-2026-0005.ts
 * (or: bunx tsx scripts/inspect-order-ab-2026-0005.ts)
 *
 * Loads .env from the current working directory (just like the Next.js app does).
 * Prints the raw stored row for the order, its linked address, and recomputes
 * the expected delivery fee using the same formula the server uses
 * (src/lib/delivery.ts).
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
const DELIVERY_RADIUS_KM = Number(process.env.DELIVERY_RADIUS_KM ?? 10)
const FREE_DELIVERY_OVERRIDE = 2000
const MIN_DISTANCE_KM = 1
const MAX_DISTANCE_KM = 10
const MIN_DELIVERY_CHARGE = 20
const MAX_DELIVERY_CHARGE = 70

function roundToNearest5(v: number) {
  return Math.round(v / 5) * 5
}
function rawDeliveryCharge(distanceKm: number) {
  const clamped = Math.max(MIN_DISTANCE_KM, Math.min(MAX_DISTANCE_KM, distanceKm))
  const slope = (MAX_DELIVERY_CHARGE - MIN_DELIVERY_CHARGE) / (MAX_DISTANCE_KM - MIN_DISTANCE_KM)
  return MIN_DELIVERY_CHARGE + (clamped - MIN_DISTANCE_KM) * slope
}
function deliveryChargeForDistance(distanceKm: number) {
  return roundToNearest5(rawDeliveryCharge(distanceKm))
}
function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const lat1 = toRad(aLat)
  const lat2 = toRad(bLat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

async function main() {
  const ORDER_NUMBER = 'AB-2026-0005'

  console.log('=========================================================')
  console.log(`Order: ${ORDER_NUMBER}`)
  console.log(`Restaurant coords: (${RESTAURANT_LAT}, ${RESTAURANT_LNG})`)
  console.log(`Delivery radius: ${DELIVERY_RADIUS_KM} km`)
  console.log('=========================================================\n')

  // Pull the order row + its linked address row.
  const orderRes = await client.execute({
    sql: `SELECT o.id, o.orderNumber, o.customerName, o.customerPhone,
                 o.addressLine, o.addressId,
                 o.itemTotal, o.deliveryFee, o.gstAndCharges, o.handlingFee,
                 o.totalAmount, o.distanceKm AS order_distanceKm,
                 o.paymentMode, o.paymentStatus, o.status,
                 o.createdAt
          FROM orders o
          WHERE o.orderNumber = ?`,
    args: [ORDER_NUMBER],
  })

  if (orderRes.rows.length === 0) {
    console.error(`Order ${ORDER_NUMBER} not found in the orders table.`)
    process.exit(1)
  }

  const o = orderRes.rows[0]
  console.log('--- Raw order row (as stored) ---')
  console.log(JSON.stringify(o, null, 2))
  console.log()

  const addrRes = await client.execute({
    sql: `SELECT id, customerId, label, houseFlat, streetArea, landmark,
                 city, pincode, latitude, longitude, distanceKm,
                 isDefault, createdAt, updatedAt
          FROM addresses
          WHERE id = ?`,
    args: [String(o.addressId)],
  })

  if (addrRes.rows.length === 0) {
    console.error(`Address row ${o.addressId} (linked to ${ORDER_NUMBER}) not found.`)
    process.exit(1)
  }

  const a = addrRes.rows[0]
  console.log('--- Raw address row (as stored) ---')
  console.log(JSON.stringify(a, null, 2))
  console.log()

  // Recompute distances.
  const savedLat = Number(a.latitude)
  const savedLng = Number(a.longitude)
  const savedDistance = a.distanceKm == null ? null : Number(a.distanceKm)
  const liveDistanceFromSavedLatLng = haversineKm(savedLat, savedLng, RESTAURANT_LAT, RESTAURANT_LNG)

  console.log('--- Distance recomputation ---')
  console.log(`Saved lat/lng: (${savedLat}, ${savedLng})`)
  console.log(`Saved distanceKm field: ${savedDistance == null ? 'NULL' : savedDistance}`)
  console.log(`Haversine from saved lat/lng → restaurant: ${liveDistanceFromSavedLatLng.toFixed(4)} km`)
  console.log(`Is saved lat/lng exactly the restaurant's? ${
    savedLat === RESTAURANT_LAT && savedLng === RESTAURANT_LNG ? 'YES (exact match)' : 'no'
  }`)
  console.log()

  // Determine which distance the backend actually used.
  const distKmUsed = savedDistance ?? liveDistanceFromSavedLatLng
  console.log(`Backend's selected distance (address.distanceKm ?? live): ${distKmUsed.toFixed(4)} km`)
  console.log()

  // Recompute the fee.
  const itemTotal = Number(o.itemTotal)
  const isFree = itemTotal >= FREE_DELIVERY_OVERRIDE
  const charged = Number(o.deliveryFee)
  const expectedForStored = isFree ? 0 : deliveryChargeForDistance(distKmUsed)
  console.log('--- Fee recomputation (using stored values) ---')
  console.log(`itemTotal (subtotal): ₹${itemTotal}`)
  console.log(`isFree (subtotal >= ₹${FREE_DELIVERY_OVERRIDE}): ${isFree}`)
  console.log(`deliveryChargeForDistance(${distKmUsed.toFixed(4)}) = ₹${expectedForStored}`)
  console.log(`Actually charged on the order: ₹${charged}`)
  console.log(`Match? ${charged === expectedForStored ? 'YES' : 'NO  (delta = ₹' + (expectedForStored - charged) + ')'}`)
  console.log()

  // What the fee WOULD be if the true 5.4 km distance had been stored.
  const TRUE_DISTANCE = 5.4
  const correctFee = isFree ? 0 : deliveryChargeForDistance(TRUE_DISTANCE)
  console.log('--- Hypothetical: with true 5.4 km distance ---')
  console.log(`deliveryChargeForDistance(${TRUE_DISTANCE}) = ₹${correctFee}`)
  console.log(`raw (unrounded) at ${TRUE_DISTANCE} km = ${rawDeliveryCharge(TRUE_DISTANCE).toFixed(4)}`)
  console.log(`Undercharge vs true distance: ₹${correctFee - charged}`)
  console.log()

  console.log('--- Diagnostic conclusion ---')
  if (savedLat === RESTAURANT_LAT && savedLng === RESTAURANT_LNG) {
    console.log('Saved lat/lng EXACTLY match the restaurant. This is a strong indicator')
    console.log('that the pin was never moved off its initial state (see')
    console.log('src/components/apna/views/location-view-inner.tsx:105 — useState initial')
    console.log('value is [RESTAURANT.lat, RESTAURANT.lng]). The geolocation')
    console.log('auto-locate on mount must have failed silently (line 161-163).')
  } else if (savedDistance === 0) {
    console.log('Saved distance is 0 but lat/lng do not exactly match the restaurant.')
    console.log('Investigate further — could be the field was written as 0 by the client')
    console.log('regardless of the actual pin position.')
  } else {
    console.log('Stored lat/lng/distance do not point at the restaurant. The bug may')
    console.log('be elsewhere — re-examine the address row above.')
  }
}

main().catch((e) => {
  console.error('Error:', e)
  process.exit(1)
})
