# Apna Baithak

Production backend for **Apna Baithak**, a Next.js restaurant ordering PWA. Customers browse the menu, place COD or UPI orders, and track delivery. Admins manage orders, menu items, reviews, and UPI payment verifications from a separate admin PWA.

## Tech Stack

- **Framework**: Next.js 16 (App Router, standalone output, Turbopack)
- **Language**: TypeScript 5
- **Database**: Turso (libSQL) via Prisma 6 (driver adapter)
- **Auth**: Supabase (customer email/password + Google OAuth); admin is a hardcoded check (no DB account)
- **Storage**: Supabase Storage (menu item images, category icons, UPI payment screenshots)
- **PDF receipts**: pdf-lib + @pdf-lib/fontkit (brand fonts embedded, ₹ glyph supported)
- **Notifications**: Telegram Bot API (new-order alerts, payment-received alerts, inline Verify/Reject buttons for pending UPI verifications)
- **UPI verification**: Gemini Vision API (auto-verifies screenshot authenticity, amount, payee, timestamp, UTR reuse)
- **PWA**: Separate customer (`/`) and admin (`/admin`) service workers + manifests — each installable independently
- **Styling**: Tailwind CSS 4 + shadcn/ui components

## Features

### Customer PWA (`/`)
- Browse menu by category, search items
- Add to cart with quantity stepper
- Save multiple delivery addresses (geocoded via Nominatim)
- **Dynamic delivery charges**: ₹10 at 1km → ₹60 at 10km, scaled linearly and rounded to nearest ₹5
- **Free-delivery threshold**: ₹150 at 1km → ₹500 at 10km (also scales linearly)
- Live "Add ₹X more for free delivery" message in cart
- Place order as COD or UPI
- UPI flow: QR code + deep link → 5-min payment window → screenshot upload → Gemini auto-verification → admin manual review fallback
- Track order status (NEW → PREPARING → OUT_FOR_DELIVERY → DELIVERED)
- Rate delivered orders
- Download PDF receipt

### Admin PWA (`/admin`)
- Hardcoded login (email + password in env)
- Dashboard with today's stats (orders, revenue, active orders)
- Order management: filter by status, advance status, mark payment received (Cash/UPI), delete
- UPI payment verification panel: view screenshot, Gemini AI result, approve/reject
- Menu management: CRUD items + categories, upload up to 5 images per item
- Reviews panel: view customer ratings + reviews
- Sales analytics: 7-day revenue chart + top-selling items
- CSV export: orders + revenue
- Telegram notifications: new-order alert, payment-received alert, pending-verification alert with inline Verify/Reject buttons

## Delivery Charge Formula

Single source of truth: `src/lib/delivery.ts`

```
raw_charge = 10 + (distance_km - 1) * (50 / 9)
final_charge = round_to_nearest_5(raw_charge)   // ₹10 at 1km → ₹60 at 10km

free_threshold = 150 + (distance_km - 1) * (350 / 9)   // ₹150 at 1km → ₹500 at 10km

if subtotal >= free_threshold:
    delivery_fee = 0   (FREE)
else:
    delivery_fee = final_charge
```

Distance is clamped to [1, 10] km before applying the formula. Addresses beyond 10km are rejected as non-serviceable. The server recomputes and validates the charge on order submission — client-sent values are not trusted.

## Bill Breakdown

The bill contains only:
- Item subtotal
- Delivery charge (or FREE)
- Final total = subtotal + delivery charge

GST and handling fees have been removed entirely. The Prisma schema fields `handlingFee` and `gstAndCharges` are kept (set to 0 on new orders) for historical order auditability.

## Setup

### 1. Install dependencies

```bash
bun install   # or npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your real Turso, Supabase, Telegram, Gemini, and admin credentials
```

### 3. Initialize the database

```bash
bunx prisma db push    # creates all tables from schema.prisma
bunx prisma generate   # generates the Prisma Client
```

### 4. Run the dev server

```bash
bun dev   # or npm run dev
# Open http://localhost:3000
```

### 5. Build for production

```bash
bun run build   # builds standalone output to .next/standalone/
bun run start   # serves the standalone build on port 3000
```

## Telegram Webhook Setup (for Verify/Reject buttons)

The Telegram webhook is required for the inline Verify/Reject buttons on pending UPI verifications to work. Set it up after your first deployment:

```bash
WEBHOOK_URL=https://your-deployment.vercel.app \
bunx tsx scripts/register-telegram-webhook.ts
```

This registers the webhook with Telegram using the `TELEGRAM_WEBHOOK_SECRET` from your `.env` file.

## Scripts

- `bun dev` — start dev server on port 3000
- `bun run build` — production build (standalone output)
- `bun run start` — serve the production build
- `bunx prisma db push` — apply schema to Turso
- `bunx prisma generate` — regenerate Prisma Client after schema changes
- `bunx tsx scripts/verify-delivery-charge.ts` — test the delivery-charge formula against reference points
- `bunx tsx scripts/diagnose-checkout.ts` — diagnostic for checkout failures (read-only against live DB)
- `bunx tsx scripts/verify-order-number-fix.ts` — verify the order-number generation logic
- `bunx tsx scripts/register-telegram-webhook.ts` — register the Telegram webhook with secret token

## Project Structure

```
apna-baithak/
├── prisma/
│   └── schema.prisma              # Turso/libSQL schema (Customer, Address, Order, MenuItem, etc.)
├── public/
│   ├── brand/                     # customer PWA icons
│   ├── admin-brand/               # admin PWA icons
│   ├── fonts/                     # Poppins + Outfit TTFs (with ₹ glyph)
│   ├── letterhead/                # receipt letterhead PNG
│   ├── manifest.json              # customer PWA manifest
│   ├── admin-manifest.json        # admin PWA manifest
│   ├── sw.js                      # customer service worker
│   └── admin-sw.js                # admin service worker
├── scripts/
│   ├── diagnose-checkout.ts       # diagnostic for checkout failures
│   ├── verify-order-number-fix.ts # verify orderNumber generation
│   ├── verify-delivery-charge.ts  # verify delivery-charge formula
│   └── register-telegram-webhook.ts
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── checkout/          # POST — place order (server-side delivery calc)
│   │   │   ├── orders/            # GET order history, GET receipt PDF, POST rate
│   │   │   ├── orders/[id]/upi/   # initiate, upload, manual, status
│   │   │   ├── addresses/         # CRUD addresses
│   │   │   ├── auth/me            # GET/PATCH customer profile
│   │   │   ├── menu/              # public menu read endpoints
│   │   │   ├── admin/             # admin-only CRUD + stats + export
│   │   │   ├── ratings/           # public restaurant rating
│   │   │   └── telegram/webhook   # Telegram bot webhook receiver
│   │   ├── admin/                 # admin PWA route segment (own layout + SW)
│   │   ├── layout.tsx             # root layout (customer PWA)
│   │   └── page.tsx               # customer app entry
│   ├── components/
│   │   ├── apna/                  # customer-facing components + views
│   │   ├── admin/                 # admin dashboard + modals
│   │   ├── pwa/                   # service worker register + install prompts
│   │   ├── brand/                 # brand logo
│   │   ├── providers/             # auth provider + query client
│   │   └── ui/                    # shadcn/ui components
│   ├── lib/
│   │   ├── db.ts                  # Prisma client (Turso adapter)
│   │   ├── supabase-server.ts     # server-side Supabase clients
│   │   ├── supabase-client.ts     # browser Supabase client
│   │   ├── admin-guard.ts         # admin cookie check
│   │   ├── delivery.ts            # delivery-charge formula (single source of truth)
│   │   ├── receipt-pdf.ts         # pdf-lib receipt generator
│   │   ├── telegram.ts            # Telegram notification helpers
│   │   ├── gemini.ts              # Gemini Vision screenshot verification
│   │   ├── upi.ts                 # UPI deep link + QR helpers
│   │   ├── storage.ts             # Supabase Storage upload helpers
│   │   ├── geo.ts                 # haversine + geocode + radius check
│   │   ├── constants.ts           # restaurant details + fee constants
│   │   ├── format.ts              # rupees/date formatters
│   │   └── types.ts               # shared TS types
│   ├── store/                     # zustand stores (cart, app, favorites)
│   └── hooks/                     # react hooks
├── next.config.ts                 # standalone output + image config
├── tailwind.config.ts
├── tsconfig.json
├── components.json                # shadcn/ui config
├── package.json
└── .env.example                   # environment variable template
```

## Security

- **Customer auth**: Supabase session (cookie-based via @supabase/ssr) + Bearer token fallback
- **Admin auth**: Hardcoded email/password check, issues httpOnly `ab_admin` cookie (12h expiry, sameSite=strict)
- **Receipt download**: No auth (order ID is a CUID — hard to guess). The `?admin=1` param is kept for backward compat but does nothing special.
- **Telegram webhook**: Fail-closed — requires `TELEGRAM_WEBHOOK_SECRET` env var + matching `X-Telegram-Bot-Api-Secret-Token` header. Returns 503 if not configured.
- **Server-side price/charge validation**: The checkout route re-fetches menu items, recomputes the item total, and recomputes the delivery charge from the address distance. Client-sent values are never trusted.
- **UPI verification**: Gemini Vision auto-verifies screenshot authenticity, amount, payee, timestamp, and UTR reuse. Failures route to admin manual review (never block the customer on an infrastructure failure).

## License

Proprietary — Apna Baithak. All rights reserved.
