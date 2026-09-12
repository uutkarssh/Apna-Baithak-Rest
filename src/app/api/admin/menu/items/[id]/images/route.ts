import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdminAuthorized } from '@/lib/admin-guard'
import { getSupabaseServer } from '@/lib/supabase-server'
import { MAX_ITEM_IMAGES } from '@/lib/constants'

// POST /api/admin/menu/items/[id]/images
// multipart/form-data: field "file" (single image)
// Adds an image to the item; refuses if already MAX_ITEM_IMAGES images.
// Returns the new image row.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await ctx.params
  const item = await db.menuItem.findUnique({
    where: { id },
    include: { images: true },
  })
  if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

  if (item.images.length >= MAX_ITEM_IMAGES) {
    return NextResponse.json(
      { error: `Maximum ${MAX_ITEM_IMAGES} images per item.` },
      { status: 400 }
    )
  }

  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'File must be an image.' }, { status: 400 })
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'Image must be under 5MB.' }, { status: 400 })
  }

  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const path = `${item.slug || item.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

  const supabase = getSupabaseServer()
  const buf = Buffer.from(await file.arrayBuffer())
  const { error: upErr } = await supabase.storage
    .from('menu-items')
    .upload(path, buf, { contentType: file.type, upsert: false })
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 })
  }
  const { data } = supabase.storage.from('menu-items').getPublicUrl(path)
  const url = data.publicUrl

  const img = await db.menuItemImage.create({
    data: {
      itemId: id,
      url,
      sortOrder: item.images.length,
    },
  })
  return NextResponse.json({ image: img })
}
