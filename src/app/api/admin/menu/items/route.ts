import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdminAuthorized } from '@/lib/admin-guard'
import { slugify } from '@/lib/format'
import { MAX_ITEM_IMAGES } from '@/lib/constants'

// GET /api/admin/menu/items — all items
export async function GET(req: NextRequest) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const items = await db.menuItem.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { category: true, images: { orderBy: { sortOrder: 'asc' } } },
  })
  return NextResponse.json({ items })
}

// POST /api/admin/menu/items — create item (optionally with initial images[])
// body.images is an array of { dataUrl } OR { url }. Max MAX_ITEM_IMAGES.
export async function POST(req: NextRequest) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json()
  const name = String(body?.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 })
  if (body.price == null || Number(body.price) < 0) {
    return NextResponse.json({ error: 'Price required' }, { status: 400 })
  }
  const categoryId = String(body.categoryId ?? '')
  const category = await db.category.findUnique({ where: { id: categoryId } })
  if (!category) return NextResponse.json({ error: 'Category not found' }, { status: 400 })

  const slug = body.slug ? slugify(body.slug) : `${slugify(name)}-${Date.now().toString(36)}`

  const incoming: { url?: string; dataUrl?: string }[] = Array.isArray(body.images) ? body.images.slice(0, MAX_ITEM_IMAGES) : []
  const imageRows = incoming
    .map((im) => im.url || im.dataUrl)
    .filter((u): u is string => typeof u === 'string' && u.length > 0)
    .map((url, idx) => ({ url, sortOrder: idx }))

  const item = await db.menuItem.create({
    data: {
      name,
      slug,
      description: body.description ?? null,
      price: Math.round(Number(body.price)),
      categoryId,
      isAvailable: body.isAvailable ?? true,
      isVeg: body.isVeg ?? true,
      prepTimeMins: body.prepTimeMins ?? null,
      calories: body.calories ?? null,
      rating: body.rating ?? 4.2,
      sortOrder: body.sortOrder ?? 0,
      images: imageRows.length ? { create: imageRows } : undefined,
    },
    include: { images: true, category: true },
  })
  return NextResponse.json({ item })
}
