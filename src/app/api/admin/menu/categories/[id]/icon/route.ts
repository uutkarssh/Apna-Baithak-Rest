import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdminAuthorized } from '@/lib/admin-guard'
import { getSupabaseServer } from '@/lib/supabase-server'

// POST /api/admin/menu/categories/[id]/icon
// multipart/form-data: field "file" (single 1:1 square image)
// Uploads the category's icon image to Supabase Storage (same `menu-items`
// bucket used for item images) and updates the category's `iconUrl` field.
// Returns the updated category.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await ctx.params
  const cat = await db.category.findUnique({ where: { id } })
  if (!cat) return NextResponse.json({ error: 'Category not found' }, { status: 404 })

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
  const path = `categories/${cat.slug || cat.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

  const supabase = getSupabaseServer()
  const buf = Buffer.from(await file.arrayBuffer())
  const { error: upErr } = await supabase.storage
    .from('menu-items')
    .upload(path, buf, { contentType: file.type, upsert: false })
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 })
  }
  const { data } = supabase.storage.from('menu-items').getPublicUrl(path)
  const iconUrl = data.publicUrl

  const updated = await db.category.update({
    where: { id },
    data: { iconUrl },
  })
  return NextResponse.json({ category: updated })
}
