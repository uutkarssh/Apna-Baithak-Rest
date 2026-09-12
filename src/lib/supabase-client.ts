import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './supabase-types'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/**
 * Browser Supabase client (auth + storage).
 * Uses the @supabase/ssr cookie-based client so the session is stored in
 * cookies (not localStorage) — the server can then read the session
 * from the cookie jar on full page reloads, eliminating the
 * "log in again on every page" loop.
 *
 * Also enables auto session refresh and detection of OAuth redirects.
 */
let browserClient: ReturnType<typeof createBrowserClient<Database>> | null = null

export function getSupabaseBrowser() {
  if (browserClient) return browserClient
  browserClient = createBrowserClient<Database>(url, anon, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // storageKey is the cookie prefix used by @supabase/ssr
      storageKey: 'sb-apna-baithak-auth',
    },
  })
  return browserClient
}
