import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/menu/featured — public endpoint that returns items marked as
// featured (isFeatured=true), ordered by featuredOrder ascending.
//
// Used by the homepage "Featured Items" section. The admin controls which
// items appear here and in what order, via the admin panel's drag-and-drop
// featured-items manager (see /api/admin/menu/featured).
//
// Returns ALL featured items including those marked isAvailable=false (out
// of stock). Out-of-stock items remain visible so customers can see they
// exist — the frontend disables the ADD button and shows "Out of Stock".
// If zero items are featured, returns an empty array. The homepage handles
// this gracefully by hiding the Featured Items section entirely.
export async function GET() {
  const items = await db.menuItem.findMany({
    where: {
      isFeatured: true,
    },
    orderBy: [{ featuredOrder: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      price: true,
      isVeg: true,
      isAvailable: true,
      prepTimeMins: true,
      calories: true,
      rating: true,
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
      isAvailable: it.isAvailable,
      prepTimeMins: it.prepTimeMins,
      calories: it.calories,
      rating: it.rating,
      category: it.category,
      imageUrl: it.images[0]?.url ?? null,
    })),
  })
}
