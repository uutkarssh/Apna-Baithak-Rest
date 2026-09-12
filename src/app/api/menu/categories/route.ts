import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/menu/categories — all active categories in sortOrder
export async function GET() {
  const cats = await db.category.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { items: { where: { isAvailable: true } } } } },
  })
  return NextResponse.json({
    categories: cats.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      iconUrl: c.iconUrl,
      description: c.description,
      sortOrder: c.sortOrder,
      itemCount: c._count.items,
    })),
  })
}
