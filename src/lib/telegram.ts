// Telegram Bot notification helper.
// Sends messages to the configured chat (the store owner) via the Telegram
// Bot API. Used for new-order alerts, payment-received alerts, and
// pending-verification alerts (with inline Verify/Reject buttons).
//
// Also exposes a webhook handler for Telegram callback_query events (button
// presses) — see /api/telegram/webhook.
//
// Server-side ONLY — TELEGRAM_BOT_TOKEN is never exposed to the client.

import { db } from './db'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const CHAT_ID = process.env.TELEGRAM_CHAT_ID

const API = (method: string) => `https://api.telegram.org/bot${BOT_TOKEN}/${method}`

/**
 * Send a plain-text (HTML) message. Silently no-ops if env vars are missing.
 */
export async function sendTelegramMessage(
  text: string,
  options?: {
    reply_markup?: any
    disable_web_page_preview?: boolean
  }
): Promise<{ message_id?: number; ok: boolean }> {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.warn('[telegram] BOT_TOKEN or CHAT_ID not configured — message not sent')
    return { ok: false }
  }
  try {
    const res = await fetch(API('sendMessage'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: options?.disable_web_page_preview ?? true,
        reply_markup: options?.reply_markup,
      }),
    })
    const data = await res.json()
    if (!res.ok || !data.ok) {
      console.error(`[telegram] sendMessage failed: ${JSON.stringify(data).slice(0, 300)}`)
      return { ok: false }
    }
    return { ok: true, message_id: data.result?.message_id }
  } catch (e) {
    console.error(`[telegram] sendMessage error: ${(e as Error).message}`)
    return { ok: false }
  }
}

/**
 * Answer a callback query (removes the loading spinner on the button).
 */
export async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
  if (!BOT_TOKEN) return
  try {
    await fetch(API('answerCallbackQuery'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text,
        show_alert: false,
      }),
    })
  } catch (e) {
    console.error(`[telegram] answerCallbackQuery error: ${(e as Error).message}`)
  }
}

/**
 * Edit an existing message's text (used after a button press to update the
 * message instead of sending a new one).
 */
export async function editTelegramMessage(
  chatId: string,
  messageId: number,
  text: string,
  reply_markup?: any
): Promise<void> {
  if (!BOT_TOKEN) return
  try {
    await fetch(API('editMessageText'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup,
      }),
    })
  } catch (e) {
    console.error(`[telegram] editMessageText error: ${(e as Error).message}`)
  }
}

// ===== Order detail formatter (shared by all notifications) =====
// Builds a full-detail HTML message body for an order, including:
//   - Customer name + phone (shown as text — Telegram auto-links phone numbers)
//   - Delivery address + distance
//   - Exact lat/lng + a "View on Map" Google Maps link + a "Get Directions" link
//   - Item list
//   - Bill breakdown + total
//   - Payment mode + status
//   - Notes
async function buildOrderDetail(orderId: string) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { items: true, address: true },
  })
  if (!order) return null

  const itemsList = order.items
    .map((i) => `  • ${i.itemName} ×${i.quantity} — ₹${i.itemPrice * i.quantity}`)
    .join('\n')

  const lat = order.address?.latitude
  const lng = order.address?.longitude
  const mapsLink =
    lat != null && lng != null
      ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
      : null
  const directionsLink =
    lat != null && lng != null
      ? `https://www.google.com/maps/dir/?api=1&origin=${process.env.RESTAURANT_LAT ?? 25.337698},${process.env.RESTAURANT_LNG ?? 82.351485}&destination=${lat},${lng}&travelmode=driving`
      : null

  const lines = [
    `👤 <b>${order.customerName}</b>`,
    order.customerPhone ? `📞 ${order.customerPhone}` : '',
    ``,
    `📍 <b>Delivery Address:</b>`,
    `${order.addressLine}`,
    order.distanceKm != null ? `📏 ${order.distanceKm.toFixed(2)} km from restaurant` : '',
    lat != null && lng != null
      ? `🎯 Coordinates: <code>${lat.toFixed(6)}, ${lng.toFixed(6)}</code>`
      : '',
    mapsLink ? `🗺️ <a href="${mapsLink}">View on Google Maps</a>` : '',
    directionsLink ? `🧭 <a href="${directionsLink}">Get Directions</a>` : '',
    ``,
    `<b>Items:</b>`,
    itemsList,
    ``,
    `💰 <b>Total: ₹${order.totalAmount}</b>`,
    `💳 Payment: ${order.paymentMode}${order.paymentMode === 'UPI' ? ` (${order.upiStatus})` : ''}`,
    `📝 Status: ${order.status}`,
    order.notes ? `📎 Note: ${order.notes}` : '',
  ].filter(Boolean)

  return { text: lines.join('\n'), order, lat, lng, mapsLink }
}

// Inline keyboard builder for pending-verification orders:
// [✅ Verify Payment] [❌ Reject]
// [🗺️ View on Map] [🧭 Directions]
//
// NOTE: Telegram inline button URLs must be http/https — tel: URLs are not
// allowed. The customer's phone number is shown as a clickable tel: link in
// the message body itself (Telegram auto-links phone numbers in HTML mode).
function pendingKeyboard(order: any, mapsLink: string | null, directionsLink: string | null) {
  const rows: any[] = []
  // Row 1: Verify / Reject (callback_data, not URLs)
  rows.push([
    { text: '✅ Verify Payment', callback_data: `verify:${order.id}` },
    { text: '❌ Reject', callback_data: `reject:${order.id}` },
  ])
  // Row 2: Map + Directions (http URLs — allowed)
  if (mapsLink && directionsLink) {
    rows.push([
      { text: '🗺️ View on Map', url: mapsLink },
      { text: '🧭 Directions', url: directionsLink },
    ])
  } else if (mapsLink) {
    rows.push([{ text: '🗺️ View on Map', url: mapsLink }])
  }
  return { inline_keyboard: rows }
}

/**
 * Notify the store owner that a new order has been placed.
 * Includes full order details + map link + call link.
 */
export async function notifyNewOrder(orderId: string): Promise<void> {
  try {
    const detail = await buildOrderDetail(orderId)
    if (!detail) return
    const { text, order } = detail

    const header =
      order.paymentMode === 'UPI'
        ? `🆕 <b>New Order ${order.orderNumber}</b> (UPI — pending payment)`
        : `🆕 <b>New Order ${order.orderNumber}</b>`

    const msg = `${header}\n\n${text}`
    await sendTelegramMessage(msg)
  } catch (e) {
    console.error(`[telegram] notifyNewOrder error: ${(e as Error).message}`)
  }
}

/**
 * Notify the store owner that a UPI payment has been verified and received.
 * Called when Gemini auto-approves OR when the admin manually approves
 * (from the web panel OR from a Telegram button press).
 */
export async function notifyPaymentReceived(orderId: string, utr?: string | null): Promise<void> {
  try {
    const detail = await buildOrderDetail(orderId)
    if (!detail) return
    const { text, order } = detail

    const msg = [
      `✅ <b>Payment Received — ${order.orderNumber}</b>`,
      ``,
      `💰 <b>₹${order.totalAmount}</b> via UPI ${utr ? `· UTR <code>${utr}</code>` : ''}`,
      ``,
      text,
    ].join('\n')

    await sendTelegramMessage(msg)
  } catch (e) {
    console.error(`[telegram] notifyPaymentReceived error: ${(e as Error).message}`)
  }
}

/**
 * Notify the store owner that a UPI payment is pending manual verification.
 * This is called when:
 *   - Gemini auto-verification FAILS (screenshot uploaded but checks failed)
 *   - Customer chose "Continue without screenshot" (manual review requested)
 *
 * Sends a message with inline Verify/Reject buttons so the admin can act
 * directly from Telegram in one tap.
 */
export async function notifyPaymentPendingManual(orderId: string): Promise<void> {
  try {
    const detail = await buildOrderDetail(orderId)
    if (!detail) return
    const { text, order, lat, lng, mapsLink } = detail

    const directionsLink =
      lat != null && lng != null
        ? `https://www.google.com/maps/dir/?api=1&origin=${process.env.RESTAURANT_LAT ?? 25.337698},${process.env.RESTAURANT_LNG ?? 82.351485}&destination=${lat},${lng}&travelmode=driving`
        : null

    const msg = [
      `⚠️ <b>UPI Payment Pending Verification — ${order.orderNumber}</b>`,
      ``,
      `💰 <b>₹${order.totalAmount}</b> (UPI)`,
      order.upiScreenshotUrl ? `📸 <a href="${order.upiScreenshotUrl}">View uploaded screenshot</a>` : `📝 Customer requested manual review (no screenshot)`,
      ``,
      text,
      ``,
      `<i>Tap a button below to verify or reject:</i>`,
    ].join('\n')

    await sendTelegramMessage(msg, {
      reply_markup: pendingKeyboard(order, mapsLink, directionsLink),
    })
  } catch (e) {
    console.error(`[telegram] notifyPaymentPendingManual error: ${(e as Error).message}`)
  }
}
