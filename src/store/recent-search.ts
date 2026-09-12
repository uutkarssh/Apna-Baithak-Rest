'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

const MAX_RECENT = 8

type RecentSearchState = {
  recent: string[]
  add: (query: string) => void
  clear: () => void
  remove: (query: string) => void
}

export const useRecentSearch = create<RecentSearchState>()(
  persist(
    (set, get) => ({
      recent: [],
      add: (query) => {
        const q = query.trim()
        if (!q || q.length < 2) return
        set((s) => {
          // Remove duplicates, prepend, cap at MAX_RECENT
          const filtered = s.recent.filter((r) => r.toLowerCase() !== q.toLowerCase())
          return { recent: [q, ...filtered].slice(0, MAX_RECENT) }
        })
      },
      clear: () => set({ recent: [] }),
      remove: (query) =>
        set((s) => ({
          recent: s.recent.filter((r) => r !== query),
        })),
    }),
    {
      name: 'apna-baithak-recent-search',
      storage: createJSONStorage(() => localStorage),
    }
  )
)
