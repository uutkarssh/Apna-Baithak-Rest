import { NextRequest, NextResponse } from 'next/server'
import { clearAdminCookie, isAdminAuthorized } from '@/lib/admin-guard'

// POST /api/admin/logout — clear the admin cookie.
//
// The frontend's admin-auth provider (src/components/admin/admin-auth.tsx)
// calls this when the admin clicks "Logout". The server sets the cookie's
// maxAge to 0, which causes the browser to delete it on the response.
//
// Returns 200 even if the request wasn't authenticated — clearing a cookie
// that's already gone is a no-op, and returning 401 here would prevent
// the frontend from cleaning up its in-memory `authed` state.
export async function POST(req: NextRequest) {
  // Optional: short-circuit if the request had no admin cookie at all.
  // We don't bother — clearing a missing cookie is harmless.
  const _wasAuthed = isAdminAuthorized(req)
  void _wasAuthed

  const res = NextResponse.json({ ok: true })
  clearAdminCookie(res)
  return res
}
