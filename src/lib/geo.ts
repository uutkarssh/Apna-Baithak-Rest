import { RESTAURANT } from './constants'
import { MIN_VALID_DISTANCE_KM } from './delivery'

/**
 * Haversine straight-line distance between two lat/lng points (km).
 * Used for the live 10km delivery-radius check.
 */
export function haversineKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): number {
  const R = 6371 // Earth radius (km)
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const lat1 = toRad(aLat)
  const lat2 = toRad(bLat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

function toRad(deg: number) {
  return (deg * Math.PI) / 180
}

/** Distance from a given point to the restaurant. */
export function distanceFromRestaurant(lat: number, lng: number): number {
  return haversineKm(lat, lng, RESTAURANT.lat, RESTAURANT.lng)
}

/** Whether the point is inside the delivery radius. */
export function isWithinDeliveryRadius(lat: number, lng: number): boolean {
  return distanceFromRestaurant(lat, lng) <= RESTAURANT.deliveryRadiusKm
}

/**
 * Whether the given lat/lng is PLAUSIBLY a customer location — i.e. not
 * the restaurant's own coordinates and not below the MIN_VALID_DISTANCE_KM
 * plausibility floor (50 m).
 *
 * Used by the frontend checkout / cart preview to detect "old bad saved
 * addresses" (created before the GPS-required fix) and force the customer
 * to re-pick their location before placing an order.
 */
export function isPlausibleCustomerLocation(lat: number, lng: number): boolean {
  // Cheap structural checks: NaN/undefined coords are not plausible.
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false
  // The restaurant's exact coordinates are NEVER a plausible customer location.
  if (lat === RESTAURANT.lat && lng === RESTAURANT.lng) return false
  // Distance check — pin must be at least MIN_VALID_DISTANCE_KM from the
  // restaurant.
  return distanceFromRestaurant(lat, lng) >= MIN_VALID_DISTANCE_KM
}

/**
 * Recompute the distance from a lat/lng pair to the restaurant.
 *
 * Used by the backend (address POST/PATCH, checkout POST) as the
 * SERVER-SIDE source of truth — we never trust the client's `distanceKm`
 * field. The client may be a malicious user, an outdated cached address,
 * or a browser whose geolocation failed silently and left the pin on the
 * restaurant (the AB-2026-0005 root cause).
 */
export function recomputeDistanceFromRestaurant(lat: number, lng: number): number {
  return distanceFromRestaurant(lat, lng)
}

/** Reverse-geocode a lat/lng to a human address using Nominatim (free, no key). */
export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      { headers: { 'User-Agent': 'ApnaBaithak/1.0 (apna-baithak web)' } }
    )
    if (!res.ok) return ''
    const data = await res.json()
    return data.display_name || ''
  } catch {
    return ''
  }
}

/** Forward-geocode a text query to a list of {lat, lon, label} using Nominatim. */
export async function geocode(
  query: string
): Promise<{ lat: number; lon: number; label: string }[]> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(
        query
      )}&limit=5&addressdetails=1`,
      { headers: { 'User-Agent': 'ApnaBaithak/1.0 (apna-baithak web)' } }
    )
    if (!res.ok) return []
    const data = (await res.json()) as any[]
    return data.map((d) => ({ lat: Number(d.lat), lon: Number(d.lon), label: d.display_name }))
  } catch {
    return []
  }
}
