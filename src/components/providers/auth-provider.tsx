'use client'

import { useEffect, useState, useCallback, createContext, useContext, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Session, User } from '@supabase/supabase-js'
import { getSupabaseBrowser } from '@/lib/supabase-client'

type CustomerProfile = {
  id: string
  email: string
  name: string | null
  phone: string | null
  avatarUrl?: string | null
}

type AuthCtx = {
  session: Session | null
  user: User | null
  profile: CustomerProfile | null
  loading: boolean
  profileLoading: boolean
  isAuthed: boolean
  signInWithEmail: (email: string, password: string) => Promise<{ error: string | null }>
  signUpWithEmail: (email: string, password: string, name: string, phone: string) => Promise<{ error: string | null }>
  signInWithGoogle: () => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  updateProfile: (data: { name?: string; phone?: string }) => Promise<{ error: string | null }>
}

const Ctx = createContext<AuthCtx | null>(null)

const AUTH_SCOPED_QUERY_KEYS = [
  ['addresses'],
  ['orders'],
  ['restaurant-rating'],
]

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = getSupabaseBrowser()
  const qc = useQueryClient()

  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<CustomerProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(false)

  const lastTokenRef = useRef<string | null>(null)
  const mountedRef = useRef(true)
  const inFlightRef = useRef(false)

  const refreshProfile = useCallback(async () => {
    if (!mountedRef.current || inFlightRef.current) return
    inFlightRef.current = true
    try {
      const { data } = await supabase.auth.getSession()
      if (!mountedRef.current) return
      const s = data.session
      setSession(s)
      if (!s?.user) {
        setProfile(null)
        lastTokenRef.current = null
        return
      }
      if (lastTokenRef.current === s.access_token) return
      lastTokenRef.current = s.access_token
      setProfileLoading(true)
      try {
        const res = await fetch('/api/auth/me', {
          cache: 'no-store',
          headers: { Authorization: `Bearer ${s.access_token}` },
        })
        if (!mountedRef.current) return
        if (res.ok) {
          const json = await res.json()
          setProfile(json.profile ?? null)
        } else {
          setProfile(null)
        }
      } catch {
        if (mountedRef.current) setProfile(null)
      } finally {
        if (mountedRef.current) setProfileLoading(false)
      }
    } finally {
      inFlightRef.current = false
    }
  }, [supabase])

  useEffect(() => {
    mountedRef.current = true
    let cancelled = false

    ;(async () => {
      try {
        const { data } = await supabase.auth.getSession()
        if (cancelled) return
        setSession(data.session)
        // Do not block the entire application on the customer mirror fetch.
        // Session state is enough to consider the user authenticated; profile
        // hydration continues in the background.
        if (data.session) {
          lastTokenRef.current = null
          void refreshProfile()
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (cancelled) return
      setSession(s)
      if (s) {
        lastTokenRef.current = null
        void refreshProfile()
        AUTH_SCOPED_QUERY_KEYS.forEach((key) => {
          qc.invalidateQueries({ queryKey: key })
        })
      } else {
        setProfile(null)
        lastTokenRef.current = null
        AUTH_SCOPED_QUERY_KEYS.forEach((key) => {
          qc.removeQueries({ queryKey: key })
        })
      }
      setLoading(false)
    })

    return () => {
      cancelled = true
      mountedRef.current = false
      sub.subscription.unsubscribe()
    }
  }, [supabase, refreshProfile, qc])

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) return { error: error.message }
      // SIGNED_IN listener updates session/profile and invalidates auth caches.
      // Never wait for the secondary customer-profile request here.
      return { error: null }
    },
    [supabase]
  )

  const signUpWithEmail = useCallback(
    async (email: string, password: string, name: string, phone: string) => {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name, phone } },
      })
      if (error) return { error: error.message }
      return { error: null }
    },
    [supabase]
  )

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/` : undefined,
      },
    })
    if (error) return { error: error.message }
    return { error: null }
  }, [supabase])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
    lastTokenRef.current = null
    AUTH_SCOPED_QUERY_KEYS.forEach((key) => {
      qc.removeQueries({ queryKey: key })
    })
  }, [supabase, qc])

  const updateProfile = useCallback(
    async (data: { name?: string; phone?: string }): Promise<{ error: string | null }> => {
      try {
        const { data: sessData } = await supabase.auth.getSession()
        const token = sessData.session?.access_token
        const res = await fetch('/api/auth/me', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(data),
        })
        const json = await res.json()
        if (!res.ok) return { error: json.error || 'Failed to update profile' }
        if (json.profile) setProfile(json.profile)
        return { error: null }
      } catch (e: any) {
        return { error: e.message || 'Failed to update profile' }
      }
    },
    [supabase]
  )

  return (
    <Ctx.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        loading,
        profileLoading,
        isAuthed: !!session,
        signInWithEmail,
        signUpWithEmail,
        signInWithGoogle,
        signOut,
        refreshProfile,
        updateProfile,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
