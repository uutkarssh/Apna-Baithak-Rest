import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  answerCallbackQuery,
  editTelegramMessage,
  notifyPaymentReceived,
  sendTelegramMessage,
} from '@/lib/telegram'

// POST /api/telegram/webhook
// Telegram Bot webhook receiver. Handles callback_query events (inline button
// presses) from the Verify/Reject buttons sent on pending-verification orders.
//
// Callback data format:
//   verify:<orderId>  — admin tapped "✅ Verify Payment"
//   reject:<orderId>  — admin tapped "❌ Reject"
//
// On verify: marks the order PAID (paymentReceived=true, method=UPI), fires
//   the payment-received Telegram alert, and edits the original message to
//   show "✅ Verified".
// On reject: keeps the order PENDING_VERIFICATION (flagged for follow-up) and
//   edits the original message to show "❌ Rejected".
//
// NOTE: This webhook is secured by a secret token in the URL path (set via
// TELEGRAM_WEBHOOK_SECRET env var). Telegram sends this back in the
// X-Telegram-Bot-Api-Secret-Token header on every webhook request.
export async function POST(req: NextRequest) {
  // Verify the secret token — FAIL-CLOSED for security.
  // If TELEGRAM_WEBHOOK_SECRET is not set, reject ALL requests (anyone could
  // hit the webhook and mark orders as paid). The secret MUST be configured
  // and must match the X-Telegram-Bot-Api-Secret-Token header Telegram sends.
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!expectedSecret) {
    console.error('[telegram-webhook] TELEGRAM_WEBHOOK_SECRET is not configured — rejecting request. Set this env var and register the webhook with Telegram using the same secret.')
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 503 })
  }
  const received = req.headers.get('x-telegram-bot-api-secret-token')
  if (received !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))

  // Handle callback_query (inline button press)
  if (body.callback_query) {
    const cb = body.callback_query
    const callbackId = cb.id
    const data: string = cb.data || ''
    const chatId = String(cb.message?.chat?.id ?? '')
    const messageId = cb.message?.message_id

    const [action, orderId] = data.split(':')
    if (!orderId || (action !== 'verify' && action !== 'reject')) {
      await answerCallbackQuery(callbackId, 'Unknown action')
      return NextResponse.json({ ok: true })
    }

    const order = await db.order.findUnique({ where: { id: orderId } })
    if (!order) {
      await answerCallbackQuery(callbackId, 'Order not found')
      return NextResponse.json({ ok: true })
    }

    if (action === 'verify') {
      // Only allow verify if the order is actually pending
      if (order.upiStatus !== 'PENDING_VERIFICATION') {
        await answerCallbackQuery(callbackId, `Already ${order.upiStatus}`)
        return NextResponse.json({ ok: true })
      }

      const now = new Date()
      await db.order.update({
        where: { id: orderId },
        data: {
          upiStatus: 'PAID',
          paymentStatus: 'PAID',
          paymentReceived: true,
          paymentReceivedMethod: 'UPI',
        },
      })

      // Mark the latest attempt as VERIFIED
      const latest = await db.paymentAttempt.findFirst({
        where: { orderId },
        orderBy: { attemptNumber: 'desc' },
      })
      if (latest) {
        await db.paymentAttempt.update({
          where: { id: latest.id },
          data: {
            status: 'VERIFIED',
            verifiedAt: now,
            adminReviewedBy: 'telegram',
            adminReviewedAt: now,
            adminNote: 'Verified via Telegram button',
          },
        })
      }

      await answerCallbackQuery(callbackId, '✅ Payment verified — order marked as Paid')

      // Edit the original message to show the verified status
      if (messageId) {
        await editTelegramMessage(
          chatId,
          messageId,
          `✅ <b>Payment Verified — ${order.orderNumber}</b>\n\n💰 ₹${order.totalAmount} via UPI\n👤 ${order.customerName}\n\n<i>Verified by admin via Telegram button.</i>`
        )
      }

      // Fire the payment-received alert (separate message with full details)
      notifyPaymentReceived(orderId, order.verifiedUtr).catch((e) =>
        console.error('[telegram-webhook] notifyPaymentReceived error:', e)
      )

      return NextResponse.json({ ok: true })
    } else {
      // reject
      const now = new Date()
      const latest = await db.paymentAttempt.findFirst({
        where: { orderId },
        orderBy: { attemptNumber: 'desc' },
      })
      if (latest) {
        await db.paymentAttempt.update({
          where: { id: latest.id },
          data: {
            adminReviewedBy: 'telegram',
            adminReviewedAt: now,
            adminNote: 'Rejected via Telegram button',
          },
        })
      }

      await answerCallbackQuery(callbackId, '❌ Rejected — flagged for follow-up')

      if (messageId) {
        await editTelegramMessage(
          chatId,
          messageId,
          `❌ <b>Payment Rejected — ${order.orderNumber}</b>\n\n💰 ₹${order.totalAmount} via UPI\n👤 ${order.customerName}\n\n<i>Rejected by admin via Telegram button. Order remains pending — customer should be contacted.</i>`
        )
      }

      return NextResponse.json({ ok: true })
    }
  }

  // Not a callback_query — ignore (could be a regular message, but we don't
  // handle those in this bot)
  return NextResponse.json({ ok: true })
}

// GET — simple health check / status endpoint
export async function GET() {
  return NextResponse.json({
    ok: true,
    webhook: 'telegram',
    note: 'POST to this endpoint with a Telegram update (set as the bot webhook).',
  })
}
