'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type FavoriteItem = {
  id: string
  name: string
  slug: string
  price: number
  imageUrl: string | null
}

type FavoritesState = {
  favorites: FavoriteItem[]
  toggle: (item: FavoriteItem) => void
  isFavorite: (id: string) => boolean
  count: () => number
  clear: () => void
}

export const useFavorites = create<FavoritesState>()(
  persist(
    (set, get) => ({
      favorites: [],
      toggle: (item) =>
        set((s) => {
          const existing = s.favorites.find((f) => f.id === item.id)
          if (existing) {
            return { favorites: s.favorites.filter((f) => f.id !== item.id) }
          }
          return { favorites: [...s.favorites, item] }
        }),
      isFavorite: (id) => !!get().favorites.find((f) => f.id === id),
      count: () => get().favorites.length,
      clear: () => set({ favorites: [] }),
    }),
    {
      name: 'apna-baithak-favorites',
      storage: createJSONStorage(() => localStorage),
    }
  )
)
