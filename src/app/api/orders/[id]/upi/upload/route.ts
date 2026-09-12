import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSupabaseForUser } from '@/lib/supabase-server'
import { uploadPaymentScreenshot, fetchImageAsBase64 } from '@/lib/storage'
import { verifyScreenshotWithGemini, runVerificationChecks } from '@/lib/gemini'
import { UPI_CONFIG } from '@/lib/upi'
import { notifyPaymentReceived, notifyPaymentPendingManual } from '@/lib/telegram'

// POST /api/orders/[id]/upi/upload
// multipart/form-data: field "screenshot" (image), field "attemptId" (string)
//
// Flow:
// 1. Validate the customer owns the order + the attempt is still within the
//    5-minute window.
// 2. Upload the screenshot to Supabase Storage → get public URL.
// 3. Fetch the image as base64 → call Gemini Vision for structured verification.
// 4. Run all 5 checks (authenticity, timestamp, amount, payee, UTR-reuse).
// 5a. If ALL pass → mark order PAID, store UTR + details, fire Telegram.
// 5b. If ANY fail → mark order PENDING_VERIFICATION, store screenshot +
//    Gemini result for admin review. Do NOT fire Telegram payment alert.
//
// If Gemini itself errors out (API key invalid, network, etc.), the order is
// marked PENDING_VERIFICATION so the admin can manually review — never block
// the customer on an infrastructure failure.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await getSupabaseForUser(req)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })
  }

  const customer = await db.customer.findUnique({ where: { supabaseUserId: user.id } })
  if (!customer) {
    return NextResponse.json({ error: 'Customer profile missing.' }, { status: 400 })
  }

  const { id: orderId } = await ctx.params
  const order = await db.order.findUnique({ where: { id: orderId } })
  if (!order) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  }
  if (order.customerId !== customer.id) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  }

  const form = await req.formData()
  const screenshot = form.get('screenshot') as File | null
  const attemptId = form.get('attemptId') as string | null

  if (!screenshot) {
    return NextResponse.json({ error: 'No screenshot provided.' }, { status: 400 })
  }
  if (!screenshot.type.startsWith('image/')) {
    return NextResponse.json({ error: 'File must be an image.' }, { status: 400 })
  }
  if (screenshot.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'Image must be under 5MB.' }, { status: 400 })
  }
  if (!attemptId) {
    return NextResponse.json({ error: 'Missing attemptId.' }, { status: 400 })
  }

  const attempt = await db.paymentAttempt.findUnique({ where: { id: attemptId } })
  if (!attempt || attempt.orderId !== orderId) {
    return NextResponse.json({ error: 'Invalid attempt.' }, { status: 400 })
  }

  // Check the 5-minute window hasn't expired
  const now = new Date()
  if (now.getTime() > attempt.expiresAt.getTime()) {
    await db.paymentAttempt.update({
      where: { id: attemptId },
      data: { status: 'EXPIRED' },
    })
    return NextResponse.json(
      { error: 'The 5-minute payment window has expired. Please try again.', expired: true },
      { status: 400 }
    )
  }

  // If this attempt was already used (screenshot already uploaded), reject
  if (attempt.status !== 'AWAITING_SCREENSHOT') {
    return NextResponse.json(
      { error: 'This payment attempt is no longer accepting uploads.' },
      { status: 400 }
    )
  }

  // 1. Upload screenshot to Supabase Storage
  let screenshotUrl: string
  try {
    screenshotUrl = await uploadPaymentScreenshot({
      orderId,
      attemptId,
      file: screenshot,
      mimeType: screenshot.type,
    })
  } catch (e) {
    console.error('[upi/upload] storage error:', e)
    return NextResponse.json({ error: 'Failed to save screenshot.' }, { status: 500 })
  }

  // Mark attempt as having received the screenshot (so it can't be reused)
  await db.paymentAttempt.update({
    where: { id: attemptId },
    data: {
      screenshotUrl,
      uploadedAt: now,
      status: 'PENDING_VERIFICATION',
    },
  })

  // 2. Fetch image as base64 for Gemini
  let geminiResult
  let geminiRaw = ''
  let geminiError: string | null = null
  try {
    const { base64, mimeType } = await fetchImageAsBase64(screenshotUrl)
    const r = await verifyScreenshotWithGemini({
      imageBase64: base64,
      mimeType,
      expectedAmount: order.totalAmount,
      expectedPayeeId: UPI_CONFIG.payeeId,
      expectedPayeeName: UPI_CONFIG.payeeName,
      serverTime: now,
    })
    geminiResult = r.result
    geminiRaw = r.raw
  } catch (e) {
    geminiError = (e as Error).message
    console.error('[upi/upload] gemini error:', geminiError)
  }

  // 3. Run the 5 checks (or skip if Gemini failed)
  let checks
  let failedChecks: string[]
  let allPassed: boolean

  if (geminiResult) {
    // Check UTR reuse across OTHER verified orders
    let utrReuse = false
    if (geminiResult.extracted_utr) {
      const existing = await db.paymentAttempt.findFirst({
        where: {
          geminiExtractedUtr: geminiResult.extracted_utr,
          status: 'VERIFIED',
          NOT: { id: attemptId },
        },
      })
      utrReuse = !!existing
    }

    checks = runVerificationChecks({
      gemini: geminiResult,
      expectedAmount: order.totalAmount,
      expectedPayeeId: UPI_CONFIG.payeeId,
      expectedPayeeName: UPI_CONFIG.payeeName,
      serverTime: now,
      utrReuse,
    })
    failedChecks = checks.failedChecks
    allPassed = failedChecks.length === 0
  } else {
    // Gemini failed — treat as pending verification (don't block customer)
    checks = null
    failedChecks = ['gemini_api_error']
    allPassed = false
  }

  // 4. Persist the Gemini result + checks to the attempt
  await db.paymentAttempt.update({
    where: { id: attemptId },
    data: {
      geminiIsAuthentic: geminiResult?.is_authentic ?? null,
      geminiExtractedTimestamp: geminiResult?.extracted_timestamp ?? null,
      geminiExtractedAmount: geminiResult?.extracted_amount ?? null,
      geminiExtractedPayee: geminiResult?.extracted_payee ?? null,
      geminiExtractedUtr: geminiResult?.extracted_utr ?? null,
      geminiConfidence: geminiResult?.confidence ?? null,
      geminiReasoning: geminiResult?.reasoning ?? geminiError,
      geminiRawResponse: geminiRaw,
      failedChecks: failedChecks.join(','),
      status: allPassed ? 'VERIFIED' : 'REJECTED',
      verifiedAt: allPassed ? now : null,
    },
  })

  // 5. Update the order based on outcome
  if (allPassed && geminiResult) {
    // SUCCESS — mark order as paid
    await db.order.update({
      where: { id: orderId },
      data: {
        upiStatus: 'PAID',
        paymentStatus: 'PAID',
        paymentReceived: true,
        paymentReceivedMethod: 'UPI',
        verifiedUtr: geminiResult.extracted_utr,
        upiScreenshotUrl: screenshotUrl,
        upiVerificationResult: JSON.stringify({
          is_authentic: geminiResult.is_authentic,
          extracted_timestamp: geminiResult.extracted_timestamp,
          extracted_amount: geminiResult.extracted_amount,
          extracted_payee: geminiResult.extracted_payee,
          extracted_utr: geminiResult.extracted_utr,
          confidence: geminiResult.confidence,
          reasoning: geminiResult.reasoning,
          failed_checks: [],
          verified_at: now.toISOString(),
          attempt_id: attemptId,
        }),
      },
    })

    // Fire the Telegram payment-received alert
    notifyPaymentReceived(orderId, geminiResult.extracted_utr).catch((e) =>
      console.error('[upi/upload] telegram notify error:', e)
    )

    return NextResponse.json({
      outcome: 'VERIFIED',
      message: 'Payment verified! Your order is confirmed.',
      attempt: { id: attemptId, status: 'VERIFIED' },
    })
  } else {
    // FAILURE — mark order as pending verification for admin review.
    // Fire a Telegram alert with inline Verify/Reject buttons so the admin
    // can act directly from Telegram in one tap.
    await db.order.update({
      where: { id: orderId },
      data: {
        upiStatus: 'PENDING_VERIFICATION',
        upiScreenshotUrl: screenshotUrl,
        upiVerificationResult: JSON.stringify({
          is_authentic: geminiResult?.is_authentic ?? null,
          extracted_timestamp: geminiResult?.extracted_timestamp ?? null,
          extracted_amount: geminiResult?.extracted_amount ?? null,
          extracted_payee: geminiResult?.extracted_payee ?? null,
          extracted_utr: geminiResult?.extracted_utr ?? null,
          confidence: geminiResult?.confidence ?? null,
          reasoning: geminiResult?.reasoning ?? geminiError,
          failed_checks: failedChecks,
          checked_at: now.toISOString(),
          attempt_id: attemptId,
        }),
      },
    })

    notifyPaymentPendingManual(orderId).catch((e) =>
      console.error('[upi/upload] telegram pending notify error:', e)
    )

    return NextResponse.json({
      outcome: 'PENDING_VERIFICATION',
      message:
        "We couldn't automatically verify your payment. Your order has been placed and is pending manual verification — our team will confirm shortly.",
      failedChecks,
      attempt: { id: attemptId, status: 'REJECTED' },
    })
  }
}
