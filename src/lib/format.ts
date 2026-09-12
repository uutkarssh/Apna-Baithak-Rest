/** Format an integer rupee amount as ₹100 (no decimals). */
export function rupees(amount: number): string {
  return `₹${Math.round(amount)}`
}

/** Format a rupee amount with decimals, e.g. ₹200.00 */
export function rupees2(amount: number): string {
  return `₹${amount.toFixed(2)}`
}

/** Slugify a string. */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

/** Generate a human-friendly order number: AB-YYYY-0001 */
export function orderNumberFromSeq(seq: number): string {
  const year = new Date().getFullYear()
  return `AB-${year}-${String(seq).padStart(4, '0')}`
}

/** Format an ISO date string as "10 Sep 2026, 7:45 PM". */
export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

/** Format an ISO date as relative "2 mins ago" / "Today 7:45 PM" etc. */
export function formatRelative(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin} min ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24 && d.getDate() === now.getDate()) {
    return `Today ${d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}`
  }
  return formatDateTime(iso)
}
