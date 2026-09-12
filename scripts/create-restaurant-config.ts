/**
 * Create the restaurant_config table on Turso and seed the singleton row.
 *
 * The table has a single row (id=1) holding the isAcceptingOrders boolean.
 * We create it via direct ALTER/CREATE on Turso (not prisma db push, which
 * uses the workspace root .env and creates a local SQLite file).
 */
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
  console.log('=== Creating restaurant_config table on Turso ===\n')

  // Check if the table already exists
  const tables = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='restaurant_config'"
  )
  if (tables.rows.length > 0) {
    console.log('Table restaurant_config already exists — skipping creation.')
  } else {
    console.log('Creating table restaurant_config...')
    await client.execute(`
      CREATE TABLE restaurant_config (
        id INTEGER PRIMARY KEY DEFAULT 1,
        isAcceptingOrders BOOLEAN NOT NULL DEFAULT 1,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)
    console.log('Table created.')

    // Seed the singleton row (id=1, isAcceptingOrders=true by default)
    console.log('Seeding singleton row (id=1, isAcceptingOrders=true)...')
    await client.execute(
      'INSERT INTO restaurant_config (id, isAcceptingOrders) VALUES (1, 1)'
    )
    console.log('Row seeded.')
  }

  // Verify
  const result = await client.execute('SELECT * FROM restaurant_config')
  console.log()
  console.log('Current restaurant_config contents:')
  for (const row of result.rows) {
    console.log(' ', JSON.stringify(row))
  }
}

main().catch((e) => {
  console.error('Error:', e)
  process.exit(1)
})
