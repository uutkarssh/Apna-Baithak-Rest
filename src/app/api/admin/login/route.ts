import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_CREDENTIALS } from '@/lib/constants'

// POST /api/admin/login — hardcoded check (Section 3.9).
// NOT Supabase / NOT Turso. Issues a signed cookie the admin API routes check.
export async function POST(req: NextRequest) {
  const { email, password } = await req.json()
  if (
    String(email ?? '').toLowerCase().trim() === ADMIN_CREDENTIALS.email.toLowerCase() &&
    String(password ?? '') === ADMIN_CREDENTIALS.password
  ) {
    const res = NextResponse.json({ ok: true })
    // simple opaque token; the cookie is httpOnly & sameSite=strict
    res.cookies.set('ab_admin', '1', {
      httpOnly: true,
      sameSite: 'strict',
      maxAge: 60 * 60 * 12, // 12h
      path: '/',
    })
    return res
  }
  return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
}
