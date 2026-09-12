/**
 * Diagnostic: probe the Turso DB to find why order creation is failing.
 *
 * Reads the .env file (TURSO_DATABASE_URL + TURSO_AUTH_TOKEN) and runs:
 *  1. Count of orders created this year (same query the checkout route does)
 *  2. The next order number that would be generated
 *  3. Whether that order number already exists (unique constraint collision!)
 *  4. List any order numbers that exist but are NOT in the expected sequence
 *     (would indicate gaps — maybe from deleted orders)
 *  5. Try the actual db.order.create() with a fake customer ID in a
 *     transaction that we immediately roll back — this should reproduce
 *     the exact error the customer is seeing.
 */
import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'

const url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL!
const authToken = process.env.TURSO_AUTH_TOKEN || undefined
const adapter = new PrismaLibSQL({ url, authToken })
const db = new PrismaClient({ adapter, log: ['error', 'warn'] })

function orderNumberFromSeq(seq: number): string {
  const year = new Date().getFullYear()
  return `AB-${year}-${String(seq).padStart(4, '0')}`
}

async function main() {
  console.log('=== Turso DB diagnostic ===')
  console.log('DB URL:', url.replace(/authToken=[^&]+/, 'authToken=***'))
  console.log()

  // 1. Count orders this year
  const yearStart = new Date(new Date().getFullYear(), 0, 1)
  const yearCount = await db.order.count({
    where: { createdAt: { gte: yearStart } },
  })
  console.log(`Orders created since ${yearStart.toISOString()}: ${yearCount}`)

  // 2. Next order number that checkout would generate
  const nextSeq = yearCount + 1
  const nextOrderNumber = orderNumberFromSeq(nextSeq)
  console.log(`Next order number checkout would generate: ${nextOrderNumber}`)

  // 3. Does that order number already exist? (unique constraint collision)
  const existing = await db.order.findUnique({
    where: { orderNumber: nextOrderNumber },
    select: { id: true, orderNumber: true, createdAt: true },
  })
  console.log(`Already exists?`, existing ? `YES — ${JSON.stringify(existing)}` : 'NO')
  console.log()

  // 4. List all order numbers this year to find gaps/duplicates
  console.log('=== All orders this year (in creation order) ===')
  const allOrders = await db.order.findMany({
    where: { createdAt: { gte: yearStart } },
    orderBy: { createdAt: 'asc' },
    select: { orderNumber: true, createdAt: true, customerName: true, status: true },
  })
  for (const o of allOrders) {
    console.log(`  ${o.orderNumber}  ${o.createdAt.toISOString()}  ${o.customerName}  ${o.status}`)
  }
  console.log(`Total: ${allOrders.length}`)
  console.log()

  // 5. Check the highest orderNumber to see if it matches the count
  // (if highest > count, there are gaps from deleted orders)
  const orderNumbers = allOrders.map(o => o.orderNumber).sort()
  if (orderNumbers.length > 0) {
    const last = orderNumbers[orderNumbers.length - 1]
    console.log(`Last order number in DB: ${last}`)
    console.log(`Expected last (based on count): ${orderNumberFromSeq(yearCount)}`)
    if (last !== orderNumberFromSeq(yearCount)) {
      console.log(`⚠️  MISMATCH — there are gaps from deleted orders!`)
      console.log(`    Checkout will generate ${nextOrderNumber} but the DB may already have it.`)
    }
  }

  // 6. Try a dry-run of the actual order creation (in a rolled-back transaction)
  console.log()
  console.log('=== Try a real order.create() in a rolled-back transaction ===')
  try {
    await db.$transaction(async (tx) => {
      // We need a real customer ID — find any
      const anyCustomer = await tx.customer.findFirst({ select: { id: true, name: true } })
      if (!anyCustomer) {
        console.log('No customers in DB — cannot test order.create()')
        return
      }
      console.log(`Using customer: ${anyCustomer.id} (${anyCustomer.name})`)

      const anyAddress = await tx.address.findFirst({
        where: { customerId: anyCustomer.id },
        select: { id: true },
      })
      if (!anyAddress) {
        console.log('Customer has no address — cannot test order.create()')
        return
      }
      console.log(`Using address: ${anyAddress.id}`)

      const anyMenuItem = await tx.menuItem.findFirst({
        where: { isAvailable: true },
        select: { id: true, name: true, price: true },
      })
      if (!anyMenuItem) {
        console.log('No available menu items — cannot test order.create()')
        return
      }
      console.log(`Using menu item: ${anyMenuItem.id} (${anyMenuItem.name}, ₹${anyMenuItem.price})`)

      const testOrderNumber = `DIAG-${Date.now()}`
      console.log(`Trying to create order with orderNumber=${testOrderNumber}...`)

      const order = await tx.order.create({
        data: {
          orderNumber: testOrderNumber,
          customerId: anyCustomer.id,
          addressId: anyAddress.id,
          customerName: anyCustomer.name ?? 'Diag',
          customerPhone: null,
          addressLine: 'Diagnostic test (rolled back)',
          status: 'NEW',
          paymentMode: 'COD',
          paymentStatus: 'PENDING',
          itemTotal: anyMenuItem.price,
          handlingFee: 0,
          deliveryFee: 0,
          gstAndCharges: 0,
          totalAmount: anyMenuItem.price,
          distanceKm: 1.0,
          notes: null,
          items: {
            create: [{
              itemId: anyMenuItem.id,
              itemName: anyMenuItem.name,
              itemPrice: anyMenuItem.price,
              quantity: 1,
              imageUrl: null,
            }],
          },
          statusHistory: {
            create: { status: 'NEW', note: 'Diagnostic test (will be rolled back)' },
          },
        },
      })
      console.log(`✓ Order creation succeeded! (would have been order ${order.orderNumber}, id ${order.id})`)
      console.log(`  → This means the order.create() itself is NOT the problem.`)
      console.log(`  → The issue must be earlier (auth, customer lookup, address, etc.)`)
      // Transaction will be rolled back automatically because we throw below
      throw new Error('INTENTIONAL_ROLLBACK')
    })
  } catch (e: any) {
    if (e?.message === 'INTENTIONAL_ROLLBACK') {
      // Good — the create succeeded, we rolled back
      console.log('✓ Transaction rolled back as expected — no data was actually written.')
    } else {
      console.log(`✗ Order creation FAILED with error:`)
      console.log(`  name: ${e?.name}`)
      console.log(`  message: ${e?.message}`)
      console.log(`  stack: ${e?.stack?.split('\n').slice(0, 5).join('\n')}`)
    }
  }
}

main()
  .catch((e) => {
    console.error('Diagnostic failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
