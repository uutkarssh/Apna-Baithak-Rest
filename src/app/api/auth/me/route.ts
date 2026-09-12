import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSupabaseForUser } from '@/lib/supabase-server'
import { getSupabaseServer } from '@/lib/supabase-server'

function normalizeIndianMobile(value: string) {
  let digits = String(value).replace(/\D/g, '')
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2)
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1)
  return digits
}

export async function GET(req: Request) {
  const supabase = await getSupabaseForUser(req)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ profile: null, session: null })

  let customer = await db.customer.findUnique({ where: { supabaseUserId: user.id } })
  if (!customer && user.email) {
    const existingByEmail = await db.customer.findUnique({ where: { email: user.email } })
    if (existingByEmail) {
      customer = await db.customer.update({ where: { id: existingByEmail.id }, data: { supabaseUserId: user.id } })
    }
  }
  if (!customer) {
    const email = user.email ?? ''
    const name = (user.user_metadata?.full_name as string) || (user.user_metadata?.name as string) || (email ? email.split('@')[0] : 'Guest')
    const phone = (user.user_metadata?.phone as string) ?? null
    const avatarUrl = (user.user_metadata?.avatar_url as string) ?? null
    customer = await db.customer.create({ data: { supabaseUserId: user.id, email, name, phone, avatarUrl } })
  } else {
    const name = (user.user_metadata?.full_name as string) || (user.user_metadata?.name as string) || customer.name
    const phone = (user.user_metadata?.phone as string) ?? customer.phone
    const avatarUrl = (user.user_metadata?.avatar_url as string) ?? customer.avatarUrl
    if (name !== customer.name || phone !== customer.phone || avatarUrl !== customer.avatarUrl) {
      customer = await db.customer.update({ where: { id: customer.id }, data: { name, phone, avatarUrl } })
    }
  }

  return NextResponse.json({ profile: { id: customer.id, email: customer.email, name: customer.name, phone: customer.phone, avatarUrl: customer.avatarUrl } })
}

export async function PATCH(req: Request) {
  const supabase = await getSupabaseForUser(req)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { name, phone } = body as { name?: string; phone?: string }
  const updates: { name?: string; phone?: string } = {}

  if (name !== undefined) {
    const trimmed = String(name).trim()
    if (!trimmed) return NextResponse.json({ error: 'Name cannot be empty.' }, { status: 400 })
    if (trimmed.length > 100) return NextResponse.json({ error: 'Name is too long (max 100 characters).' }, { status: 400 })
    updates.name = trimmed
  }

  if (phone !== undefined) {
    const digits = normalizeIndianMobile(phone)
    if (!/^[6-9]\d{9}$/.test(digits)) {
      return NextResponse.json({ error: 'Please enter a valid 10-digit Indian mobile number.' }, { status: 400 })
    }
    updates.phone = `+91 ${digits}`
  }

  if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'No fields to update.' }, { status: 400 })

  const supabaseAdmin = getSupabaseServer()
  const { error: supaErr } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
    user_metadata: {
      ...(updates.name != null ? { full_name: updates.name } : {}),
      ...(updates.phone != null ? { phone: updates.phone } : {}),
    },
  })
  if (supaErr) return NextResponse.json({ error: `Failed to update profile: ${supaErr.message}` }, { status: 500 })

  let customer = await db.customer.findUnique({ where: { supabaseUserId: user.id } })
  if (!customer && user.email) customer = await db.customer.findUnique({ where: { email: user.email } })
  if (!customer) return NextResponse.json({ error: 'Customer profile not found.' }, { status: 404 })

  customer = await db.customer.update({ where: { id: customer.id }, data: updates })
  return NextResponse.json({ profile: { id: customer.id, email: customer.email, name: customer.name, phone: customer.phone, avatarUrl: customer.avatarUrl } })
}
