import { NextRequest, NextResponse } from 'next/server'

/**
 * Admin authentication — hardcoded cookie check (Section 3.9 of the spec).
 *
 * The admin "session" is a single httpOnly + sameSite=strict cookie named
 * `ab_admin` with value `1`. There is no DB-backed session, no JWT, no
 * refresh token — the cookie itself IS the session. The admin credentials
 * (email + password) are hardcoded in src/lib/constants.ts via
 * ADMIN_CREDENTIALS (read from env vars ADMIN_EMAIL / ADMIN_PASSWORD).
 *
 * ────────────────────────────────────────────────────────────────────────
 * COOKIE LIFETIME (the auto-logout fix)
 * ────────────────────────────────────────────────────────────────────────
 *
 * Previously the cookie had maxAge=12h, which meant the admin was logged
 * out after 12 hours regardless of activity — even if they were actively
 * using the panel. The user reported this as "automatically logs out after
 * one day if no orders come in or the panel isn't opened".
 *
 * Fix: set maxAge to 10 years (effectively "forever") AND refresh the
 * cookie on every successful auth check (rolling refresh). This way:
 *
 *   - Active admin (opens the panel at least once every 10 years):
 *     cookie keeps getting bumped, never expires. Stays logged in until
 *     they explicitly click "Logout".
 *
 *   - Inactive admin (doesn't open the panel for 10 years):
 *     cookie finally expires, asked to log in again. Reasonable security
 *     baseline.
 *
 * The rolling refresh is implemented in /api/admin/stats — the endpoint
 * the admin-auth provider pings on every page load. Every successful
 * ping bumps the cookie's maxAge back to 10 years from "now".
 */

/** Cookie name. */
export const ADMIN_COOKIE_NAME = 'ab_admin'

/** Cookie value (opaque — just a flag). */
const ADMIN_COOKIE_VALUE = '1'

/**
 * Cookie maxAge in seconds — 10 years.
 *
 * 60 * 60 * 24 * 365 * 10 = 315,360,000 seconds ≈ 10 years.
 *
 * This is "effectively forever" — combined with rolling refresh on
 * /api/admin/stats, an active admin never has to re-login.
 */
export const ADMIN_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 10 // 10 years

/** Standard cookie options — httpOnly + sameSite=strict for CSRF + XSS safety. */
const ADMIN_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'strict' as const,
  maxAge: ADMIN_COOKIE_MAX_AGE,
  path: '/',
}

/**
 * Whether the request carries a valid admin cookie.
 * Used by every /api/admin/* route to gate access.
 */
export function isAdminAuthorized(req: NextRequest): boolean {
  const c = req.cookies.get(ADMIN_COOKIE_NAME)?.value
  return c === ADMIN_COOKIE_VALUE
}

/**
 * Set the admin cookie on a response — used at login time and on every
 * successful auth check (rolling refresh).
 *
 * The cookie is set with the same 10-year maxAge every time, so an active
 * admin's session never expires.
 */
export function setAdminCookie(res: NextResponse): NextResponse {
  res.cookies.set(ADMIN_COOKIE_NAME, ADMIN_COOKIE_VALUE, ADMIN_COOKIE_OPTIONS)
  return res
}

/**
 * Refresh the admin cookie on a response — alias for setAdminCookie().
 *
 * Kept as a separate export for readability at the call site (the meaning
 * is "bump the cookie's expiry because the admin just did something"), but
 * the implementation is identical to setAdminCookie().
 */
export function refreshAdminCookie(res: NextResponse): NextResponse {
  return setAdminCookie(res)
}

/**
 * Clear the admin cookie — used by the /api/admin/logout endpoint
 * (if/when one exists) and as a fallback for the frontend's
 * `document.cookie = 'ab_admin=; path=/; max-age=0'` trick.
 */
export function clearAdminCookie(res: NextResponse): NextResponse {
  res.cookies.set(ADMIN_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 0,
    path: '/',
  })
  return res
}
