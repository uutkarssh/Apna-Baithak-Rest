// Supabase Storage helper for uploading UPI payment screenshots.
//
// Uploads to the `media` bucket (already exists, public, 5MB limit) under the
// path `payment-screenshots/{orderId}/{attemptId}-{timestamp}.{ext}`.
// Returns the public URL for the uploaded file.
//
// Server-side ONLY — uses the service role key.

import { getSupabaseServer } from './supabase-server'

const BUCKET = 'media'

export async function uploadPaymentScreenshot(params: {
  orderId: string
  attemptId: string
  file: File | Buffer
  mimeType: string
}): Promise<string> {
  const { orderId, attemptId, file, mimeType } = params
  const supabase = getSupabaseServer()

  const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg'
  const path = `payment-screenshots/${orderId}/${attemptId}-${Date.now()}.${ext}`

  const buf = file instanceof File ? Buffer.from(await file.arrayBuffer()) : file

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, buf, { contentType: mimeType, upsert: false })

  if (upErr) {
    throw new Error(`Storage upload failed: ${upErr.message}`)
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}

/**
 * Convert a public Supabase storage URL back to base64 for the Gemini API call.
 * Gemini needs the image as base64 inline data.
 */
export async function fetchImageAsBase64(url: string): Promise<{ base64: string; mimeType: string }> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to fetch image: ${res.status}`)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  const mimeType = res.headers.get('content-type') || 'image/jpeg'
  return { base64: buf.toString('base64'), mimeType }
}
