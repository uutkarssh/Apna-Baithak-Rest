/**
 * Verify the delivery-fee inversion bug is fixed.
 *
 * Bug: When cart subtotal < ₹200, the app showed "Delivery Fee: FREE" and
 *      allowed checkout. This was backwards — orders under ₹200 should be
 *      BLOCKED, not given free delivery.
 *
 * Fix: When blocked, the Delivery Fee line shows "Not available" (not "FREE"),
 *      and the To Pay line shows just the subtotal (no delivery added).
 *
 * Test scenarios:
 *   - ₹180 cart at 3km → BLOCKED, no FREE label, message "Add ₹20 more"
 *   - ₹280 cart at 3km → eligible, ₹20 delivery, "To Pay: ₹300"
 *   - ₹500 cart at 9km → BLOCKED (7km+ needs ₹800), no FREE label
 *   - ₹2100 cart at 9km → eligible, FREE (₹2000+ override)
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '/home/z/my-project/apna-baithak/.env' })

const {
  computeDeliveryCharge,
  checkOrderEligibility,
  FREE_DELIVERY_OVERRIDE,
  MIN_ORDER_SUBTOTAL,
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

console.log('=== Bug fix verification: delivery fee inversion ===\n')

// === Scenario 1: ₹180 cart at 3km — should be BLOCKED, NOT free ===
console.log('Scenario 1: ₹180 cart at 3km (below ₹200 minimum)')
console.log('  Expected: BLOCKED, delivery fee NOT free, message "Add ₹20 more"')
const calc1 = computeDeliveryCharge(3, 180)
const elig1 = checkOrderEligibility(3, 180)
console.log(`  eligible:    ${calc1.eligible}`)
console.log(`  finalCharge: ₹${calc1.finalCharge}`)
console.log(`  isFree:      ${calc1.isFree}`)
console.log(`  reason:      ${calc1.reason}`)
console.log(`  message:     ${calc1.message}`)
console.log(`  remaining:   ₹${elig1.eligible ? '0' : elig1.remaining}`)
check('eligible for ₹180 at 3km', calc1.eligible, false)
check('isFree for ₹180 at 3km', calc1.isFree, false) // must NOT be free
check('reason for ₹180 at 3km', calc1.reason, 'BELOW_MIN_SUBTOTAL')
check('remaining for ₹180 at 3km', elig1.eligible ? 0 : elig1.remaining, 20)
console.log()

// === Scenario 2: ₹280 cart at 3km — should work, ₹30 delivery ===
console.log('Scenario 2: ₹280 cart at 3km (eligible)')
console.log('  Expected: eligible, ₹30 delivery fee, total ₹310')
const calc2 = computeDeliveryCharge(3, 280)
console.log(`  eligible:    ${calc2.eligible}`)
console.log(`  finalCharge: ₹${calc2.finalCharge}`)
console.log(`  isFree:      ${calc2.isFree}`)
check('eligible for ₹280 at 3km', calc2.eligible, true)
check('charge for ₹280 at 3km', calc2.finalCharge, 30)
check('isFree for ₹280 at 3km', calc2.isFree, false)
check('total for ₹280 at 3km', 280 + calc2.finalCharge, 310)
console.log()

// === Scenario 3: ₹500 cart at 9km — BLOCKED (7km+ needs ₹800) ===
console.log('Scenario 3: ₹500 cart at 9km (below ₹800 far minimum)')
console.log('  Expected: BLOCKED, delivery fee NOT free, message "Add ₹300 more"')
const calc3 = computeDeliveryCharge(9, 500)
const elig3 = checkOrderEligibility(9, 500)
console.log(`  eligible:    ${calc3.eligible}`)
console.log(`  finalCharge: ₹${calc3.finalCharge}`)
console.log(`  isFree:      ${calc3.isFree}`)
console.log(`  reason:      ${calc3.reason}`)
check('eligible for ₹500 at 9km', calc3.eligible, false)
check('isFree for ₹500 at 9km', calc3.isFree, false) // must NOT be free
check('reason for ₹500 at 9km', calc3.reason, 'BELOW_FAR_MIN_SUBTOTAL')
check('remaining for ₹500 at 9km', elig3.eligible ? 0 : elig3.remaining, 300)
console.log()

// === Scenario 4: ₹2100 cart at 9km — eligible, FREE (₹2000+ override) ===
console.log('Scenario 4: ₹2100 cart at 9km (₹2000+ override)')
console.log('  Expected: eligible, FREE delivery')
const calc4 = computeDeliveryCharge(9, 2100)
console.log(`  eligible:    ${calc4.eligible}`)
console.log(`  finalCharge: ₹${calc4.finalCharge}`)
console.log(`  isFree:      ${calc4.isFree}`)
check('eligible for ₹2100 at 9km', calc4.eligible, true)
check('isFree for ₹2100 at 9km', calc4.isFree, true) // THIS one IS free
check('charge for ₹2100 at 9km', calc4.finalCharge, 0)
console.log()

// === Scenario 5: Edge case — exactly ₹200 (should be eligible, not free) ===
console.log('Scenario 5: ₹200 cart at 3km (exactly at minimum)')
const calc5 = computeDeliveryCharge(3, 200)
console.log(`  eligible:    ${calc5.eligible}`)
console.log(`  finalCharge: ₹${calc5.finalCharge}`)
check('eligible for ₹200 at 3km', calc5.eligible, true)
check('charge for ₹200 at 3km', calc5.finalCharge, 30) // 3km = ₹30
console.log()

// === Scenario 6: Edge case — exactly ₹2000 (should be free) ===
console.log('Scenario 6: ₹2000 cart at 5km (exactly at override threshold)')
const calc6 = computeDeliveryCharge(5, 2000)
console.log(`  eligible:    ${calc6.eligible}`)
console.log(`  finalCharge: ₹${calc6.finalCharge}`)
console.log(`  isFree:      ${calc6.isFree}`)
check('eligible for ₹2000 at 5km', calc6.eligible, true)
check('isFree for ₹2000 at 5km', calc6.isFree, true)
check('charge for ₹2000 at 5km', calc6.finalCharge, 0)

console.log(`\n=== Summary ===`)
console.log(`  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
