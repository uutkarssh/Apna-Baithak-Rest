import { NextRequest, NextResponse } from 'next/server'

export function isAdminAuthorized(req: NextRequest): boolean {
  const c = req.cookies.get('ab_admin')?.value
  return c === '1'
}
