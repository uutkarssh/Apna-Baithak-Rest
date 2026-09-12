'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type CartLine = {
  itemId: string
  name: string
  slug: string
  price: number
  imageUrl: string | null
  quantity: number
}

type CartState = {
  lines: CartLine[]
  addItem: (item: Omit<CartLine, 'quantity'>, qty?: number) => void
  removeItem: (itemId: string) => void
  setQty: (itemId: string, qty: number) => void
  increment: (itemId: string) => void
  decrement: (itemId: string) => void
  clear: () => void
  count: () => number
  subtotal: () => number
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      lines: [],
      addItem: (item, qty = 1) =>
        set((s) => {
          const existing = s.lines.find((l) => l.itemId === item.itemId)
          if (existing) {
            return {
              lines: s.lines.map((l) =>
                l.itemId === item.itemId ? { ...l, quantity: l.quantity + qty } : l
              ),
            }
          }
          return { lines: [...s.lines, { ...item, quantity: qty }] }
        }),
      removeItem: (itemId) =>
        set((s) => ({ lines: s.lines.filter((l) => l.itemId !== itemId) })),
      setQty: (itemId, qty) =>
        set((s) => ({
          lines:
            qty <= 0
              ? s.lines.filter((l) => l.itemId !== itemId)
              : s.lines.map((l) => (l.itemId === itemId ? { ...l, quantity: qty } : l)),
        })),
      increment: (itemId) =>
        set((s) => ({
          lines: s.lines.map((l) =>
            l.itemId === itemId ? { ...l, quantity: l.quantity + 1 } : l
          ),
        })),
      decrement: (itemId) =>
        set((s) => ({
          lines: s.lines
            .map((l) =>
              l.itemId === itemId ? { ...l, quantity: l.quantity - 1 } : l
            )
            .filter((l) => l.quantity > 0),
        })),
      clear: () => set({ lines: [] }),
      count: () => get().lines.reduce((n, l) => n + l.quantity, 0),
      subtotal: () => get().lines.reduce((s, l) => s + l.price * l.quantity, 0),
    }),
    {
      name: 'apna-baithak-cart',
      storage: createJSONStorage(() => localStorage),
    }
  )
)
