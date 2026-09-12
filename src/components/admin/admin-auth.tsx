'use client'

import { useState, useEffect, createContext, useContext, useCallback } from 'react'
import { useRouter } from 'next/navigation'

type AdminSession = { ok: boolean } | null

const Ctx = createContext<{
  authed: boolean
  login: (email: string, password: string) => Promise<{ error: string | null }>
  logout: () => Promise<void>
  loading: boolean
} | null>(null)

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState(false)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    // ping stats endpoint to check cookie validity
    fetch('/api/admin/stats')
      .then((r) => setAuthed(r.ok))
      .catch(() => setAuthed(false))
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      return { error: j.error || 'Invalid credentials' }
    }
    setAuthed(true)
    return { error: null }
  }, [])

  const logout = useCallback(async () => {
    // clear cookie by setting maxAge 0
    document.cookie = 'ab_admin=; path=/; max-age=0'
    setAuthed(false)
    router.refresh()
  }, [router])

  return (
    <Ctx.Provider value={{ authed, login, logout, loading }}>{children}</Ctx.Provider>
  )
}

export function useAdminAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider')
  return ctx
}
