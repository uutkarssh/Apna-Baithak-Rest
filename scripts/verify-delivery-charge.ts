/**
 * Verify the FINAL delivery-pricing system against the reference values
 * specified in the task brief.
 *
 * Reference values (must match exactly):
 *   - 1km,  ₹300  → charge ₹20
 *   - 3km,  ₹250  → charge ₹30
 *   - 5km,  ₹300  → charge ₹40 (approx — verify against formula)
 *   - 9km,  ₹850  → charge ₹65
 *   - 10km, ₹1000 → charge ₹70
 *   - 3km,  ₹150  → BLOCKED (below ₹200 minimum)
 *   - 9km,  ₹500  → BLOCKED (7km+ requires ₹800 minimum)
 *   - 9km,  ₹2100 → charge ₹0 (₹2000+ override)
 *   - 11km address → non-serviceable, rejected at selection
 */
// Load env BEFORE importing constants/delivery (which read process.env at
// module-load time). In production Next.js loads .env automatically; this
// script needs to do it manually.
import * as dotenv from 'dotenv'
dotenv.config({ path: '/home/z/my-project/apna-baithak/.env' })

// Force re-evaluation with env now set
const { RESTAURANT } = require('../src/lib/constants')
const {
  computeDeliveryCharge,
  checkOrderEligibility,
  deliveryChargeForDistance,
  rawDeliveryCharge,
  isDistanceServiceable,
  roundToNearest5,
  remainingForFreeDelivery,
  MIN_ORDER_SUBTOTAL,
  FAR_DISTANCE_THRESHOLD_KM,
  FAR_MIN_ORDER_SUBTOTAL,
  FREE_DELIVERY_OVERRIDE,
  MIN_DELIVERY_CHARGE,
  MAX_DELIVERY_CHARGE,
} = require('../src/lib/delivery')

type Ref = {
  label: string
  distanceKm: number
  subtotal: number
  expected: 'BLOCKED' | number
  expectedReason?: string
}

const refs: Ref[] = [
  { label: '1km, ₹300',   distanceKm: 1,   subtotal: 300,  expected: 20 },
  { label: '3km, ₹250',   distanceKm: 3,   subtotal: 250,  expected: 30 },
  { label: '5km, ₹300',   distanceKm: 5,   subtotal: 300,  expected: 40 }, // approx — verify
  { label: '9km, ₹850',   distanceKm: 9,   subtotal: 850,  expected: 65 },
  { label: '10km, ₹1000', distanceKm: 10,  subtotal: 1000, expected: 70 },
  { label: '3km, ₹150',   distanceKm: 3,   subtotal: 150,  expected: 'BLOCKED', expectedReason: 'BELOW_MIN_SUBTOTAL' },
  { label: '9km, ₹500',   distanceKm: 9,   subtotal: 500,  expected: 'BLOCKED', expectedReason: 'BELOW_FAR_MIN_SUBTOTAL' },
  { label: '9km, ₹2100',  distanceKm: 9,   subtotal: 2100, expected: 0 }, // ₹2000+ override
]

let passed = 0
let failed = 0

function check(label: string, actual: unknown, expected: unknown, extra = '') {
  const ok = actual === expected
  const status = ok ? 'PASS' : 'FAIL'
  console.log(`  [${status}] ${label}: actual=${actual} expected=${expected}${extra ? '  ' + extra : ''}`)
  if (ok) passed++
  else failed++
}

console.log('=== FINAL delivery-pricing system — reference tests ===')
console.log(`(RESTAURANT.deliveryRadiusKm = ${RESTAURANT.deliveryRadiusKm})`)
console.log(`Constants: MIN_SUBTOTAL=₹${MIN_ORDER_SUBTOTAL}, FAR_THRESHOLD=${FAR_DISTANCE_THRESHOLD_KM}km, FAR_MIN=₹${FAR_MIN_ORDER_SUBTOTAL}, FREE_OVERRIDE=₹${FREE_DELIVERY_OVERRIDE}`)
console.log(`Charge range: ₹${MIN_DELIVERY_CHARGE} (1km) → ₹${MAX_DELIVERY_CHARGE} (10km)\n`)

for (const r of refs) {
  const calc = computeDeliveryCharge(r.distanceKm, r.subtotal)
  const eligibility = checkOrderEligibility(r.distanceKm, r.subtotal)
  console.log(`\n${r.label} (distance=${r.distanceKm}km, subtotal=₹${r.subtotal}):`)
  console.log(`  raw charge = ${rawDeliveryCharge(r.distanceKm).toFixed(2)}`)
  console.log(`  rounded    = ₹${deliveryChargeForDistance(r.distanceKm)}`)
  console.log(`  eligible   = ${eligibility.eligible}`)
  if (!eligibility.eligible) {
    console.log(`  reason     = ${eligibility.reason}`)
    console.log(`  message    = ${eligibility.message}`)
    console.log(`  remaining  = ₹${eligibility.remaining}`)
  }
  console.log(`  isFree     = ${calc.isFree}`)
  console.log(`  finalCharge = ₹${calc.finalCharge}`)

  if (r.expected === 'BLOCKED') {
    check(`eligible for ${r.label}`, calc.eligible, false)
    if (r.expectedReason) {
      check(`reason for ${r.label}`, calc.reason, r.expectedReason)
    }
  } else {
    check(`eligible for ${r.label}`, calc.eligible, true)
    check(`charge for ${r.label}`, calc.finalCharge, r.expected)
  }
}

console.log('\n\n=== 11km address rejection (service radius) ===\n')
check('11km is serviceable', isDistanceServiceable(11), false)
check('10km is serviceable', isDistanceServiceable(10), true)
check('10.01km is serviceable', isDistanceServiceable(10.01), false)

console.log('\n\n=== Cart messaging checks ===\n')

// Subtotal < ₹200 → "Add ₹X more to enable delivery"
const r1 = checkOrderEligibility(3, 150)
check('₹150 at 3km eligible', r1.eligible, false)
check('₹150 at 3km reason', r1.reason, 'BELOW_MIN_SUBTOTAL')
check('₹150 at 3km remaining', r1.remaining, 50) // 200 - 150

// Distance > 7km and subtotal < ₹800 → "Add ₹X more — orders beyond 7km need ₹800 min"
const r2 = checkOrderEligibility(9, 500)
check('₹500 at 9km eligible', r2.eligible, false)
check('₹500 at 9km reason', r2.reason, 'BELOW_FAR_MIN_SUBTOTAL')
check('₹500 at 9km remaining', r2.remaining, 300) // 800 - 500

// Subtotal >= ₹2000 → free delivery
const r3 = checkOrderEligibility(9, 2100)
check('₹2100 at 9km eligible', r3.eligible, true)
const calc3 = computeDeliveryCharge(9, 2100)
check('₹2100 at 9km isFree', calc3.isFree, true)
check('₹2100 at 9km finalCharge', calc3.finalCharge, 0)

// remainingForFreeDelivery returns null when blocked, correct value when eligible
const rf1 = remainingForFreeDelivery(3, 150)
check('remainingForFreeDelivery(3km, ₹150) — blocked → null', rf1, null)
const rf2 = remainingForFreeDelivery(3, 300)
check('remainingForFreeDelivery(3km, ₹300) — eligible, below ₹2000', rf2, 1700) // 2000 - 300
const rf3 = remainingForFreeDelivery(3, 2500)
check('remainingForFreeDelivery(3km, ₹2500) — eligible, above ₹2000', rf3, 0)

console.log('\n\n=== Round-to-nearest-5 spot checks ===\n')
check('roundToNearest5(20)', roundToNearest5(20), 20)
check('roundToNearest5(25.56)', roundToNearest5(25.56), 25) // 25.56 → 26 → 25? Math.round(25.56/5)*5 = Math.round(5.112)*5 = 5*5 = 25
check('roundToNearest5(30)', roundToNearest5(30), 30)
check('roundToNearest5(62.22)', roundToNearest5(62.22), 60) // Math.round(12.444)*5 = 12*5 = 60
check('roundToNearest5(65)', roundToNearest5(65), 65)
check('roundToNearest5(70)', roundToNearest5(70), 70)

console.log('\n\n=== Delivery-charge curve (raw → rounded) ===\n')
const distances = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
for (const d of distances) {
  const raw = rawDeliveryCharge(d)
  const rounded = deliveryChargeForDistance(d)
  console.log(`  ${d}km → raw=₹${raw.toFixed(2)}  rounded=₹${rounded}`)
}

console.log(`\n\n=== Summary ===`)
console.log(`  ${passed} passed, ${failed} failed`)
if (failed > 0) {
  process.exit(1)
}
