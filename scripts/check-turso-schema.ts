// Check if the Turso orders table has the telegramMessageIds column,
// and add it if missing (direct ALTER TABLE on Turso).
import * as dotenv from 'dotenv'
dotenv.config()

import { createClient } from '@libsql/client'

const url = process.env.TURSO_DATABASE_URL
const token = process.env.TURSO_AUTH_TOKEN

if (!url) {
  console.error('TURSO_DATABASE_URL not set')
  process.exit(1)
}

const client = createClient({ url, authToken: token })

async function main() {
  console.log('=== Checking Turso orders table schema ===')
  const result = await client.execute('PRAGMA table_info(orders)')
  const cols = result.rows.map((r) => r.name)
  console.log('Current columns:')
  cols.forEach((c) => console.log('  -', c))

  console.log()
  if (cols.includes('telegramMessageIds')) {
    console.log('GOOD: telegramMessageIds column already exists')
  } else {
    console.log('MISSING: telegramMessageIds column not found — adding it now...')
    await client.execute(
      'ALTER TABLE orders ADD COLUMN telegramMessageIds TEXT'
    )
    console.log('ADDED: telegramMessageIds column created')
    
    // Verify
    const result2 = await client.execute('PRAGMA table_info(orders)')
    const cols2 = result2.rows.map((r) => r.name)
    console.log()
    console.log('Updated columns:')
    cols2.forEach((c) => console.log('  -', c))
    console.log()
    console.log('Has telegramMessageIds?', cols2.includes('telegramMessageIds'))
  }
}

main().catch((e) => {
  console.error('Error:', e)
  process.exit(1)
})
