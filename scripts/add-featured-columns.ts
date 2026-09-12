/**
 * Add isFeatured + featuredOrder columns to the menu_items table on Turso.
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
  console.log('=== Adding isFeatured + featuredOrder to menu_items ===\n')

  // Check current columns
  const cols = await client.execute('PRAGMA table_info(menu_items)')
  const colNames = cols.rows.map((r) => r.name)
  console.log('Current menu_items columns:', colNames.join(', '))

  if (!colNames.includes('isFeatured')) {
    console.log('\nAdding isFeatured column (BOOLEAN DEFAULT 0)...')
    await client.execute('ALTER TABLE menu_items ADD COLUMN isFeatured BOOLEAN NOT NULL DEFAULT 0')
    console.log('Added isFeatured.')
  } else {
    console.log('isFeatured already exists — skipping.')
  }

  if (!colNames.includes('featuredOrder')) {
    console.log('Adding featuredOrder column (INTEGER, nullable)...')
    await client.execute('ALTER TABLE menu_items ADD COLUMN featuredOrder INTEGER')
    console.log('Added featuredOrder.')
  } else {
    console.log('featuredOrder already exists — skipping.')
  }

  // Verify
  const cols2 = await client.execute('PRAGMA table_info(menu_items)')
  const colNames2 = cols2.rows.map((r) => r.name)
  console.log('\nUpdated menu_items columns:', colNames2.join(', '))
  console.log('\nHas isFeatured?', colNames2.includes('isFeatured'))
  console.log('Has featuredOrder?', colNames2.includes('featuredOrder'))
}

main().catch((e) => {
  console.error('Error:', e)
  process.exit(1)
})
