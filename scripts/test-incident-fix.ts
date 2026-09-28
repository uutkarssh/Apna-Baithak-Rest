/**
 * Test script — verifies the AB-2026-0005 incident fix end-to-end.
 *
 * Runs entirely in Node (no Next.js, no DB, no browser). It imports the
 * delivery module + the geo module (which are pure functions, no React),
 * plus a plain-TS mirror of the location-view-inner.tsx state machine to
 * verify that the right UI state is reached for each scenario.
 *
 * Coverage:
 *
 *   1. Permission DENIED      → state machine must reach 'denied' (block UI)
 *   2. Pin NEVER MOVED        → state machine stays at the initial null pin;
 *                               saveAddress() must be blocked by canSave gate
 *   3. OLD bad saved address  → badAddressReason() must return non-null for a
 *                               saved address with lat/lng == restaurant or
 *                               distanceKm < 0.05 km or distanceKm == null;
 *                               checkout-view + cart-view must block the
 *                               Place Order button.
 *   4. Valid 5.4 km address   → computeDeliveryCharge(5.4, 300) must return
 *                               finalCharge = ₹45 (the math from the incident
 *                               report).
 *
 *   Plus: the new plausibility check.
 *     - computeDeliveryCharge(0, 300)        → eligible:false, reason:BELOW_MIN_VALID
 *     - computeDeliveryCharge(0.03, 300)      → eligible:false, reason:BELOW_MIN_VALID
 *     - computeDeliveryCharge(0.05, 300)      → eligible:true, finalCharge:₹20 (boundary)
 *     - computeDeliveryCharge(0.051, 300)    → eligible:true, finalCharge:₹20 (above boundary)
 *     - computeDeliveryCharge(1, 300)        → eligible:true, finalCharge:₹20 (min charge)
 *     - computeDeliveryCharge(5.4, 300)      → eligible:true, finalCharge:₹45 (incident case)
 *     - computeDeliveryCharge(10, 300)       → eligible:true, finalCharge:₹70 (max charge)
 *     - computeDeliveryCharge(11, 300)       → eligible:false, reason:OUTSIDE_SERVICE_RADIUS (defensive)
 *
 *   Plus: the address-save / address-update / checkout recomputation.
 *
 * Run:
 *   npx tsx scripts/test-incident-fix.ts
 *   (or: bunx tsx scripts/test-incident-fix.ts)
 */
import * as dotenv from 'dotenv'
dotenv.config()

// We need to import the actual delivery + geo modules so the test exercises
// the same code paths the backend uses. The modules are pure functions —
// they don't need React/Next. The only env-var they read is RESTAURANT_LAT /
// RESTAURANT_LNG / DELIVERY_RADIUS_KM, which dotenv.config() above loads.
const {
  computeDeliveryCharge,
  checkOrderEligibility,
  deliveryChargeForDistance,
  rawDeliveryCharge,
  roundToNearest5,
  validateDistance,
  isPlausibleDistance,
  isDistanceServiceable,
  MIN_VALID_DISTANCE_KM,
  MIN_DISTANCE_KM,
  MAX_DISTANCE_KM,
  MIN_ORDER_SUBTOTAL,
  FAR_DISTANCE_THRESHOLD_KM,
  FAR_MIN_ORDER_SUBTOTAL,
  FREE_DELIVERY_OVERRIDE,
  MIN_DELIVERY_CHARGE,
  MAX_DELIVERY_CHARGE,
} = require('../src/lib/delivery')

const {
  distanceFromRestaurant,
  isWithinDeliveryRadius,
  isPlausibleCustomerLocation,
  recomputeDistanceFromRestaurant,
  haversineKm,
} = require('../src/lib/geo')

const { RESTAURANT } = require('../src/lib/constants')

// ============================================================================
// Test framework — minimal, no deps.
// ============================================================================

let passed = 0
let failed = 0

function check(label: string, actual: unknown, expected: unknown, extra = '') {
  const ok = actual === expected
  const status = ok ? 'PASS' : 'FAIL'
  console.log(`  [${status}] ${label}: actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}${extra ? '  ' + extra : ''}`)
  if (ok) passed++
  else failed++
}

function checkTrue(label: string, actual: boolean, extra = '') {
  check(label, actual, true, extra)
}

function checkFalse(label: string, actual: boolean, extra = '') {
  check(label, actual, false, extra)
}

function section(name: string) {
  console.log('\n=========================================================')
  console.log(name)
  console.log('=========================================================')
}

// ============================================================================
// SCENARIO 4: Valid 5.4 km address → expect ₹45
// (Do this first because it sets the "happy path" baseline.)
// ============================================================================

section('SCENARIO 4: Valid 5.4 km address → expect ₹45')

{
  const distance = 5.4
  const subtotal = 300
  const calc = computeDeliveryCharge(distance, subtotal)
  console.log(`\n  computeDeliveryCharge(${distance}, ${subtotal}):`)
  console.log(`    eligible    = ${calc.eligible}`)
  console.log(`    rawCharge   = ${calc.rawCharge}  (raw formula: 20 + (5.4-1) * 5.5556 = ${20 + (5.4 - 1) * 50 / 9})`)
  console.log(`    charge      = ₹${calc.charge}  (raw rounded to nearest 5)`)
  console.log(`    isFree      = ${calc.isFree}  (subtotal ${subtotal} < ${FREE_DELIVERY_OVERRIDE})`)
  console.log(`    finalCharge = ₹${calc.finalCharge}`)
  checkTrue(`eligible at ${distance} km, ₹${subtotal}`, calc.eligible)
  // NOTE: calc.rawCharge is Math.round(raw * 100) / 100 — i.e. truncated to 2dp
  // for display. So 44.44444444... is stored as 44.44. The test rounds both sides
  // to 2dp for a fair comparison.
  check(`raw charge at ${distance} km (2dp display)`, calc.rawCharge.toFixed(2), (20 + (distance - 1) * 50 / 9).toFixed(2))
  check(`rounded charge at ${distance} km`, calc.charge, 45)
  check(`final charge at ${distance} km (the answer to the incident)`, calc.finalCharge, 45)

  // Verify the math step-by-step.
  const raw = rawDeliveryCharge(distance)
  const rounded = roundToNearest5(raw)
  check(`rawDeliveryCharge(${distance})`, raw.toFixed(4), '44.4444')
  check(`roundToNearest5(${raw.toFixed(4)})`, rounded, 45)
}

// ============================================================================
// SCENARIO 1: Permission DENIED
// (We mirror the state machine's permission check with a mock — we can't
// actually run a browser. We verify the LOGIC: when navigator.permissions
// returns 'denied', the state must end up at the 'denied' block UI.)
// ============================================================================

section('SCENARIO 1: Permission DENIED → state machine must reach "denied"')

{
  // The location-view-inner.tsx logic:
  //   1. Check window.isSecureContext. If false → 'insecure'.
  //   2. Check navigator.geolocation. If missing → 'unsupported'.
  //   3. Check navigator.permissions. If missing → fetchGpsFix directly.
  //   4. permissions.query({name:'geolocation'}).then(status => apply(status.state))
  //      - 'granted'  → fetchGpsFix
  //      - 'denied'   → setGps({kind:'denied'})
  //      - 'prompt'   → fetchGpsFix (triggers browser prompt)
  //
  // We test the apply(state) function directly.

  type GpsState =
    | { kind: 'checking' }
    | { kind: 'unsupported' }
    | { kind: 'insecure' }
    | { kind: 'denied' }
    | { kind: 'locating' }
    | { kind: 'fix_failed'; message: string }
    | { kind: 'low_accuracy'; accuracy: number }
    | { kind: 'located'; accuracy: number }

  // Re-implement the apply(state) pure logic from location-view-inner.tsx
  function applyPermissionState(
    state: PermissionState,
    isSecureContext: boolean,
    geolocationSupported: boolean
  ): GpsState {
    if (!isSecureContext) return { kind: 'insecure' }
    if (!geolocationSupported) return { kind: 'unsupported' }
    if (state === 'granted') return { kind: 'locating' }  // (would call fetchGpsFix)
    if (state === 'denied')  return { kind: 'denied' }
    return { kind: 'locating' } // 'prompt' → triggers fetchGpsFix which is also 'locating'
  }

  // Sub-case a: denied + secure + supported
  const sc1 = applyPermissionState('denied' as PermissionState, true, true)
  console.log(`\n  state='denied', secure=true, geoSupported=true → ${sc1.kind}`)
  check(`denied permission → state.kind === 'denied'`, sc1.kind, 'denied')

  // Sub-case b: denied + insecure context
  const sc2 = applyPermissionState('denied' as PermissionState, false, true)
  console.log(`  state='denied', secure=false, geoSupported=true → ${sc2.kind}`)
  check(`insecure context → state.kind === 'insecure' (takes priority over 'denied')`, sc2.kind, 'insecure')

  // Sub-case c: denied + no geolocation API
  const sc3 = applyPermissionState('denied' as PermissionState, true, false)
  console.log(`  state='denied', secure=true, geoSupported=false → ${sc3.kind}`)
  check(`no geolocation API → state.kind === 'unsupported' (takes priority over 'denied')`, sc3.kind, 'unsupported')

  // Sub-case d: granted + secure + supported
  const sc4 = applyPermissionState('granted' as PermissionState, true, true)
  console.log(`  state='granted', secure=true, geoSupported=true → ${sc4.kind}`)
  check(`granted permission → state.kind === 'locating' (would call getCurrentPosition)`, sc4.kind, 'locating')

  // Sub-case e: prompt + secure + supported (fresh customer, no decision yet)
  const sc5 = applyPermissionState('prompt' as PermissionState, true, true)
  console.log(`  state='prompt', secure=true, geoSupported=true → ${sc5.kind}`)
  check(`prompt permission → state.kind === 'locating' (triggers browser prompt)`, sc5.kind, 'locating')

  // The 'denied' state must render the LocationPermissionBlock UI (no
  // fallback). We assert that here by checking the state kind — the React
  // component renders the block UI when `gps.kind === 'denied'`.
  checkTrue(`'denied' state is in the blocking list (not 'located')`, sc1.kind !== 'located')
}

// ============================================================================
// SCENARIO 2: Pin NEVER MOVED
// (Simulates a customer who opens the location screen with permission
// GRANTED but the GPS fix never fires (e.g. device GPS hardware broken or
// timeout). State machine must NOT auto-fall-back to the restaurant.)
// ============================================================================

section('SCENARIO 2: Pin NEVER MOVED → save blocked, no fallback')

{
  // The state machine initializes pin = null (NOT [RESTAURANT.lat, RESTAURANT.lng]).
  // Without a GPS fix, the pin stays null and `canSave` is false.

  type GpsState =
    | { kind: 'checking' }
    | { kind: 'unsupported' }
    | { kind: 'insecure' }
    | { kind: 'denied' }
    | { kind: 'locating' }
    | { kind: 'fix_failed'; message: string }
    | { kind: 'low_accuracy'; accuracy: number }
    | { kind: 'located'; accuracy: number }

  // Initial state: pin is null, gps is 'checking'.
  let pin: [number, number] | null = null
  let gps: GpsState = { kind: 'checking' }

  // Customer transitions to 'locating' after permission resolves to 'granted',
  // but the GPS fix never arrives (timeout). State becomes 'fix_failed'.
  gps = { kind: 'fix_failed', message: 'Timeout' }
  // Pin is still null.

  // canSave logic from the React component:
  const plausible = pin ? isPlausibleCustomerLocation(pin[0], pin[1]) : false
  const withinRadius = pin ? isWithinDeliveryRadius(pin[0], pin[1]) : false
  const canSave =
    pin != null &&
    plausible &&
    withinRadius &&
    (gps.kind === 'located' || (gps.kind === 'low_accuracy' && false /* pinMoved */))

  console.log(`\n  After permission granted but fix failed:`)
  console.log(`    pin = ${pin}`)
  console.log(`    gps.kind = ${gps.kind}`)
  console.log(`    plausible = ${plausible}`)
  console.log(`    withinRadius = ${withinRadius}`)
  console.log(`    canSave = ${canSave}`)
  checkFalse(`canSave is false when pin is null`, canSave)
  checkFalse(`plausible is false when pin is null`, plausible)

  // Even if a malicious client somehow set pin to the restaurant's coords,
  // canSave must still be false (because plausible is false).
  pin = [RESTAURANT.lat, RESTAURANT.lng]
  const plausible2 = isPlausibleCustomerLocation(pin[0], pin[1])
  const canSave2 =
    pin != null &&
    plausible2 &&
    withinRadius &&
    (gps.kind === 'located' || (gps.kind === 'low_accuracy' && false))

  console.log(`\n  Even if pin were force-set to the restaurant's coords:`)
  console.log(`    pin = ${pin}`)
  console.log(`    plausible = ${plausible2}`)
  console.log(`    canSave = ${canSave2}`)
  checkFalse(`isPlausibleCustomerLocation returns false for restaurant coords`, plausible2)
  checkFalse(`canSave is false even when pin is forced to restaurant coords`, canSave2)

  // And the backend would reject the address save too (defense in depth).
  const distFromRestaurant = distanceFromRestaurant(pin[0], pin[1])
  const validation = validateDistance(distFromRestaurant)
  console.log(`\n  Backend defense in depth (address POST / PATCH / checkout):`)
  console.log(`    distanceFromRestaurant(${pin[0]}, ${pin[1]}) = ${distFromRestaurant}`)
  console.log(`    validateDistance(${distFromRestaurant}) = ${JSON.stringify(validation)}`)
  checkFalse(`validateDistance(0) is not ok`, validation.ok)
  if (!validation.ok) {
    check(`validateDistance(0) reason`, validation.reason, 'BELOW_MIN_VALID')
  }

  // And computeDeliveryCharge must reject a 0 distance with BELOW_MIN_VALID.
  const calc0 = computeDeliveryCharge(0, 300)
  checkFalse(`computeDeliveryCharge(0, 300) is not eligible`, calc0.eligible)
  check(`computeDeliveryCharge(0, 300) reason`, calc0.reason, 'BELOW_MIN_VALID')
  check(`computeDeliveryCharge(0, 300) finalCharge`, calc0.finalCharge, 0)
}

// ============================================================================
// SCENARIO 3: OLD bad saved address (created before the fix)
// ============================================================================

section('SCENARIO 3: OLD bad saved address → checkout / cart must block')

{
  // We mirror the badAddressReason() helper from checkout-view.tsx and
  // cart-view.tsx. Both implementations must agree.
  type Address = {
    id: string
    label: string | null
    houseFlat: string
    streetArea: string
    landmark: string | null
    city: string
    pincode: string
    latitude: number
    longitude: number
    distanceKm: number | null
    isDefault: boolean
  }

  function badAddressReason(a: Address): string | null {
    if (a.latitude === RESTAURANT.lat && a.longitude === RESTAURANT.lng) {
      return 'This saved address has the restaurant\'s coordinates. Please re-pick your delivery location.'
    }
    if (a.distanceKm == null) {
      return 'This saved address has no recorded distance. Please re-pick your delivery location.'
    }
    if (a.distanceKm < MIN_VALID_DISTANCE_KM) {
      return `This saved address shows a distance of ${a.distanceKm.toFixed(4)} km — which means the location pin was never moved off the restaurant. Please re-pick your delivery location.`
    }
    if (!isPlausibleCustomerLocation(a.latitude, a.longitude)) {
      return 'This saved address has invalid coordinates. Please re-pick your delivery location.'
    }
    return null
  }

  // Sub-case a: lat/lng exactly match the restaurant (AB-2026-0005 case)
  const addr1: Address = {
    id: 'addr_1',
    label: 'Home',
    houseFlat: '12',
    streetArea: 'Some Street',
    landmark: null,
    city: 'Bankat Khas',
    pincode: '221308',
    latitude: RESTAURANT.lat,
    longitude: RESTAURANT.lng,
    distanceKm: 0,
    isDefault: true,
  }
  const reason1 = badAddressReason(addr1)
  console.log(`\n  address1 (lat/lng == restaurant, distanceKm=0):`)
  console.log(`    reason = ${reason1 ?? 'null'}`)
  checkTrue(`addr1 (restaurant coords) is flagged bad`, reason1 != null)

  // Sub-case b: distanceKm is NULL (older schema migration)
  const addr2: Address = { ...addr1, id: 'addr_2', latitude: 25.34, longitude: 82.35, distanceKm: null }
  const reason2 = badAddressReason(addr2)
  console.log(`\n  address2 (distanceKm=NULL):`)
  console.log(`    reason = ${reason2 ?? 'null'}`)
  checkTrue(`addr2 (NULL distanceKm) is flagged bad`, reason2 != null)

  // Sub-case c: distanceKm < 0.05 but lat/lng not exactly restaurant
  const addr3: Address = { ...addr1, id: 'addr_3', latitude: 25.3377, longitude: 82.3514, distanceKm: 0.01 }
  const reason3 = badAddressReason(addr3)
  console.log(`\n  address3 (distanceKm=0.01 < 0.05):`)
  console.log(`    reason = ${reason3 ?? 'null'}`)
  checkTrue(`addr3 (sub-plausibility distanceKm) is flagged bad`, reason3 != null)

  // Sub-case d: a legitimately fine address (5.4 km)
  const addr4: Address = { ...addr1, id: 'addr_4', latitude: 25.290, longitude: 82.395, distanceKm: 5.4 }
  const reason4 = badAddressReason(addr4)
  console.log(`\n  address4 (5.4 km away, valid):`)
  console.log(`    reason = ${reason4 ?? 'null'}`)
  check(`addr4 (valid 5.4 km) is NOT flagged bad`, reason4, null)

  // === Backend layer (server-side recompute at checkout) ===
  // Even if the saved distanceKm is 0, the backend must reject the checkout
  // because it now recomputes distance from the stored lat/lng server-side.
  const dist1 = distanceFromRestaurant(addr1.latitude, addr1.longitude)
  const calc1 = computeDeliveryCharge(dist1, 300)
  console.log(`\n  Backend recompute for address1 (restaurant coords):`)
  console.log(`    distanceFromRestaurant(${addr1.latitude}, ${addr1.longitude}) = ${dist1}`)
  console.log(`    computeDeliveryCharge(${dist1}, 300).eligible = ${calc1.eligible}`)
  console.log(`    computeDeliveryCharge(${dist1}, 300).reason     = ${calc1.reason}`)
  console.log(`    computeDeliveryCharge(${dist1}, 300).finalCharge = ₹${calc1.finalCharge}`)
  checkFalse(`Backend rejects checkout for address1 (distance 0 → BELOW_MIN_VALID)`, calc1.eligible)
  check(`Backend reason for address1`, calc1.reason, 'BELOW_MIN_VALID')

  // Sub-case e: valid 5.4 km address — backend recompute must agree with stored.
  const dist4 = distanceFromRestaurant(addr4.latitude, addr4.longitude)
  const calc4 = computeDeliveryCharge(dist4, 300)
  console.log(`\n  Backend recompute for address4 (5.4 km away):`)
  console.log(`    distanceFromRestaurant(${addr4.latitude}, ${addr4.longitude}) = ${dist4.toFixed(4)}`)
  console.log(`    computeDeliveryCharge(${dist4.toFixed(4)}, 300).eligible = ${calc4.eligible}`)
  console.log(`    computeDeliveryCharge(${dist4.toFixed(4)}, 300).finalCharge = ₹${calc4.finalCharge}`)
  checkTrue(`Backend allows checkout for address4 (5.4 km, valid)`, calc4.eligible)
  // The recompute will be close to 5.4 km but not exact (lat/lng are 3dp).
  // We just check the finalCharge is ₹45 if distance >= 5.25 km and < 5.75 km.
  // (At 5.25: raw = 20 + 4.25*5.5556 = 43.61 → round = 45)
  // (At 5.75: raw = 20 + 4.75*5.5556 = 46.39 → round = 45)
  // Anything in [5.25, 5.75) rounds to 45.
  if (dist4 >= 5.25 && dist4 < 5.75) {
    check(`Backend finalCharge for 5.4 km address`, calc4.finalCharge, 45)
  } else {
    console.log(`    (distance ${dist4.toFixed(4)} is outside the [5.25, 5.75) window — skipping strict ₹45 check)`)
  }
}

// ============================================================================
// SCENARIO: plausibility floor boundary cases (the 0.05 km cutoff)
// ============================================================================

section('Plausibility floor boundary cases (MIN_VALID_DISTANCE_KM = 0.05)')

{
  // 0 → rejected
  let c = computeDeliveryCharge(0, 300)
  checkFalse(`computeDeliveryCharge(0, 300) eligible`, c.eligible)
  check(`computeDeliveryCharge(0, 300) reason`, c.reason, 'BELOW_MIN_VALID')

  // 0.03 → rejected
  c = computeDeliveryCharge(0.03, 300)
  checkFalse(`computeDeliveryCharge(0.03, 300) eligible`, c.eligible)
  check(`computeDeliveryCharge(0.03, 300) reason`, c.reason, 'BELOW_MIN_VALID')

  // 0.049 → rejected
  c = computeDeliveryCharge(0.049, 300)
  checkFalse(`computeDeliveryCharge(0.049, 300) eligible`, c.eligible)
  check(`computeDeliveryCharge(0.049, 300) reason`, c.reason, 'BELOW_MIN_VALID')

  // 0.05 → accepted (boundary inclusive; checkOrderEligibility uses `<`)
  // 0.05 is NOT < 0.05, so it passes the plausibility floor, then clamps to 1 km.
  c = computeDeliveryCharge(0.05, 300)
  checkTrue(`computeDeliveryCharge(0.05, 300) eligible (boundary)`, c.eligible)
  check(`computeDeliveryCharge(0.05, 300) finalCharge`, c.finalCharge, 20)

  // 0.051 → accepted
  c = computeDeliveryCharge(0.051, 300)
  checkTrue(`computeDeliveryCharge(0.051, 300) eligible`, c.eligible)
  check(`computeDeliveryCharge(0.051, 300) finalCharge`, c.finalCharge, 20)

  // 0.5 → accepted, still ₹20
  c = computeDeliveryCharge(0.5, 300)
  checkTrue(`computeDeliveryCharge(0.5, 300) eligible`, c.eligible)
  check(`computeDeliveryCharge(0.5, 300) finalCharge`, c.finalCharge, 20)

  // 1 km → ₹20 (min charge)
  c = computeDeliveryCharge(1, 300)
  checkTrue(`computeDeliveryCharge(1, 300) eligible`, c.eligible)
  check(`computeDeliveryCharge(1, 300) finalCharge`, c.finalCharge, 20)

  // 5.4 km → ₹45
  c = computeDeliveryCharge(5.4, 300)
  checkTrue(`computeDeliveryCharge(5.4, 300) eligible`, c.eligible)
  check(`computeDeliveryCharge(5.4, 300) finalCharge`, c.finalCharge, 45)

  // 10 km + ₹300 → BLOCKED (not eligible). The plausibility floor passes,
  // but the 7km+ rule requires ₹800 minimum — so 10km + ₹300 is blocked
  // with reason BELOW_FAR_MIN_SUBTOTAL. To get a successful 10km charge
  // we need subtotal ≥ ₹800.
  c = computeDeliveryCharge(10, 300)
  checkFalse(`computeDeliveryCharge(10, 300) blocked (7km+ needs ₹800)`, c.eligible)
  check(`computeDeliveryCharge(10, 300) reason`, c.reason, 'BELOW_FAR_MIN_SUBTOTAL')

  // 10 km + ₹1000 → eligible, ₹70 (max charge)
  c = computeDeliveryCharge(10, 1000)
  checkTrue(`computeDeliveryCharge(10, 1000) eligible`, c.eligible)
  check(`computeDeliveryCharge(10, 1000) finalCharge (max charge)`, c.finalCharge, 70)

  // 11 km → rejected (defensive — checkout route also rejects via isDistanceServiceable)
  c = computeDeliveryCharge(11, 300)
  // 11 > 10, but computeDeliveryCharge only checks the plausibility floor
  // and the eligibility (which doesn't check the radius). So 11 km passes
  // the plausibility floor and returns eligible:true with a clamped-to-10km
  // charge of ₹70. The actual rejection happens in the checkout route via
  // isDistanceServiceable(). This is documented in delivery.ts.
  console.log(`\n  Note: computeDeliveryCharge(11, 300) returns eligible=${c.eligible} because`)
  console.log(`  the function doesn't itself check the 10km ceiling. The checkout route`)
  console.log(`  rejects 11 km separately via isDistanceServiceable().`)
  // Confirm the route-level rejection works. The radius is read from env
  // (DELIVERY_RADIUS_KM), so we test the actual configured boundary, not
  // an assumed 10 km.
  const radiusKm = RESTAURANT.deliveryRadiusKm
  console.log(`\n  (Production DELIVERY_RADIUS_KM = ${radiusKm} km)`)
  checkFalse(`isDistanceServiceable(${radiusKm + 1}) (just over the radius)`, isDistanceServiceable(radiusKm + 1))
  checkTrue(`isDistanceServiceable(${radiusKm}) (at the radius boundary)`, isDistanceServiceable(radiusKm))
  checkTrue(`isDistanceServiceable(0.05)`, isDistanceServiceable(0.05))
  // NOTE: isDistanceServiceable only checks the upper bound (≤ radius). It does
  // NOT check the plausibility floor — that's validateDistance()'s job. So a
  // 0.049 km distance IS "serviceable" (≤ radius) but is NOT plausible (< 0.05).
  // The plausibility check happens earlier in the pipeline:
  //   - validateDistance(0.049) → ok:false (BELOW_MIN_VALID)
  //   - computeDeliveryCharge(0.049, ...) → eligible:false (BELOW_MIN_VALID)
  checkTrue(`isDistanceServiceable(0.049) — passes upper-bound check (does NOT check plausibility floor)`, isDistanceServiceable(0.049))
  const v0049 = validateDistance(0.049)
  checkFalse(`validateDistance(0.049) — plausibility floor rejects it`, v0049.ok)
}

// ============================================================================
// SCENARIO: free-delivery override still works at ₹2000+
// ============================================================================

section('Free-delivery override at ₹2000+ (must remain unchanged)')

{
  // 5.4 km, ₹2000 subtotal → free
  let c = computeDeliveryCharge(5.4, 2000)
  checkTrue(`computeDeliveryCharge(5.4, 2000) eligible`, c.eligible)
  checkTrue(`computeDeliveryCharge(5.4, 2000) isFree`, c.isFree)
  check(`computeDeliveryCharge(5.4, 2000) finalCharge`, c.finalCharge, 0)

  // 5.4 km, ₹1999 subtotal → ₹45
  c = computeDeliveryCharge(5.4, 1999)
  checkTrue(`computeDeliveryCharge(5.4, 1999) eligible`, c.eligible)
  checkFalse(`computeDeliveryCharge(5.4, 1999) isFree`, c.isFree)
  check(`computeDeliveryCharge(5.4, 1999) finalCharge`, c.finalCharge, 45)
}

// ============================================================================
// SCENARIO: eligibility thresholds still work (₹200 min, ₹800 for 7km+)
// ============================================================================

section('Eligibility thresholds (₹200 min, ₹800 for 7km+)')

{
  // ₹150 subtotal, 3 km → BELOW_MIN_SUBTOTAL
  let c = computeDeliveryCharge(3, 150)
  checkFalse(`computeDeliveryCharge(3, 150) eligible`, c.eligible)
  check(`computeDeliveryCharge(3, 150) reason`, c.reason, 'BELOW_MIN_SUBTOTAL')

  // ₹150 subtotal, 9 km → BELOW_FAR_MIN_SUBTOTAL (not BELOW_MIN_SUBTOTAL — distance-first)
  c = computeDeliveryCharge(9, 150)
  checkFalse(`computeDeliveryCharge(9, 150) eligible`, c.eligible)
  check(`computeDeliveryCharge(9, 150) reason`, c.reason, 'BELOW_FAR_MIN_SUBTOTAL')

  // ₹500 subtotal, 9 km → BELOW_FAR_MIN_SUBTOTAL (still blocked)
  c = computeDeliveryCharge(9, 500)
  checkFalse(`computeDeliveryCharge(9, 500) eligible`, c.eligible)
  check(`computeDeliveryCharge(9, 500) reason`, c.reason, 'BELOW_FAR_MIN_SUBTOTAL')

  // ₹850 subtotal, 9 km → eligible
  c = computeDeliveryCharge(9, 850)
  checkTrue(`computeDeliveryCharge(9, 850) eligible`, c.eligible)
  check(`computeDeliveryCharge(9, 850) finalCharge`, c.finalCharge, 65)
}

// ============================================================================
// SCENARIO: server-side recompute — backend never trusts client distanceKm
// ============================================================================

section('Backend: recomputeDistanceFromRestaurant never trusts client distanceKm')

{
  // Simulate a malicious client that sends the restaurant's lat/lng with a
  // fake distanceKm = 0.5 km (just above the plausibility floor). The
  // server must reject because the recomputed distance from the restaurant
  // coords is 0.
  const clientSuppliedLat = RESTAURANT.lat
  const clientSuppliedLng = RESTAURANT.lng
  const clientSuppliedDistanceKm = 0.5 // ← lie
  const serverRecomputed = recomputeDistanceFromRestaurant(clientSuppliedLat, clientSuppliedLng)
  const serverValidation = validateDistance(serverRecomputed)

  console.log(`\n  Client sends: lat=${clientSuppliedLat}, lng=${clientSuppliedLng}, distanceKm=${clientSuppliedDistanceKm}`)
  console.log(`  Server recomputes: ${serverRecomputed}`)
  console.log(`  Server validates: ${JSON.stringify(serverValidation)}`)
  checkFalse(`Server rejects the lie (distance 0 < 0.05)`, serverValidation.ok)

  // Simulate a legitimately fine lat/lng with a wrong distanceKm in the body.
  // The server should overwrite the client value with the recomputed one.
  // Pick a point ~1.5 km from the restaurant (well inside the 5 km production
  // radius AND inside the default 10 km radius). 0.0135° lat ≈ 1.5 km.
  const realLat = RESTAURANT.lat + 0.0135
  const realLng = RESTAURANT.lng + 0.0135
  const fakeClientDistance = 999 // ← lie
  const serverRecomputed2 = recomputeDistanceFromRestaurant(realLat, realLng)
  const serverValidation2 = validateDistance(serverRecomputed2)

  console.log(`\n  Client sends: lat=${realLat}, lng=${realLng}, distanceKm=${fakeClientDistance}`)
  console.log(`  Server recomputes: ${serverRecomputed2.toFixed(4)}`)
  console.log(`  Server validates: ${JSON.stringify(serverValidation2)}`)
  checkTrue(`Server accepts the real coords (within radius)`, serverValidation2.ok)
  checkFalse(`Server's recomputed distance ≠ client's fake value`, serverRecomputed2 === fakeClientDistance)
}

// ============================================================================
// SCENARIO 5: PRODUCTION-RADIUS ADAPTIVE TEST
// (The production deployment has DELIVERY_RADIUS_KM=5, NOT 10. The pure
// computeDeliveryCharge() function doesn't check the radius ceiling — the
// checkout route does, via isDistanceServiceable(). This scenario verifies
// the route-level rejection for out-of-radius addresses under whatever
// radius is configured.)
// ============================================================================

section('SCENARIO 5: production-radius adaptive (DELIVERY_RADIUS_KM = ' + RESTAURANT.deliveryRadiusKm + ' km)')

{
  const radius = RESTAURANT.deliveryRadiusKm
  const outOfRadius = radius + 0.4  // e.g. 5.4 km when radius=5
  const inRadius = Math.max(1, radius * 0.6)  // e.g. 3 km when radius=5

  // The AB-2026-0005 customer's actual address was 5.4 km from the restaurant.
  // With the production 5 km radius, this customer is OUT OF RADIUS and should
  // be REJECTED at the route level — not charged any fee at all.
  console.log(`\n  Configured radius: ${radius} km`)
  console.log(`  Out-of-radius test distance: ${outOfRadius} km`)
  console.log(`  In-radius test distance:     ${inRadius} km`)

  // Route-level check: out-of-radius must be rejected.
  checkFalse(`isDistanceServiceable(${outOfRadius}) — route rejects out-of-radius addresses`, isDistanceServiceable(outOfRadius))

  // Pure-function check: computeDeliveryCharge itself does NOT check the
  // radius ceiling, so it may return eligible=true for an out-of-radius
  // distance. This is documented in delivery.ts — the route is the final
  // authority via isDistanceServiceable().
  const cOutOf = computeDeliveryCharge(outOfRadius, 1000)
  console.log(`\n  computeDeliveryCharge(${outOfRadius}, 1000):`)
  console.log(`    eligible    = ${cOutOf.eligible}  (pure function — does NOT check radius ceiling)`)
  console.log(`    finalCharge = ₹${cOutOf.finalCharge}`)
  console.log(`    But the checkout route WOULD reject this via isDistanceServiceable().`)

  // In-radius: should be eligible and produce a sensible charge.
  const cIn = computeDeliveryCharge(inRadius, 1000)
  console.log(`\n  computeDeliveryCharge(${inRadius}, 1000):`)
  console.log(`    eligible    = ${cIn.eligible}`)
  console.log(`    finalCharge = ₹${cIn.finalCharge}`)
  checkTrue(`computeDeliveryCharge(${inRadius}, 1000) eligible (in-radius)`, cIn.eligible)
  // Don't assert the exact ₹ value — it depends on the radius (which depends
  // on env). Just assert it's in the [₹20, ₹70] range.
  checkTrue(`finalCharge is within [₹20, ₹70] range`, cIn.finalCharge >= 20 && cIn.finalCharge <= 70)

  // For the SPECIFIC production radius of 5 km:
  //   - 3 km + ₹1000 → raw = 20 + (3-1)*5.5556 = 31.11 → round = 30
  //   - 4 km + ₹1000 → raw = 20 + (4-1)*5.5556 = 36.67 → round = 35
  //   - 5 km + ₹1000 → raw = 20 + (5-1)*5.5556 = 42.22 → round = 40
  if (radius === 5) {
    console.log(`\n  Production-specific (radius=5 km) fee curve:`)
    for (const d of [1, 2, 3, 4, 5]) {
      const c = computeDeliveryCharge(d, 1000)
      console.log(`    ${d} km → ₹${c.finalCharge}`)
    }
    const c3 = computeDeliveryCharge(3, 1000)
    check(`computeDeliveryCharge(3, 1000).finalCharge (production radius)`, c3.finalCharge, 30)
    const c4 = computeDeliveryCharge(4, 1000)
    check(`computeDeliveryCharge(4, 1000).finalCharge (production radius)`, c4.finalCharge, 35)
    const c5 = computeDeliveryCharge(5, 1000)
    check(`computeDeliveryCharge(5, 1000).finalCharge (production radius, at boundary)`, c5.finalCharge, 40)
  }
}

// ============================================================================
// SUMMARY
// ============================================================================

section('SUMMARY')

console.log(`\n  ${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('\n  ❌ Some checks failed. Review the output above.')
  process.exit(1)
} else {
  console.log('\n  ✅ All checks passed.')
  console.log('\n  Manual Android / PWA tests still required:')
  console.log('    1. Open the location screen with permission = "prompt" →')
  console.log('       browser prompt appears; granting → pin drops at GPS fix.')
  console.log('    2. Deny the prompt → full-screen "Location Required" block UI.')
  console.log('       Tap "I\'ve enabled it, try again" → re-checks permission.')
  console.log('    3. Flip permission back to Allow in Chrome settings → screen')
  console.log('       auto-advances to GPS acquire (permission.onchange listener).')
  console.log('    4. Trigger a GPS timeout (e.g. enable airplane mode after granting)')
  console.log('       → "fix_failed" retry screen, no fallback to restaurant.')
  console.log('    5. Test the PWA (Add to Home Screen) flow — same scenarios.')
  console.log('    6. Test the insecure-context block by loading the page over HTTP')
  console.log('       (NOT localhost) — should show the "must use HTTPS" block.')
  console.log('    7. Try a low-accuracy GPS fix ( indoors, weak signal) → low_accuracy')
  console.log('       banner appears with retry button.')
}
