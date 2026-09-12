import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/menu/items?category=pizza            -> items in a category
// GET /api/menu/items?search=pizza               -> items matching a search query
// GET /api/menu/items                             -> all items (home featured rail)
export async function GET(req: NextRequest) {
  const cat = req.nextUrl.searchParams.get('category')
  const q = req.nextUrl.searchParams.get('search')?.trim()

  const where: any = { isAvailable: true }
  if (cat) where.category = { slug: cat }
  if (q) {
    // SQLite's `contains` uses LIKE which is case-insensitive for ASCII by
    // default, so searching "pizza" will match "Pizza", "PIZZA", etc.
    // (Note: mode: 'insensitive' is PostgreSQL-only and would crash on SQLite.)
    where.OR = [
      { name: { contains: q } },
      { description: { contains: q } },
    ]
  }

  const items = await db.menuItem.findMany({
    where,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: {
      category: { select: { name: true, slug: true } },
      images: { orderBy: { sortOrder: 'asc' }, take: 1 },
    },
  })

  return NextResponse.json({
    items: items.map((it) => ({
      id: it.id,
      name: it.name,
      slug: it.slug,
      description: it.description,
      price: it.price,
      isVeg: it.isVeg,
      prepTimeMins: it.prepTimeMins,
      calories: it.calories,
      rating: it.rating,
      category: it.category,
      imageUrl: it.images[0]?.url ?? null,
    })),
  })
}
