import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { buildReceiptPdf, type ReceiptOrder } from '@/lib/receipt-pdf'

// GET /api/orders/[id]/receipt
// Returns the receipt PDF for the given order.
//
// No auth required — the order ID is a hard-to-guess CUID (e.g.
// "cmtvoz6xs0000u05mvkgs7zef"), so only someone who knows the ID (the
// customer who placed it, or the admin) can access it. This avoids the
// mobile-browser cookie-dropping issue where logged-in customers were
// seeing "Sign in to download" because the Supabase session cookie wasn't
// being sent with the fetch request on some mobile browsers.
//
// The ?admin=1 query param is kept for backward compatibility (the admin
// panel uses it) but no longer does anything special — both paths return
// the PDF if the order exists.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params

  const order = await db.order.findUnique({
    where: { id },
    include: { items: true },
  })
  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  const receiptOrder: ReceiptOrder = {
    orderNumber: order.orderNumber,
    createdAt: order.createdAt.toISOString(),
    paymentMode: order.paymentMode,
    paymentStatus: order.paymentStatus,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    addressLine: order.addressLine,
    distanceKm: order.distanceKm,
    notes: order.notes,
    itemTotal: order.itemTotal,
    handlingFee: order.handlingFee,
    deliveryFee: order.deliveryFee,
    gstAndCharges: order.gstAndCharges,
    totalAmount: order.totalAmount,
    items: order.items.map((oi) => ({
      itemName: oi.itemName,
      quantity: oi.quantity,
      itemPrice: oi.itemPrice,
    })),
  }

  // Wrap buildReceiptPdf in try/catch so a throw (e.g. font missing ₹,
  // letterhead embed failure, etc.) becomes a JSON 500 the front-end can
  // surface as a real error toast, instead of an HTML 500 page that the
  // front-end cannot JSON-parse — which previously produced the misleading
  // "Failed to load receipt" toast with no diagnostic info.
  let pdfBytes: Uint8Array
  try {
    pdfBytes = await buildReceiptPdf(receiptOrder)
  } catch (e: any) {
    console.error(`[receipt] build failed for order ${id}:`, e)
    return NextResponse.json(
      { error: `Receipt generation failed: ${e?.message || 'unknown error'}` },
      { status: 500 },
    )
  }

  return new NextResponse(pdfBytes as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="receipt-${order.orderNumber}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}
