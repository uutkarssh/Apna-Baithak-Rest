// Verify the delivery-charge formula against the reference points.
// Uses CommonJS require() so we can load dotenv BEFORE constants.ts
// evaluates (ESM imports are hoisted, which would break the env-var
// read order). In the actual Next.js app, .env is loaded automatically
// by the framework at startup, so this test-only workaround isn't needed
// in production code.
import * as dotenv from 'dotenv'
dotenv.config({ path: '/home/z/my-project/apna-baithak/.env' })

// Force re-evaluation with env now set
const { RESTAURANT } = require('../src/lib/constants')
const {
  computeDeliveryCharge,
  deliveryChargeForDistance,
  freeDeliveryThreshold,
  remainingForFreeDelivery,
  isDistanceServiceable,
  roundToNearest5,
  rawDeliveryCharge,
} = require('../src/lib/delivery')

type Ref = {
  label: string
  distanceKm: number
  subtotal: number
  expectedCharge: number
  expectedFree: boolean
}

const refs: Ref[] = [
  { label: '1km, ₹140',   distanceKm: 1,   subtotal: 140, expectedCharge: 10, expectedFree: false },
  { label: '3km, ₹200',   distanceKm: 3,   subtotal: 200, expectedCharge: 20, expectedFree: false },
  { label: '5.5km, ₹280', distanceKm: 5.5, subtotal: 280, expectedCharge: 35, expectedFree: false },
  { label: '5.5km, ₹350', distanceKm: 5.5, subtotal: 350, expectedCharge: 0,  expectedFree: true  },
  { label: '8km, ₹400',   distanceKm: 8,   subtotal: 400, expectedCharge: 50, expectedFree: false },
  { label: '10km, ₹480',  distanceKm: 10,  subtotal: 480, expectedCharge: 60, expectedFree: false },
  { label: '10km, ₹520',  distanceKm: 10,  subtotal: 520, expectedCharge: 0,  expectedFree: true  },
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

console.log('=== Delivery-charge formula reference points ===')
console.log(`(RESTAURANT.deliveryRadiusKm = ${RESTAURANT.deliveryRadiusKm})\n`)

for (const r of refs) {
  const calc = computeDeliveryCharge(r.distanceKm, r.subtotal)
  console.log(`\n${r.label} (distance=${r.distanceKm}km, subtotal=₹${r.subtotal}):`)
  console.log(`  raw charge = ${rawDeliveryCharge(r.distanceKm).toFixed(2)}`)
  console.log(`  rounded    = ₹${deliveryChargeForDistance(r.distanceKm)}`)
  console.log(`  freeThreshold = ₹${calc.freeThreshold}`)
  console.log(`  isFree     = ${calc.isFree}`)
  console.log(`  finalCharge = ₹${calc.finalCharge}`)
  check(`charge for ${r.label}`, calc.finalCharge, r.expectedCharge)
  check(`isFree for ${r.label}`, calc.isFree, r.expectedFree)
}

console.log('\n\n=== 11km address rejection ===\n')
check('11km is serviceable', isDistanceServiceable(11), false)
check('10km is serviceable', isDistanceServiceable(10), true)
check('10.01km is serviceable', isDistanceServiceable(10.01), false)

console.log('\n\n=== Cart free-delivery messaging ===\n')

const r1 = remainingForFreeDelivery(1, 90)
check('remaining for ₹90 at 1km', r1, 60)

const r2 = remainingForFreeDelivery(1, 160)
check('remaining for ₹160 at 1km (should be 0 = unlocked)', r2, 0)

console.log('\n\n=== Round-to-nearest-5 spot checks ===\n')
check('roundToNearest5(21)', roundToNearest5(21), 20)
check('roundToNearest5(22.5)', roundToNearest5(22.5), 25)
check('roundToNearest5(43)', roundToNearest5(43), 45)
check('roundToNearest5(48)', roundToNearest5(48), 50)
check('roundToNearest5(10)', roundToNearest5(10), 10)
check('roundToNearest5(60)', roundToNearest5(60), 60)

console.log('\n\n=== Free-delivery threshold curve ===\n')
const thresholds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
for (const d of thresholds) {
  console.log(`  ${d}km → freeThreshold = ₹${Math.round(freeDeliveryThreshold(d))}`)
}

console.log('\n\n=== Delivery-charge curve ===\n')
for (const d of thresholds) {
  const raw = rawDeliveryCharge(d)
  const rounded = deliveryChargeForDistance(d)
  console.log(`  ${d}km → raw=₹${raw.toFixed(2)}  rounded=₹${rounded}`)
}

console.log(`\n\n=== Summary ===`)
console.log(`  ${passed} passed, ${failed} failed`)
if (failed > 0) {
  process.exit(1)
}
