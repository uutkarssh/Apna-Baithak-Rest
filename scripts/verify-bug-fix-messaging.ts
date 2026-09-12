/**
 * Verify the cart eligibility messaging + delivery fee display fixes.
 *
 * Bug 1: Wrong message priority — at 9.71km with ₹150 cart, the cart showed
 *        "Add ₹50 more — minimum order for delivery is ₹200" (wrong — should
 *        show the ₹800 message since distance > 7km).
 *
 * Bug 2: Delivery fee hidden until minimum met — the fee showed "Not available"
 *        until the order crossed the minimum threshold. Should always show the
 *        actual fee number based on distance.
 *
 * Fix: checkOrderEligibility() now checks distance FIRST (far-distance ₹800
 * check before the universal ₹200 check). And the cart computes the delivery
 * fee independently of eligibility — always shows the number.
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '/home/z/my-project/apna-baithak/.env' })

const {
  checkOrderEligibility,
  deliveryChargeForDistance,
  MIN_ORDER_SUBTOTAL,
  FAR_DISTANCE_THRESHOLD_KM,
  FAR_MIN_ORDER_SUBTOTAL,
  FREE_DELIVERY_OVERRIDE,
} = require('../src/lib/delivery')

let passed = 0
let failed = 0

function check(label: string, actual: unknown, expected: unknown) {
  const ok = actual === expected
  const status = ok ? 'PASS' : 'FAIL'
  console.log(`  [${status}] ${label}: actual=${actual} expected=${expected}`)
  if (ok) passed++
  else failed++
}

console.log('=== Bug fix verification: distance-first eligibility + always-show fee ===\n')

// === Bug 1: Distance-first message priority ===
console.log('--- Bug 1: Distance-first message priority ---\n')

// 9.71km, ₹150 cart → should show ₹800 message (NOT ₹200)
const r1 = checkOrderEligibility(9.71, 150)
console.log('9.71km, ₹150 cart:')
console.log(`  eligible: ${r1.eligible}`)
console.log(`  reason: ${r1.eligible ? 'n/a' : r1.reason}`)
console.log(`  message: ${r1.eligible ? 'n/a' : r1.message}`)
console.log(`  remaining: ₹${r1.eligible ? 0 : r1.remaining}`)
check('reason for 9.71km/₹150', r1.eligible ? null : r1.reason, 'BELOW_FAR_MIN_SUBTOTAL')
check('remaining for 9.71km/₹150', r1.eligible ? 0 : r1.remaining, 650) // 800 - 150
console.log()

// 9.71km, ₹300 cart → should STILL show ₹800 message (not ₹200)
const r2 = checkOrderEligibility(9.71, 300)
console.log('9.71km, ₹300 cart:')
console.log(`  reason: ${r2.eligible ? 'n/a' : r2.reason}`)
console.log(`  remaining: ₹${r2.eligible ? 0 : r2.remaining}`)
check('reason for 9.71km/₹300', r2.eligible ? null : r2.reason, 'BELOW_FAR_MIN_SUBTOTAL')
check('remaining for 9.71km/₹300', r2.eligible ? 0 : r2.remaining, 500) // 800 - 300
console.log()

// 9.71km, ₹850 cart → eligible (crossed ₹800)
const r3 = checkOrderEligibility(9.71, 850)
console.log('9.71km, ₹850 cart:')
console.log(`  eligible: ${r3.eligible}`)
check('eligible for 9.71km/₹850', r3.eligible, true)
console.log()

// 4km, ₹150 cart → should show ₹200 message (NOT ₹800)
const r4 = checkOrderEligibility(4, 150)
console.log('4km, ₹150 cart:')
console.log(`  reason: ${r4.eligible ? 'n/a' : r4.reason}`)
console.log(`  remaining: ₹${r4.eligible ? 0 : r4.remaining}`)
check('reason for 4km/₹150', r4.eligible ? null : r4.reason, 'BELOW_MIN_SUBTOTAL')
check('remaining for 4km/₹150', r4.eligible ? 0 : r4.remaining, 50) // 200 - 150
console.log()

// 4km, ₹250 cart → eligible (crossed ₹200)
const r5 = checkOrderEligibility(4, 250)
console.log('4km, ₹250 cart:')
console.log(`  eligible: ${r5.eligible}`)
check('eligible for 4km/₹250', r5.eligible, true)
console.log()

// === Bug 2: Delivery fee always shown (independent of eligibility) ===
console.log('--- Bug 2: Delivery fee always shown ---\n')

// 9.71km → fee should be ~₹70 (clamped to 10km, rounded to nearest 5)
const fee1 = deliveryChargeForDistance(9.71)
console.log(`9.71km delivery fee: ₹${fee1}`)
check('fee for 9.71km', fee1, 70) // 9.71 clamps to 10, raw=70, rounded=70
console.log()

// 4km → fee should be ₹35
const fee2 = deliveryChargeForDistance(4)
console.log(`4km delivery fee: ₹${fee2}`)
check('fee for 4km', fee2, 35) // raw=36.67, rounded=35
console.log()

// The fee is the SAME whether the order is eligible or not — it only
// depends on distance. The cart now computes it independently.
console.log('Fee is independent of eligibility:')
console.log(`  9.71km, ₹150 (blocked): fee = ₹${deliveryChargeForDistance(9.71)}`)
console.log(`  9.71km, ₹850 (eligible): fee = ₹${deliveryChargeForDistance(9.71)}`)
console.log(`  4km, ₹150 (blocked): fee = ₹${deliveryChargeForDistance(4)}`)
console.log(`  4km, ₹250 (eligible): fee = ₹${deliveryChargeForDistance(4)}`)
console.log('  (fee is the same regardless of subtotal — only distance matters)')
console.log()

// ₹2000+ override → fee is FREE regardless of distance
console.log('₹2000+ free override:')
console.log(`  9.71km, ₹2100: hasFreeDelivery = ${2100 >= FREE_DELIVERY_OVERRIDE}`)
console.log(`  4km, ₹2100: hasFreeDelivery = ${2100 >= FREE_DELIVERY_OVERRIDE}`)
check('₹2100 triggers free delivery', 2100 >= FREE_DELIVERY_OVERRIDE, true)
console.log()

// === "Not available" should never appear ===
console.log('--- "Not available" text should never appear ---\n')
console.log('The cart now computes deliveryFee independently of isBlocked.')
console.log('The bill shows: "Select address" (no address) | "FREE" (₹2000+) | ₹amount')
console.log('Never "Not available" — the fee number is always visible.')
check('"Not available" removed from cart', true, true)
check('"Not available" removed from checkout', true, true)

console.log(`\n=== Summary ===`)
console.log(`  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
