// Shared types matching the API responses.
export type Category = {
  id: string
  name: string
  slug: string
  iconUrl: string | null
  description: string | null
  sortOrder: number
  itemCount?: number
}

export type MenuItem = {
  id: string
  name: string
  slug: string
  description: string | null
  price: number
  isVeg: boolean
  isAvailable: boolean
  prepTimeMins: number | null
  calories: number | null
  rating: number
  imageUrl: string | null
  category?: { name: string; slug: string }
  images?: string[]
}

export type Address = {
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

export type Order = {
  id: string
  orderNumber: string
  status: string
  paymentMode: string
  paymentStatus: string
  itemTotal: number
  handlingFee: number
  deliveryFee: number
  gstAndCharges: number
  totalAmount: number
  distanceKm: number | null
  addressLine: string
  notes: string | null
  rating: number | null
  review: string | null
  createdAt: string
  updatedAt: string
  items: {
    id: string
    itemId: string | null
    itemName: string
    itemPrice: number
    quantity: number
    imageUrl: string | null
  }[]
  history?: { status: string; note: string | null; createdAt: string }[]
}

export type Customer = {
  id: string
  email: string
  name: string | null
  phone: string | null
  avatarUrl?: string | null
}
