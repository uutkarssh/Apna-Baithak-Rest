import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { Database } from './supabase-types'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/**
 * Server-side Supabase client using the service role key.
 * ONLY import this from server code (api routes, server components).
 * Bypasses RLS — used for admin operations and storage uploads.
 */
export function getSupabaseServer() {
  const url = process.env.SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * Create a Supabase client for a Route Handler that reads the user's
 * session from cookies (set by the @supabase/ssr browser client so the
 * session survives full page reloads) and falls back to the
 * Authorization header if present.
 *
 * Next.js 16: cookies() returns a Promise — must be awaited.
 */
export async function getSupabaseForUser(req: Request) {
  // 1. Try Authorization header (still supported for backward compat)
  const authHeader = req.headers.get('authorization') || ''
  let accessToken: string | null = null
  if (authHeader.startsWith('Bearer ')) {
    accessToken = authHeader.slice(7)
  }

  // 2. Read the cookie jar (set by @supabase/ssr browser client)
  const cookieStore = await cookies()
  const allCookies = cookieStore.getAll()

  // If we have an explicit Bearer token, build a client with that header
  if (accessToken) {
    return createClient<Database>(url, anon, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    })
  }

  // Otherwise use the @supabase/ssr cookie-based client (auto-reads cookies)
  return createServerClient<Database>(url, anon, {
    cookies: {
      getAll() {
        return allCookies
      },
      setAll(cookiesToSet) {
        // In a Route Handler we cannot set cookies from this helper,
        // but the browser client manages them on the client side.
        // We just need to read them here.
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        } catch {
          // ignore — server components can't set cookies
        }
      },
    },
  })
}
