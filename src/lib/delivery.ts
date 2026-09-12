/**
 * Dynamic delivery-charge calculation for Apna Baithak.
 *
 * SINGLE SOURCE OF TRUTH — imported by both the backend (checkout route,
 * receipt route, admin routes) and the frontend (cart view, checkout view).
 * This guarantees the customer sees the same charge the server will compute.
 *
 * === Formula (continuous, not slabs) ===
 *
 *   raw_charge = 10 + (distance_km - 1) * (50 / 9)
 *
 * Gives ₹10 at 1km and ₹60 at 10km, scaling linearly. The result is rounded
 * to the nearest multiple of ₹5 (e.g. 21 → 20, 43 → 45, 48 → 50).
 *
 * === Free-delivery threshold (also continuous) ===
 *
 *   free_threshold = 150 + (distance_km - 1) * (350 / 9)
 *
 * Gives ₹150 at 1km and ₹500 at 10km. If the order subtotal (itemTotal only —
 * no fees) is >= this threshold, delivery is free.
 *
 * === Clamping ===
 *
 * distance_km is clamped to [1, 10] before applying the formula:
 *   - anything under 1km is charged the 1km minimum (₹10)
 *   - anything above 10km is rejected as non-serviceable upstream — it should
 *     never reach this function, but if it does, it gets the 10km max (₹60).
 *
 * === Bill breakdown (after this change) ===
 *
 * The bill only contains:
 *   - Item subtotal
 *   - Delivery charge (or FREE)
 *   - Final total = subtotal + delivery charge
 *
 * GST and handling fees have been removed entirely. The schema fields
 * `handlingFee` and `gstAndCharges` are kept for backwards compatibility
 * with historical orders, but are always written as 0 on new orders and
 * never shown in the UI or receipts.
 */

import { RESTAURANT } from './constants'

/** Minimum chargeable distance (km). Below this, the 1km rate applies. */
export const MIN_DISTANCE_KM = 1

/** Maximum serviceable distance (km). Beyond this, the order is rejected. */
export const MAX_DISTANCE_KM = 10

/** Charge at 1km (₹). */
export const MIN_DELIVERY_CHARGE = 10

/** Charge at 10km (₹). */
export const MAX_DELIVERY_CHARGE = 60

/** Free-delivery threshold at 1km (₹). */
export const MIN_FREE_THRESHOLD = 150

/** Free-delivery threshold at 10km (₹). */
export const MAX_FREE_THRESHOLD = 500

/**
 * Linear interpolation between (d=1, v=min) and (d=10, v=max).
 * Used for both the charge and the free-threshold curves since they share
 * the same shape (just different endpoints).
 */
function lerp(distanceKm: number, minVal: number, maxVal: number): number {
  const clamped = Math.max(MIN_DISTANCE_KM, Math.min(MAX_DISTANCE_KM, distanceKm))
  const t = (clamped - MIN_DISTANCE_KM) / (MAX_DISTANCE_KM - MIN_DISTANCE_KM) // 0..1
  return minVal + t * (maxVal - minVal)
}

/**
 * Round to the nearest multiple of 5.
 * e.g. 21 → 20, 22.5 → 25, 43 → 45, 48 → 50.
 */
export function roundToNearest5(value: number): number {
  return Math.round(value / 5) * 5
}

/**
 * Raw (unrounded) delivery charge for a given distance.
 * Formula: 10 + (distance_km - 1) * (50 / 9)
 * Clamped to [1, 10] km before applying.
 */
export function rawDeliveryCharge(distanceKm: number): number {
  return lerp(distanceKm, MIN_DELIVERY_CHARGE, MAX_DELIVERY_CHARGE)
}

/**
 * Final delivery charge for a given distance, rounded to the nearest ₹5.
 * This is the value the customer pays (before the free-delivery check).
 */
export function deliveryChargeForDistance(distanceKm: number): number {
  return roundToNearest5(rawDeliveryCharge(distanceKm))
}

/**
 * Free-delivery threshold for a given distance.
 * Formula: 150 + (distance_km - 1) * (350 / 9)
 * If the order subtotal >= this threshold, delivery is free.
 */
export function freeDeliveryThreshold(distanceKm: number): number {
  return lerp(distanceKm, MIN_FREE_THRESHOLD, MAX_FREE_THRESHOLD)
}

/**
 * Full delivery-charge calculation for an order.
 *
 * @param distanceKm  straight-line distance from restaurant to customer
 * @param itemTotal   order subtotal (sum of item prices × quantities, in ₹)
 * @returns an object with:
 *   - distanceKm: the clamped distance used for calculation
 *   - rawCharge:  the unrounded charge (for display/debug)
 *   - charge:     the rounded charge the customer pays
 *   - freeThreshold: the subtotal required for free delivery at this distance
 *   - isFree:     true if itemTotal >= freeThreshold
 *   - finalCharge: 0 if free, else the rounded charge
 */
export function computeDeliveryCharge(
  distanceKm: number,
  itemTotal: number
): {
  distanceKm: number
  rawCharge: number
  charge: number
  freeThreshold: number
  isFree: boolean
  finalCharge: number
} {
  const clamped = Math.max(MIN_DISTANCE_KM, Math.min(MAX_DISTANCE_KM, distanceKm))
  const raw = rawDeliveryCharge(clamped)
  const rounded = roundToNearest5(raw)
  const threshold = freeDeliveryThreshold(clamped)
  const isFree = itemTotal >= threshold
  return {
    distanceKm: clamped,
    rawCharge: Math.round(raw * 100) / 100, // 2dp for display
    charge: rounded,
    freeThreshold: Math.round(threshold),
    isFree,
    finalCharge: isFree ? 0 : rounded,
  }
}

/**
 * Whether the given distance is within the serviceable delivery radius.
 * Used by the checkout route to reject non-serviceable addresses.
 *
 * NOTE: this takes a DISTANCE (km), not lat/lng. The geo.ts file has a
 * separate isWithinDeliveryRadius(lat, lng) helper that wraps this for
 * the location-picker UI — don't confuse the two.
 */
export function isDistanceServiceable(distanceKm: number): boolean {
  return distanceKm <= RESTAURANT.deliveryRadiusKm
}

/**
 * How much more the customer needs to add to unlock free delivery.
 * Returns 0 if they've already unlocked it.
 */
export function remainingForFreeDelivery(
  distanceKm: number,
  itemTotal: number
): number {
  const threshold = freeDeliveryThreshold(distanceKm)
  return Math.max(0, Math.ceil(threshold - itemTotal))
}
