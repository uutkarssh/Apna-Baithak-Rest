import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdminAuthorized } from '@/lib/admin-guard'
import { slugify } from '@/lib/format'

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await ctx.params
  const body = await req.json()
  const cat = await db.category.findUnique({ where: { id } })
  if (!cat) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const updated = await db.category.update({
    where: { id },
    data: {
      name: body.name ?? cat.name,
      slug: body.slug ? slugify(body.slug) : cat.slug,
      description: body.description ?? cat.description,
      iconUrl: body.iconUrl ?? cat.iconUrl,
      sortOrder: body.sortOrder ?? cat.sortOrder,
      isActive: body.isActive ?? cat.isActive,
    },
  })
  return NextResponse.json({ category: updated })
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await ctx.params
  const cat = await db.category.findUnique({
    where: { id },
    include: { _count: { select: { items: true } } },
  })
  if (!cat) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Safety: refuse to delete a category that still has menu items assigned
  // to it. The admin must reassign or delete the items first. This prevents
  // accidental data loss (menu items would have their categoryId orphaned).
  if (cat._count.items > 0) {
    return NextResponse.json(
      {
        error: `Cannot delete "${cat.name}" — it still has ${cat._count.items} menu item${cat._count.items === 1 ? '' : 's'} assigned. Reassign or delete those items first.`,
        itemCount: cat._count.items,
      },
      { status: 409 }
    )
  }

  await db.category.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
