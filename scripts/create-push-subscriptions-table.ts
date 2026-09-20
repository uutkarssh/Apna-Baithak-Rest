// Create the push_subscriptions table on Turso (direct DDL via @libsql/client).
// Mirrors the approach used by scripts/check-turso-schema.ts (the project's
// existing convention for one-off DDL on Turso since Prisma's sqlite provider
// doesn't speak the libsql:// protocol for migrations).
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
  // Check existing tables
  const tables = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
  )
  const tableNames = tables.rows.map((r) => r.name as string)
  console.log('Existing tables:', tableNames)

  if (tableNames.includes('push_subscriptions')) {
    console.log('\npush_subscriptions already exists — verifying columns...')
    const cols = await client.execute('PRAGMA table_info(push_subscriptions)')
    cols.rows.forEach((r) => console.log('  -', r.name, r.type))
    return
  }

  console.log('\nCreating push_subscriptions table...')
  await client.execute(`
    CREATE TABLE push_subscriptions (
      id TEXT PRIMARY KEY NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      ownerType TEXT NOT NULL,
      ownerId TEXT,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      lastFailedAt DATETIME
    )
  `)

  console.log('Creating indexes...')
  await client.execute(
    'CREATE INDEX push_subscriptions_ownerType_idx ON push_subscriptions(ownerType)'
  )
  await client.execute(
    'CREATE INDEX push_subscriptions_ownerType_ownerId_idx ON push_subscriptions(ownerType, ownerId)'
  )

  console.log('\nVerifying...')
  const verify = await client.execute('PRAGMA table_info(push_subscriptions)')
  console.log('Columns:')
  verify.rows.forEach((r) => console.log('  -', r.name, r.type))

  const idx = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='push_subscriptions'"
  )
  console.log('\nIndexes:')
  idx.rows.forEach((r) => console.log('  -', r.name))

  console.log('\nDONE')
}

main().catch((e) => {
  console.error('Migration failed:', e)
  process.exit(1)
})
