import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_CREDENTIALS } from '@/lib/constants'
import { setAdminCookie } from '@/lib/admin-guard'

// POST /api/admin/login — hardcoded check (Section 3.9).
// NOT Supabase / NOT Turso. Issues a signed cookie the admin API routes check.
//
// The cookie's maxAge is set by setAdminCookie() — currently 10 years
// (see src/lib/admin-guard.ts). Combined with rolling refresh on
// /api/admin/stats, an active admin never has to re-login. The admin
// is only logged out if they explicitly click "Logout" (frontend clears
// the cookie via /api/admin/logout) or they don't open the panel for
// 10 years.
export async function POST(req: NextRequest) {
  const { email, password } = await req.json()
  if (
    String(email ?? '').toLowerCase().trim() === ADMIN_CREDENTIALS.email.toLowerCase() &&
    String(password ?? '') === ADMIN_CREDENTIALS.password
  ) {
    const res = NextResponse.json({ ok: true })
    // setAdminCookie handles httpOnly + sameSite=strict + maxAge=10years
    setAdminCookie(res)
    return res
  }
  return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
}
