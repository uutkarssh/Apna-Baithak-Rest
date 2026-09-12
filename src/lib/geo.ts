import { RESTAURANT } from './constants'

/**
 * Haversine straight-line distance between two lat/lng points (km).
 * Used for the live 5km delivery-radius check (spec Section 3.7).
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
