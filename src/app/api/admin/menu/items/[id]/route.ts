import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdminAuthorized } from '@/lib/admin-guard'
import { slugify } from '@/lib/format'
import { MAX_ITEM_IMAGES } from '@/lib/constants'
import { getSupabaseServer } from '@/lib/supabase-server'

// GET single item (admin) — with all images + category
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await ctx.params
  const item = await db.menuItem.findUnique({
    where: { id },
    include: { category: true, images: { orderBy: { sortOrder: 'asc' } } },
  })
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ item })
}

// PATCH — update fields + optionally replace images (when body.images provided)
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await ctx.params
  const existing = await db.menuItem.findUnique({
    where: { id },
    include: { images: true },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()

  const data: any = {}
  if (body.name != null) {
    data.name = String(body.name).trim()
    data.slug = body.slug ? slugify(body.slug) : existing.slug
  }
  if (body.description != null) data.description = body.description
  if (body.price != null) data.price = Math.round(Number(body.price))
  if (body.categoryId != null) data.categoryId = body.categoryId
  if (body.isAvailable != null) data.isAvailable = body.isAvailable
  if (body.isVeg != null) data.isVeg = body.isVeg
  if (body.prepTimeMins != null) data.prepTimeMins = body.prepTimeMins
  if (body.calories != null) data.calories = body.calories
  if (body.rating != null) data.rating = body.rating
  if (body.sortOrder != null) data.sortOrder = body.sortOrder

  // Replace images if provided (delete old + create new, capped at MAX_ITEM_IMAGES)
  if (Array.isArray(body.images)) {
    // delete existing image rows
    await db.menuItemImage.deleteMany({ where: { itemId: id } })
    const incoming = body.images
      .slice(0, MAX_ITEM_IMAGES)
      .map((im: any) => im.url || im.dataUrl)
      .filter(Boolean)
    if (incoming.length) {
      data.images = {
        create: incoming.map((url: string, idx: number) => ({ url, sortOrder: idx })),
      }
    }
  }

  const updated = await db.menuItem.update({
    where: { id },
    data,
    include: { images: { orderBy: { sortOrder: 'asc' } }, category: true },
  })
  return NextResponse.json({ item: updated })
}

// DELETE item (cascades to images; order_items.itemId is set null for history)
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await ctx.params
  // delete any stored images from Supabase storage first
  const images = await db.menuItemImage.findMany({ where: { itemId: id } })
  if (images.length) {
    const supabase = getSupabaseServer()
    const paths = images
      .map((im) => {
        try {
          const u = new URL(im.url)
          const parts = u.pathname.split('/storage/v1/object/public/menu-items/')
          return parts[1] ?? null
        } catch {
          return null
        }
      })
      .filter(Boolean) as string[]
    if (paths.length) {
      await supabase.storage.from('menu-items').remove(paths)
    }
  }
  await db.menuItem.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
