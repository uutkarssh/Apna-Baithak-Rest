// Telegram Bot notification helper.
// Sends messages to ALL configured chats (the store owner + any co-managers)
// via the Telegram Bot API. Used for new-order alerts, payment-received
// alerts, and pending-verification alerts (with inline Verify/Reject buttons).
//
// Also exposes a webhook handler for Telegram callback_query events (button
// presses) — see /api/telegram/webhook.
//
// Server-side ONLY — TELEGRAM_BOT_TOKEN is never exposed to the client.
//
// === MULTI-CHAT SUPPORT ===
// Set TELEGRAM_CHAT_IDS to a comma-separated list of chat IDs:
//   TELEGRAM_CHAT_IDS=5000748165,6560608668
// Every notification is sent to ALL chats. Each chat gets its own message_id
// for the same logical message. When an admin presses a button on one device,
// the webhook looks up ALL stored {chatId, messageId} pairs for that order
// and edits EVERY one — so both devices stay in sync.
//
// Backwards compat: if TELEGRAM_CHAT_IDS is not set, falls back to the old
// TELEGRAM_CHAT_ID (singular) env var.

import { db } from './db'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN

const API = (method: string) => `https://api.telegram.org/bot${BOT_TOKEN}/${method}`

/**
 * Parse the list of chat IDs from env.
 * Supports both TELEGRAM_CHAT_IDS (comma-separated, plural) and the legacy
 * TELEGRAM_CHAT_ID (singular) for backwards compat.
 */
function getChatIds(): string[] {
  // Prefer the plural form (TELEGRAM_CHAT_IDS)
  const plural = process.env.TELEGRAM_CHAT_IDS
  if (plural && plural.trim()) {
    return plural
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }
  // Fall back to the singular form for backwards compat
  const singular = process.env.TELEGRAM_CHAT_ID
  if (singular && singular.trim()) {
    return [singular.trim()]
  }
  return []
}

/** A single message send result — which chat received it + its message_id. */
export type TelegramMessageResult = {
  chatId: string
  messageId?: number
  ok: boolean
}

/**
 * Send a plain-text (HTML) message to ALL configured chats.
 * Returns an array of per-chat results (one entry per chat).
 * Silently no-ops if env vars are missing.
 */
export async function sendTelegramMessage(
  text: string,
  options?: {
    reply_markup?: any
    disable_web_page_preview?: boolean
  }
): Promise<TelegramMessageResult[]> {
  const chatIds = getChatIds()
  if (!BOT_TOKEN || chatIds.length === 0) {
    console.warn('[telegram] BOT_TOKEN or CHAT_IDS not configured — message not sent')
    return []
  }

  // Send to all chats in parallel (independent requests)
  const results = await Promise.all(
    chatIds.map(async (chatId): Promise<TelegramMessageResult> => {
      try {
        const res = await fetch(API('sendMessage'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: 'HTML',
            disable_web_page_preview: options?.disable_web_page_preview ?? true,
            reply_markup: options?.reply_markup,
          }),
        })
        const data = await res.json()
        if (!res.ok || !data.ok) {
          console.error(`[telegram] sendMessage to ${chatId} failed: ${JSON.stringify(data).slice(0, 300)}`)
          return { chatId, ok: false }
        }
        return { chatId, messageId: data.result?.message_id, ok: true }
      } catch (e) {
        console.error(`[telegram] sendMessage to ${chatId} error: ${(e as Error).message}`)
        return { chatId, ok: false }
      }
    })
  )

  return results
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
 * Edit a single existing message's text (used after a button press to update
 * the message instead of sending a new one).
 *
 * NOTE: This edits ONE specific message in ONE specific chat. To edit all
 * stored messages for an order (multi-device sync), use
 * editAllTelegramMessagesForOrder() instead.
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

/**
 * Edit ALL stored Telegram messages for an order.
 *
 * When an admin presses Verify/Reject on one device, we need to update the
 * message on EVERY device — not just the one where the button was pressed.
 * This function reads the order's `telegramMessageIds` field (a JSON array
 * of {chatId, messageId} pairs) and calls editTelegramMessage() for each.
 *
 * If the order has no stored message IDs (e.g. old orders from before this
 * feature), this is a no-op.
 */
export async function editAllTelegramMessagesForOrder(
  orderId: string,
  text: string
): Promise<void> {
  try {
    const order = await db.order.findUnique({
      where: { id: orderId },
      select: { telegramMessageIds: true },
    })
    if (!order?.telegramMessageIds) return

    let pairs: { chatId: string; messageId: number }[] = []
    try {
      pairs = JSON.parse(order.telegramMessageIds)
    } catch {
      console.error('[telegram] failed to parse telegramMessageIds for order', orderId)
      return
    }

    // Edit all messages in parallel
    await Promise.all(
      pairs.map((p) => editTelegramMessage(p.chatId, p.messageId, text))
    )
  } catch (e) {
    console.error(`[telegram] editAllTelegramMessagesForOrder error: ${(e as Error).message}`)
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
 * Notify all configured chats that a new order has been placed.
 * Includes full order details + map link + call link.
 *
 * Returns the array of per-chat message results (so the caller can store
 * the message IDs if needed — though for new-order alerts there are no
 * buttons to edit later, so storage is optional).
 */
export async function notifyNewOrder(orderId: string): Promise<TelegramMessageResult[]> {
  try {
    const detail = await buildOrderDetail(orderId)
    if (!detail) return []
    const { text, order } = detail

    const header =
      order.paymentMode === 'UPI'
        ? `🆕 <b>New Order ${order.orderNumber}</b> (UPI — pending payment)`
        : `🆕 <b>New Order ${order.orderNumber}</b>`

    const msg = `${header}\n\n${text}`
    return await sendTelegramMessage(msg)
  } catch (e) {
    console.error(`[telegram] notifyNewOrder error: ${(e as Error).message}`)
    return []
  }
}

/**
 * Notify all configured chats that a UPI payment has been verified and received.
 * Called when Gemini auto-approves OR when the admin manually approves
 * (from the web panel OR from a Telegram button press).
 */
export async function notifyPaymentReceived(orderId: string, utr?: string | null): Promise<TelegramMessageResult[]> {
  try {
    const detail = await buildOrderDetail(orderId)
    if (!detail) return []
    const { text, order } = detail

    const msg = [
      `✅ <b>Payment Received — ${order.orderNumber}</b>`,
      ``,
      `💰 <b>₹${order.totalAmount}</b> via UPI ${utr ? `· UTR <code>${utr}</code>` : ''}`,
      ``,
      text,
    ].join('\n')

    return await sendTelegramMessage(msg)
  } catch (e) {
    console.error(`[telegram] notifyPaymentReceived error: ${(e as Error).message}`)
    return []
  }
}

/**
 * Notify all configured chats that a UPI payment is pending manual verification.
 * This is called when:
 *   - Gemini auto-verification FAILS (screenshot uploaded but checks failed)
 *   - Customer chose "Continue without screenshot" (manual review requested)
 *
 * Sends a message with inline Verify/Reject buttons so the admin can act
 * directly from Telegram in one tap.
 *
 * CRITICAL: The caller MUST store the returned array of {chatId, messageId}
 * pairs on the order record (order.telegramMessageIds) so that when a button
 * is pressed, the webhook can edit ALL messages across all devices — not just
 * the one where the button was pressed.
 */
export async function notifyPaymentPendingManual(orderId: string): Promise<TelegramMessageResult[]> {
  try {
    const detail = await buildOrderDetail(orderId)
    if (!detail) return []
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

    return await sendTelegramMessage(msg, {
      reply_markup: pendingKeyboard(order, mapsLink, directionsLink),
    })
  } catch (e) {
    console.error(`[telegram] notifyPaymentPendingManual error: ${(e as Error).message}`)
    return []
  }
}
