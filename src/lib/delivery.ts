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

/**
 * Minimum PLAUSIBLE distance (km) from the restaurant.
 *
 * Below this threshold, the saved lat/lng are almost certainly the restaurant's
 * own coordinates (the map pin was never moved from its initial state — see
 * the AB-2026-0005 incident). We reject such addresses BEFORE the 1km minimum
 * clamp in rawDeliveryCharge() masks the bug by clamping 0 → 1 → ₹20.
 *
 * 0.05 km = 50 m. A real customer address cannot be 50 m from the restaurant's
 * front door; if it genuinely is, the customer can pick the restaurant's
 * exact coordinates and the 50 m radius still rejects. That's acceptable —
 * the alternative (silent ₹20 undercharge) is far worse.
 */
export const MIN_VALID_DISTANCE_KM = 0.05

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
 * Whether the given distance is PLAUSIBLE — i.e. greater than MIN_VALID_DISTANCE_KM.
 *
 * This is the "is the pin still on the restaurant?" sanity check. A distance
 * of 0 (or anything below 50 m) means the customer never moved the pin off
 * the restaurant's coordinates, so we cannot trust the saved location.
 */
export function isPlausibleDistance(distanceKm: number): boolean {
  return distanceKm >= MIN_VALID_DISTANCE_KM
}

/**
 * Validate a distance against both the minimum-plausibility floor and the
 * service-radius ceiling. Used by the address save, address update, and
 * checkout routes to reject bad lat/lng before they reach the fee formula.
 *
 * Returns `{ ok: true, distanceKm }` if the distance is acceptable, or
 * `{ ok: false, reason, message }` describing why it was rejected.
 */
export type DistanceValidationResult =
  | { ok: true; distanceKm: number }
  | {
      ok: false
      reason: 'BELOW_MIN_VALID' | 'OUTSIDE_SERVICE_RADIUS'
      message: string
    }

export function validateDistance(distanceKm: number): DistanceValidationResult {
  // Plausibility floor — must run BEFORE the 1km clamp in rawDeliveryCharge
  // would mask a 0 / near-0 distance.
  if (!isPlausibleDistance(distanceKm)) {
    return {
      ok: false,
      reason: 'BELOW_MIN_VALID',
      message: `Saved location appears to be at the restaurant (distance ${distanceKm.toFixed(4)} km). Please re-pick your delivery location on the map.`,
    }
  }
  // Service-radius ceiling.
  if (!isDistanceServiceable(distanceKm)) {
    return {
      ok: false,
      reason: 'OUTSIDE_SERVICE_RADIUS',
      message: `Sorry, we only deliver within ${RESTAURANT.deliveryRadiusKm} km of the restaurant. Your address is ${distanceKm.toFixed(2)} km away.`,
    }
  }
  return { ok: true, distanceKm }
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
      reason:
        | 'BELOW_MIN_SUBTOTAL'
        | 'BELOW_FAR_MIN_SUBTOTAL'
        | 'OUTSIDE_SERVICE_RADIUS'
        | 'BELOW_MIN_VALID'
      /** Human-readable message to show the customer. */
      message: string
      /** Amount the customer needs to add to become eligible (₹). 0 if outside radius or below-min-valid. */
      remaining: number
    }

/**
 * Check order eligibility (Step 1) — runs BEFORE charge calculation.
 *
 * Returns an EligibilityResult. If not eligible, the `message` field contains
 * the exact string to show the customer, and `remaining` is how much more they
 * need to add to their cart to become eligible (0 if outside the service radius
 * or below the plausibility floor).
 *
 * Order of checks (the FIRST one that fails wins — the customer sees exactly
 * one message):
 *
 *   Step 0:  Plausibility floor — distance < 0.05 km (pin never moved off the
 *           restaurant). Rejects BEFORE the 1km clamp in rawDeliveryCharge
 *           would mask it.
 *
 *   Step 1a: Far-distance minimum (distance > 7km → ₹800 min).
 *   Step 1b: Universal minimum (0-7km → ₹200 min).
 *
 * NOTE: This function does NOT itself check the 10km service-radius ceiling
 * (use isDistanceServiceable() / validateDistance() for that). It only checks
 * the plausibility floor, because that is logically the very first thing that
 * should fail on a saved-at-restaurant address.
 */
export function checkOrderEligibility(
  distanceKm: number,
  subtotal: number
): EligibilityResult {
  // === Step 0: Plausibility floor ===
  // A distance of 0 (or anything below 50 m) means the pin was never moved off
  // the restaurant's coordinates. The 1km clamp in rawDeliveryCharge would
  // otherwise turn this into ₹20 and silently undercharge the customer. We
  // reject here so the customer is forced to re-pick their location.
  if (distanceKm < MIN_VALID_DISTANCE_KM) {
    return {
      eligible: false,
      reason: 'BELOW_MIN_VALID',
      message: `Saved location appears to be at the restaurant (distance ${distanceKm.toFixed(4)} km). Please re-pick your delivery location on the map.`,
      remaining: 0,
    }
  }

  // === DISTANCE-FIRST eligibility (fixes wrong-message-priority bug) ===
  // A customer beyond 7km must NEVER see the ₹200 message — from their very
  // first item in the cart, they should see the ₹800 message directly.
  // So we check the far-distance minimum FIRST, before the universal ₹200.

  // Step 1a: far-distance minimum (distance > 7km → ₹800 min)
  if (distanceKm > FAR_DISTANCE_THRESHOLD_KM && subtotal < FAR_MIN_ORDER_SUBTOTAL) {
    return {
      eligible: false,
      reason: 'BELOW_FAR_MIN_SUBTOTAL',
      message: `Orders beyond ${FAR_DISTANCE_THRESHOLD_KM}km require a minimum order of ₹${FAR_MIN_ORDER_SUBTOTAL}.`,
      remaining: FAR_MIN_ORDER_SUBTOTAL - subtotal,
    }
  }

  // Step 1b: universal minimum (0-7km → ₹200 min)
  // Only checked if the far-distance check didn't apply (i.e. distance <= 7km
  // OR distance > 7km but subtotal >= 800, in which case the order is already
  // eligible past the far check and this ₹200 check is trivially satisfied).
  if (subtotal < MIN_ORDER_SUBTOTAL) {
    return {
      eligible: false,
      reason: 'BELOW_MIN_SUBTOTAL',
      message: `Minimum order for delivery is ₹${MIN_ORDER_SUBTOTAL}.`,
      remaining: MIN_ORDER_SUBTOTAL - subtotal,
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
  reason:
    | 'BELOW_MIN_SUBTOTAL'
    | 'BELOW_FAR_MIN_SUBTOTAL'
    | 'OUTSIDE_SERVICE_RADIUS'
    | 'BELOW_MIN_VALID'
    | null
  message: string | null
  remaining: number
  distanceKm: number
  rawCharge: number
  charge: number
  isFree: boolean
  finalCharge: number
} {
  // Step 0: Plausibility floor (distance < 0.05 km → reject).
  // This runs BEFORE the 1km clamp in rawDeliveryCharge, which would otherwise
  // turn a 0 km distance into a ₹20 charge. We need the customer to be forced
  // back to the map screen to re-pick their location.
  if (distanceKm < MIN_VALID_DISTANCE_KM) {
    return {
      eligible: false,
      reason: 'BELOW_MIN_VALID',
      message: `Saved location appears to be at the restaurant (distance ${distanceKm.toFixed(4)} km). Please re-pick your delivery location on the map.`,
      remaining: 0,
      distanceKm,
      rawCharge: 0,
      charge: 0,
      isFree: false,
      finalCharge: 0,
    }
  }

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
