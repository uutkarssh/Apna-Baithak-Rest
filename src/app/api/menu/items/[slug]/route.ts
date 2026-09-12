import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/menu/items/[slug] — single item with all images + category
export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const item = await db.menuItem.findUnique({
    where: { slug },
    include: {
      category: { select: { name: true, slug: true } },
      images: { orderBy: { sortOrder: 'asc' } },
    },
  })
  if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  return NextResponse.json({
    item: {
      id: item.id,
      name: item.name,
      slug: item.slug,
      description: item.description,
      price: item.price,
      isVeg: item.isVeg,
      isAvailable: item.isAvailable,
      prepTimeMins: item.prepTimeMins,
      calories: item.calories,
      rating: item.rating,
      category: item.category,
      images: item.images.map((im) => im.url),
    },
  })
}
