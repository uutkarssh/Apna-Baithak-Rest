/**
 * Test the location picker's distance/radius logic at various distances.
 *
 * The location-view-inner.tsx uses:
 *   const distKm = distanceFromRestaurant(pin[0], pin[1])
 *   const withinRadius = isWithinDeliveryRadius(pin[0], pin[1])
 *
 * isWithinDeliveryRadius() calls distanceFromRestaurant() and checks
 * <= RESTAURANT.deliveryRadiusKm (now 10).
 *
 * This test simulates pin positions at various distances from the restaurant
 * and verifies the badge text + save-button enable/disable behavior.
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '/home/z/my-project/apna-baithak/.env' })

const { RESTAURANT } = require('../src/lib/constants')
const {
  distanceFromRestaurant,
  isWithinDeliveryRadius,
  haversineKm,
} = require('../src/lib/geo')

let passed = 0
let failed = 0

function check(label: string, actual: unknown, expected: unknown) {
  const ok = actual === expected
  const status = ok ? 'PASS' : 'FAIL'
  console.log(`  [${status}] ${label}: actual=${actual} expected=${expected}`)
  if (ok) passed++
  else failed++
}

console.log('=== Location picker radius test ===')
console.log(`RESTAURANT.deliveryRadiusKm = ${RESTAURANT.deliveryRadiusKm}`)
console.log()

// Generate lat/lng points at specific distances from the restaurant.
// Move directly north (latitude increases by distance_km / 111.32).
function pointAtDistance(km: number): [number, number] {
  const lat = RESTAURANT.lat + km / 111.32
  const lng = RESTAURANT.lng
  return [lat, lng]
}

// Test scenarios from the task brief
const scenarios = [
  { km: 1, expectedWithin: true, expectedBadge: 'Within 10 km' },
  { km: 3, expectedWithin: true, expectedBadge: 'Within 10 km' },
  { km: 5, expectedWithin: true, expectedBadge: 'Within 10 km' },
  { km: 6, expectedWithin: true, expectedBadge: 'Within 10 km' },
  { km: 7, expectedWithin: true, expectedBadge: 'Within 10 km' },
  { km: 8, expectedWithin: true, expectedBadge: 'Within 10 km' },
  { km: 9.5, expectedWithin: true, expectedBadge: 'Within 10 km' },
  { km: 10, expectedWithin: true, expectedBadge: 'Within 10 km' }, // exactly at the boundary
  { km: 10.01, expectedWithin: false, expectedBadge: 'Outside delivery area' },
  { km: 11, expectedWithin: false, expectedBadge: 'Outside delivery area' },
  { km: 15, expectedWithin: false, expectedBadge: 'Outside delivery area' },
]

console.log('Testing pin positions at various distances from restaurant:')
console.log('(Restaurant is at lat=25.337698, lng=82.351485)')
console.log()

for (const s of scenarios) {
  const [lat, lng] = pointAtDistance(s.km)
  const distKm = distanceFromRestaurant(lat, lng)
  const within = isWithinDeliveryRadius(lat, lng)
  const badge = within ? `Within ${RESTAURANT.deliveryRadiusKm} km` : 'Outside delivery area'

  console.log(`${s.km}km from restaurant:`)
  console.log(`  Pin position: lat=${lat.toFixed(6)}, lng=${lng.toFixed(6)}`)
  console.log(`  Computed distance: ${distKm.toFixed(4)} km`)
  console.log(`  withinRadius: ${within}`)
  console.log(`  Badge text: "${badge}"`)
  console.log(`  Save button: ${within ? 'ENABLED' : 'DISABLED'}`)

  check(`  withinRadius at ${s.km}km`, within, s.expectedWithin)
  check(`  badge at ${s.km}km`, badge, s.expectedBadge)
  console.log()
}

console.log('=== Summary ===')
console.log(`  ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
