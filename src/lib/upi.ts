// UPI deep link + QR code generation helpers.
//
// UPI deep link spec: upi://pay?pa=VPA&pn=NAME&am=AMOUNT&tn=NOTE&tr=REF
//   pa = payee virtual payment address (e.g. store@upi)
//   pn = payee name (shown in the UPI app)
//   am = amount in rupees (decimal, e.g. "200.00")
//   tn = transaction note (visible to the payer)
//   tr = transaction reference (for reconciliation, NOT shown prominently)
//
// The same string is encoded into a QR code so desktop users can scan it.

import QRCode from 'qrcode'

export const UPI_CONFIG = {
  payeeId: process.env.UPI_PAYEE_ID ?? 'apnabaithak@upi',
  payeeName: process.env.UPI_PAYEE_NAME ?? 'Apna Baithak',
}

/**
 * Build the upi:// deep link for a payment.
 * All params are URL-encoded per the UPI spec.
 */
export function buildUpiDeepLink(params: {
  payeeId: string
  payeeName: string
  amount: number
  txnRef: string
  note?: string
}): string {
  const { payeeId, payeeName, amount, txnRef, note } = params
  const u = (s: string) => encodeURIComponent(s)
  // Amount must be decimal rupees with up to 2 decimal places.
  // Integer rupees (e.g. 200) → "200" (UPI apps accept this).
  const amountStr = Number.isInteger(amount)
    ? String(amount)
    : amount.toFixed(2)
  const parts = [
    `pa=${u(payeeId)}`,
    `pn=${u(payeeName)}`,
    `am=${u(amountStr)}`,
    `tn=${u(note ?? `Order ${txnRef}`)}`,
    `tr=${u(txnRef)}`,
  ]
  return `upi://pay?${parts.join('&')}`
}

/**
 * Generate a QR code as a base64 data URL (image/png) from any string.
 * Used to render the UPI deep link as a scannable QR for desktop users.
 */
export async function generateQrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 320,
    color: { dark: '#000000', light: '#ffffff' },
  })
}

/**
 * Generate the unique transaction reference for a payment attempt.
 * Format: {orderNumber}-A{attemptNumber}
 * e.g. AB-2026-0005-A1
 *
 * This is embedded in the UPI deep link (tr=) so the store can match
 * incoming bank settlements back to the specific order + attempt.
 */
export function buildUpiTxnRef(orderNumber: string, attemptNumber: number): string {
  return `${orderNumber}-A${attemptNumber}`
}

/**
 * The 5-minute window for screenshot upload after the Pay button is clicked.
 */
export const PAYMENT_WINDOW_MS = 5 * 60 * 1000

/**
 * The acceptable timestamp skew (±10 minutes from server time) for the
 * Gemini-extracted payment timestamp. Per spec: "up to 10 minutes forward
 * or backward from now".
 */
export const TIMESTAMP_WINDOW_MS = 10 * 60 * 1000
