/**
 * FINAL delivery-pricing system for Apna Baithak.
 *
 * SINGLE SOURCE OF TRUTH — imported by both the backend (checkout route,
 * receipt route, admin routes) and the frontend (cart view, checkout view).
 * This guarantees the customer sees the same charge the server will compute.
 *
 * ════════════════════════════════════════════════════════════════════════
 * PRICING RULES (replaces all previous logic)
 * ════════════════════════════════════════════════════════════════════════
 *
 * STEP 0 — SERVICE RADIUS
 *   Maximum delivery distance = 10km from restaurant.
 *   Addresses beyond 10km are non-serviceable and rejected at selection time
 *   (before reaching Step 1). This is enforced by isDistanceServiceable().
 *
 * STEP 1 — ORDER ELIGIBILITY (checked before allowing checkout)
 *   if subtotal < 200:
 *     → NOT eligible. Block. "Minimum order for delivery is ₹200."
 *   else if distance_km > 7 AND subtotal < 800:
 *     → NOT eligible. Block. "Orders beyond 7km require a minimum order of ₹800."
 *   else:
 *     → eligible, proceed to Step 2.
 *
 * STEP 2 — DELIVERY CHARGE (only runs if Step 1 passes)
 *   if subtotal >= 2000:
 *     delivery_charge = 0   // universal free-delivery override, any distance
 *   else:
 *     raw_charge = 20 + (distance_km - 1) * (70 - 20) / (10 - 1)
 *                = 20 + 5.5556 * (distance_km - 1)
 *     delivery_charge = round_to_nearest_5(raw_charge)
 *
 *   Gives ₹20 at 1km and ₹70 at 10km, scaling linearly. Rounded to nearest ₹5.
 *
 * ════════════════════════════════════════════════════════════════════════
 * REMOVED / DISCARDED (do NOT re-implement)
 * ════════════════════════════════════════════════════════════════════════
 * - The old "free delivery threshold scales with distance" logic
 *   (₹150-500 or ₹400-800 sliding thresholds) — DELETED.
 * - GST and handling fees — must remain removed from all bills.
 *
 * ════════════════════════════════════════════════════════════════════════
 * BILL BREAKDOWN
 * ════════════════════════════════════════════════════════════════════════
 * The bill only contains:
 *   - Item subtotal
 *   - Delivery charge (or FREE)
 *   - Final total = subtotal + delivery charge
 */

import { RESTAURANT } from './constants'

/** Minimum serviceable distance (km). Below this, the 1km rate applies. */
export const MIN_DISTANCE_KM = 1

/** Maximum serviceable distance (km). Beyond this, the address is rejected. */
export const MAX_DISTANCE_KM = 10

// === Step 1 thresholds ===

/** Minimum order subtotal for delivery (₹). Below this, delivery is blocked. */
export const MIN_ORDER_SUBTOTAL = 200

/** Distance (km) beyond which a higher minimum order applies. */
export const FAR_DISTANCE_THRESHOLD_KM = 7

/** Minimum order subtotal for deliveries beyond 7km (₹). */
export const FAR_MIN_ORDER_SUBTOTAL = 800

// === Step 2 parameters ===

/** Universal free-delivery override threshold (₹). At or above this, delivery is free. */
export const FREE_DELIVERY_OVERRIDE = 2000

/** Charge at 1km (₹). */
export const MIN_DELIVERY_CHARGE = 20

/** Charge at 10km (₹). */
export const MAX_DELIVERY_CHARGE = 70

/**
 * Round to the nearest multiple of 5.
 * e.g. 21 → 20, 22.5 → 25, 43 → 45, 48 → 50.
 */
export function roundToNearest5(value: number): number {
  return Math.round(value / 5) * 5
}

/**
 * Raw (unrounded) delivery charge for a given distance.
 * Formula: 20 + (distance_km - 1) * (70 - 20) / (10 - 1)
 *        = 20 + 5.5556 * (distance_km - 1)
 * Distance is clamped to [1, 10] before applying.
 *
 * Gives ₹20 at 1km and ₹70 at 10km.
 */
export function rawDeliveryCharge(distanceKm: number): number {
  const clamped = Math.max(MIN_DISTANCE_KM, Math.min(MAX_DISTANCE_KM, distanceKm))
  const slope = (MAX_DELIVERY_CHARGE - MIN_DELIVERY_CHARGE) / (MAX_DISTANCE_KM - MIN_DISTANCE_KM)
  return MIN_DELIVERY_CHARGE + (clamped - MIN_DISTANCE_KM) * slope
}

/**
 * Final delivery charge for a given distance, rounded to the nearest ₹5.
 * This is the value the customer pays (before the free-delivery override check).
 */
export function deliveryChargeForDistance(distanceKm: number): number {
  return roundToNearest5(rawDeliveryCharge(distanceKm))
}

/**
 * Whether the given distance is within the serviceable delivery radius (10km).
 * Used by the checkout route to reject non-serviceable addresses.
 */
export function isDistanceServiceable(distanceKm: number): boolean {
  return distanceKm <= RESTAURANT.deliveryRadiusKm
}

/**
 * Order eligibility result — the outcome of Step 1.
 *
 * - `eligible: true` → proceed to Step 2 (charge calculation)
 * - `eligible: false` → block checkout, show `reason` + `message` to the customer
 */
export type EligibilityResult =
  | { eligible: true }
  | {
      eligible: false
      /** Machine-readable reason code for analytics / debugging. */
      reason: 'BELOW_MIN_SUBTOTAL' | 'BELOW_FAR_MIN_SUBTOTAL' | 'OUTSIDE_SERVICE_RADIUS'
      /** Human-readable message to show the customer. */
      message: string
      /** Amount the customer needs to add to become eligible (₹). 0 if outside radius. */
      remaining: number
    }

/**
 * Check order eligibility (Step 1) — runs BEFORE charge calculation.
 *
 * Returns an EligibilityResult. If not eligible, the `message` field contains
 * the exact string to show the customer, and `remaining` is how much more they
 * need to add to their cart to become eligible (0 if outside the service radius).
 *
 * NOTE: This does NOT check the 10km service radius — that's enforced separately
 * at address-selection time via isDistanceServiceable(). If a non-serviceable
 * address somehow reaches here, it will be caught by the far-minimum check
 * (distance > 7 AND subtotal < 800), but the correct rejection point is
 * upstream. The checkout route also calls isDistanceServiceable() defensively.
 */
export function checkOrderEligibility(
  distanceKm: number,
  subtotal: number
): EligibilityResult {
  // Step 1a: universal minimum
  if (subtotal < MIN_ORDER_SUBTOTAL) {
    return {
      eligible: false,
      reason: 'BELOW_MIN_SUBTOTAL',
      message: `Minimum order for delivery is ₹${MIN_ORDER_SUBTOTAL}.`,
      remaining: MIN_ORDER_SUBTOTAL - subtotal,
    }
  }

  // Step 1b: far-distance minimum
  if (distanceKm > FAR_DISTANCE_THRESHOLD_KM && subtotal < FAR_MIN_ORDER_SUBTOTAL) {
    return {
      eligible: false,
      reason: 'BELOW_FAR_MIN_SUBTOTAL',
      message: `Orders beyond ${FAR_DISTANCE_THRESHOLD_KM}km require a minimum order of ₹${FAR_MIN_ORDER_SUBTOTAL}.`,
      remaining: FAR_MIN_ORDER_SUBTOTAL - subtotal,
    }
  }

  return { eligible: true }
}

/**
 * Full delivery-pricing calculation for an order.
 *
 * Runs Step 1 (eligibility) and, if eligible, Step 2 (charge calculation).
 * This is the function the backend checkout route calls — the result is what
 * gets stored on the order record.
 *
 * @param distanceKm  straight-line distance from restaurant to customer
 * @param subtotal    order subtotal (sum of item prices × quantities, in ₹)
 * @returns an object with:
 *   - eligible:       whether the order can be placed
 *   - reason:         machine-readable block reason (or null if eligible)
 *   - message:        human-readable block message (or null if eligible)
 *   - remaining:      ₹ needed to become eligible (0 if eligible or outside radius)
 *   - distanceKm:     the clamped distance used for calculation
 *   - rawCharge:      the unrounded charge (for display/debug)
 *   - charge:         the rounded charge (before free override)
 *   - isFree:         true if the ₹2000+ override applied
 *   - finalCharge:    0 if free, else the rounded charge (this is what's stored)
 */
export function computeDeliveryCharge(
  distanceKm: number,
  subtotal: number
): {
  eligible: boolean
  reason: 'BELOW_MIN_SUBTOTAL' | 'BELOW_FAR_MIN_SUBTOTAL' | 'OUTSIDE_SERVICE_RADIUS' | null
  message: string | null
  remaining: number
  distanceKm: number
  rawCharge: number
  charge: number
  isFree: boolean
  finalCharge: number
} {
  // Step 1: eligibility
  const eligibility = checkOrderEligibility(distanceKm, subtotal)
  if (!eligibility.eligible) {
    // Order is blocked — return zeros for charge fields
    return {
      eligible: false,
      reason: eligibility.reason,
      message: eligibility.message,
      remaining: eligibility.remaining,
      distanceKm,
      rawCharge: 0,
      charge: 0,
      isFree: false,
      finalCharge: 0,
    }
  }

  // Step 2: charge calculation
  const clamped = Math.max(MIN_DISTANCE_KM, Math.min(MAX_DISTANCE_KM, distanceKm))
  const raw = rawDeliveryCharge(clamped)
  const rounded = roundToNearest5(raw)

  // Universal free-delivery override
  const isFree = subtotal >= FREE_DELIVERY_OVERRIDE

  return {
    eligible: true,
    reason: null,
    message: null,
    remaining: 0,
    distanceKm: clamped,
    rawCharge: Math.round(raw * 100) / 100, // 2dp for display
    charge: rounded,
    isFree,
    finalCharge: isFree ? 0 : rounded,
  }
}

/**
 * How much more the customer needs to add to unlock free delivery (₹2000 override).
 * Returns 0 if they've already unlocked it. Returns null if the order is not
 * eligible (the cart should show the eligibility message instead).
 */
export function remainingForFreeDelivery(
  distanceKm: number,
  subtotal: number
): number | null {
  const eligibility = checkOrderEligibility(distanceKm, subtotal)
  if (!eligibility.eligible) return null
  return Math.max(0, FREE_DELIVERY_OVERRIDE - subtotal)
}
