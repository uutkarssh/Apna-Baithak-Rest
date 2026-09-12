import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdminAuthorized } from '@/lib/admin-guard'

// GET /api/admin/menu/featured — returns all items with isFeatured=true,
// ordered by featuredOrder ascending. Used by the admin panel's
// "Featured Items (drag to reorder)" list.
export async function GET(req: NextRequest) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const items = await db.menuItem.findMany({
    where: { isFeatured: true },
    orderBy: [{ featuredOrder: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      slug: true,
      price: true,
      isFeatured: true,
      featuredOrder: true,
      images: { orderBy: { sortOrder: 'asc' }, take: 1 },
    },
  })
  return NextResponse.json({ items })
}

// PATCH /api/admin/menu/featured — toggle an item's featured status OR
// reorder the featured items list.
//
// Body shapes:
//   { itemId: "...", isFeatured: true }   — mark as featured (appends to end)
//   { itemId: "...", isFeatured: false }  — unmark (clears featuredOrder, closes gap)
//   { orderedIds: ["id1", "id2", ...] }   — re-sequence all featured items
//                                           (sets featuredOrder 0, 1, 2, ... in order)
export async function PATCH(req: NextRequest) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))

  // === Reorder mode: { orderedIds: [...] } ===
  // Sets featuredOrder 0, 1, 2, ... for the given item IDs in the given order.
  // All items in the array MUST already be isFeatured=true (we don't auto-mark
  // them here — use the toggle mode first). Any currently-featured item NOT in
  // the array keeps its old featuredOrder (which may be stale, but the admin
  // UI always sends the complete list so this shouldn't happen in practice).
  if (Array.isArray(body?.orderedIds)) {
    const orderedIds: string[] = body.orderedIds
    if (orderedIds.length === 0) {
      return NextResponse.json({ ok: true, updated: 0 })
    }

    // Update each item's featuredOrder in sequence (0, 1, 2, ...)
    // Use a transaction so the reorder is atomic.
    await db.$transaction(
      orderedIds.map((id, index) =>
        db.menuItem.update({
          where: { id },
          data: { featuredOrder: index },
        })
      )
    )

    return NextResponse.json({ ok: true, updated: orderedIds.length })
  }

  // === Toggle mode: { itemId, isFeatured } ===
  const itemId = String(body?.itemId ?? '')
  if (!itemId) {
    return NextResponse.json({ error: 'itemId required' }, { status: 400 })
  }
  const isFeatured = Boolean(body?.isFeatured)

  const existing = await db.menuItem.findUnique({ where: { id: itemId } })
  if (!existing) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  }

  if (isFeatured) {
    // Marking as featured — append to the end of the current sequence.
    // Find the current max featuredOrder among featured items, +1.
    const maxOrder = await db.menuItem.aggregate({
      where: { isFeatured: true },
      _max: { featuredOrder: true },
    })
    const nextOrder = (maxOrder._max.featuredOrder ?? -1) + 1
    await db.menuItem.update({
      where: { id: itemId },
      data: { isFeatured: true, featuredOrder: nextOrder },
    })
  } else {
    // Unmarking — clear featuredOrder, then re-sequence the remaining
    // featured items to close the gap (0, 1, 2, ... with no holes).
    await db.menuItem.update({
      where: { id: itemId },
      data: { isFeatured: false, featuredOrder: null },
    })

    // Re-sequence remaining featured items
    const remaining = await db.menuItem.findMany({
      where: { isFeatured: true },
      orderBy: { featuredOrder: 'asc' },
      select: { id: true },
    })
    if (remaining.length > 0) {
      await db.$transaction(
        remaining.map((item, index) =>
          db.menuItem.update({
            where: { id: item.id },
            data: { featuredOrder: index },
          })
        )
      )
    }
  }

  return NextResponse.json({ ok: true, itemId, isFeatured })
}
