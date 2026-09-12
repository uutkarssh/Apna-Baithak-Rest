/**
 * Verify the FIXED order-number logic produces a non-colliding number.
 * Read-only against the live DB — does NOT create or modify anything.
 */
import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'

const url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL!
const authToken = process.env.TURSO_AUTH_TOKEN || undefined
const adapter = new PrismaLibSQL({ url, authToken })
const db = new PrismaClient({ adapter, log: ['error'] })

function orderNumberFromSeq(seq: number): string {
  const year = new Date().getFullYear()
  return `AB-${year}-${String(seq).padStart(4, '0')}`
}

async function main() {
  console.log('=== Verify the FIXED order-number logic ===\n')

  // Replicate the OLD (buggy) logic
  const yearStart = new Date(new Date().getFullYear(), 0, 1)
  const yearCount = await db.order.count({
    where: { createdAt: { gte: yearStart } },
  })
  const oldLogicNumber = orderNumberFromSeq(yearCount + 1)
  const oldLogicExists = await db.order.findUnique({
    where: { orderNumber: oldLogicNumber },
    select: { id: true },
  })
  console.log(`OLD logic (COUNT + 1):`)
  console.log(`  yearCount=${yearCount} → would generate "${oldLogicNumber}"`)
  console.log(`  Already exists? ${oldLogicExists ? 'YES ✗ — would throw unique constraint violation' : 'NO ✓'}`)

  // Replicate the NEW (fixed) logic
  const year = new Date().getFullYear()
  const prefix = `AB-${year}-`
  const lastOrder = await db.order.findFirst({
    where: { orderNumber: { startsWith: prefix } },
    orderBy: { orderNumber: 'desc' },
    select: { orderNumber: true },
  })
  const lastSeq = lastOrder
    ? (parseInt(lastOrder.orderNumber.slice(prefix.length), 10) || 0)
    : 0
  const newLogicNumber = orderNumberFromSeq(lastSeq + 1)
  const newLogicExists = await db.order.findUnique({
    where: { orderNumber: newLogicNumber },
    select: { id: true },
  })
  console.log(`\nNEW logic (MAX + 1):`)
  console.log(`  lastSeq=${lastSeq} (from order ${lastOrder?.orderNumber}) → would generate "${newLogicNumber}"`)
  console.log(`  Already exists? ${newLogicExists ? 'YES ✗' : 'NO ✓ — safe to insert'}`)

  console.log(`\n=== Conclusion ===`)
  if (oldLogicExists && !newLogicExists) {
    console.log(`✓ FIX CONFIRMED — old logic collides, new logic produces a safe number.`)
    console.log(`  The "Failed to place order" error will stop once this fix is deployed.`)
  } else if (!oldLogicExists && !newLogicExists) {
    console.log(`✓ Both safe — no collision currently. (Fix still prevents future collisions.)`)
  } else {
    console.log(`⚠ Unexpected state — investigate.`)
  }
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
