import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdminAuthorized } from '@/lib/admin-guard'
import { slugify } from '@/lib/format'

// GET /api/admin/menu/categories — all categories (incl inactive)
export async function GET(req: NextRequest) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const cats = await db.category.findMany({
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { items: true } } },
  })
  return NextResponse.json({ categories: cats })
}

// POST /api/admin/menu/categories — create
export async function POST(req: NextRequest) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json()
  const name = String(body?.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 })
  const slug = body.slug ? slugify(body.slug) : slugify(name)
  const cat = await db.category.create({
    data: {
      name,
      slug,
      description: body.description ?? null,
      iconUrl: body.iconUrl ?? null,
      sortOrder: body.sortOrder ?? 0,
      isActive: body.isActive ?? true,
    },
  })
  return NextResponse.json({ category: cat })
}
