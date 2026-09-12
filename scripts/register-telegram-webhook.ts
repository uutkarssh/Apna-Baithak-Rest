/**
 * Register the Telegram bot webhook with the secret token.
 *
 * Run this once after deploying to set up the Telegram verify/reject buttons.
 * The webhook URL should point to YOUR deployment's /api/telegram/webhook endpoint.
 *
 * Usage:
 *   WEBHOOK_URL=https://your-deployment.vercel.app \
 *   bunx tsx scripts/register-telegram-webhook.ts
 *
 * Or set WEBHOOK_URL in .env and just run:
 *   bunx tsx scripts/register-telegram-webhook.ts
 *
 * Requires TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET in .env.
 */
import * as dotenv from 'dotenv'
dotenv.config()

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET
const WEBHOOK_URL = process.env.WEBHOOK_URL

if (!BOT_TOKEN) {
  console.error('TELEGRAM_BOT_TOKEN is not set in .env')
  process.exit(1)
}
if (!SECRET) {
  console.error('TELEGRAM_WEBHOOK_SECRET is not set in .env')
  process.exit(1)
}
if (!WEBHOOK_URL) {
  console.error('WEBHOOK_URL is not set.')
  console.error('Set it in .env or pass it as an env var, e.g.:')
  console.error('  WEBHOOK_URL=https://your-deployment.vercel.app bunx tsx scripts/register-telegram-webhook.ts')
  process.exit(1)
}

const fullUrl = `${WEBHOOK_URL.replace(/\/$/, '')}/api/telegram/webhook`

async function main() {
  console.log('=== Registering Telegram webhook ===')
  console.log(`Webhook URL: ${fullUrl}`)
  console.log(`Secret: ${SECRET.slice(0, 8)}...${SECRET.slice(-4)}`)
  console.log()

  const res = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: fullUrl,
        secret_token: SECRET,
        allowed_updates: ['callback_query'],
        max_connections: 40,
      }),
    }
  )
  const data = await res.json()
  console.log('Response:', JSON.stringify(data, null, 2))

  if (data.ok) {
    console.log()
    console.log('✓ Webhook registered. Telegram verify/reject buttons will now work.')
    console.log('  When a customer uploads a UPI screenshot that fails auto-verification,')
    console.log('  a message with inline buttons will be sent to your chat.')
    console.log('  Tap "✅ Verify Payment" to mark the order as paid.')
    console.log('  Tap "❌ Reject" to flag it for follow-up.')
  } else {
    console.error('✗ Failed to register webhook.')
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
