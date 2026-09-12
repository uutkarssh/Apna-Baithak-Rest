'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { authedFetch } from '@/components/providers/providers'
import {
  ArrowLeft,
  Clock,
  Upload,
  Loader2,
  XCircle,
  Smartphone,
  RefreshCw,
  Info,
  Share2,
  Camera,
  CheckCircle2,
} from 'lucide-react'
import { useApp } from '@/store/app'
import { rupees } from '@/lib/format'
import { RESTAURANT } from '@/lib/constants'
import type { Order } from '@/lib/types'
import { toast } from 'sonner'

type Attempt = {
  id: string
  attemptNumber: number
  status: string
  upiTxnRef: string
  amount: number
  payeeVpa: string
  payeeName: string
  startedAt: string
  expiresAt: string
  screenshotUrl: string | null
  uploadedAt: string | null
}

type Phase =
  | 'checking' // initial: fetching order's current UPI status
  | 'initiating' // creating a new payment attempt
  | 'awaiting_payment' // QR + Pay button + countdown + upload visible
  | 'verifying' // screenshot uploaded, Gemini verifying
  | 'expired' // 5-min window lapsed, retry available

export function UpiPaymentView({ order }: { order: Order }) {
  const setView = useApp((s) => s.setView)
  const goToOrderConfirmation = useApp((s) => s.goToOrderConfirmation)
  const [phase, setPhase] = useState<Phase>('checking')
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [deepLink, setDeepLink] = useState<string>('')
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const [remainingMs, setRemainingMs] = useState<number>(0)
  const [verifying, setVerifying] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // === GUARD: On mount, check if this order's payment is already resolved. ===
  // If the order is already PAID or PENDING_VERIFICATION (e.g. customer pressed
  // back button or navigated here manually after completion), immediately
  // redirect to the order-confirmation screen. Never re-show the Pay button or
  // upload form for a resolved order.
  useEffect(() => {
    let cancelled = false
    async function checkStatus() {
      try {
        const res = await authedFetch(`/api/orders/${order.id}/upi/status`)
        if (!res.ok) {
          // If status check fails, proceed to initiate a new attempt
          if (!cancelled) initiateAttempt()
          return
        }
        const data = await res.json()
        const upiStatus = data?.order?.upiStatus
        if (cancelled) return
        if (upiStatus === 'PAID') {
          // Already paid — redirect to confirmation
          goToOrderConfirmation(order, 'PAID')
        } else if (upiStatus === 'PENDING_VERIFICATION') {
          // Already pending verification — redirect to confirmation
          goToOrderConfirmation(order, 'PENDING_VERIFICATION')
        } else {
          // No active resolved state — start a fresh payment attempt
          initiateAttempt()
        }
      } catch {
        if (!cancelled) initiateAttempt()
      }
    }
    checkStatus()
    return () => {
      cancelled = true
    }
  }, [order.id])

  // Start a new payment attempt
  const initiateAttempt = useCallback(async () => {
    setPhase('initiating')
    setVerifying(false)
    try {
      const res = await authedFetch(`/api/orders/${order.id}/upi/initiate`, {
        method: 'POST',
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        // If the order is already paid/pending, the API will refuse — redirect
        // to confirmation instead of showing an error.
        if (j.error && /already paid|pending verification/i.test(j.error)) {
          const status = /pending verification/i.test(j.error)
            ? 'PENDING_VERIFICATION'
            : 'PAID'
          goToOrderConfirmation(order, status)
          return
        }
        throw new Error(j.error || 'Failed to start payment')
      }
      const data = await res.json()
      setAttempt(data.attempt)
      setDeepLink(data.deepLink)
      setQrDataUrl(data.qrDataUrl)
      setPhase('awaiting_payment')
      // Auto-open the UPI app on mobile (will fail silently on desktop, where
      // the QR code is the primary payment method)
      window.location.href = data.deepLink
    } catch (e: any) {
      toast.error(e.message)
      setPhase('expired')
    }
  }, [order.id, goToOrderConfirmation])

  // Countdown timer
  useEffect(() => {
    if (!attempt || phase !== 'awaiting_payment') return
    const tick = () => {
      const ms = new Date(attempt.expiresAt).getTime() - Date.now()
      setRemainingMs(Math.max(0, ms))
      if (ms <= 0) {
        setPhase('expired')
      }
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [attempt, phase])

  function openUpiApp() {
    if (deepLink) {
      window.location.href = deepLink
    }
  }

  // === Handle screenshot upload + Gemini verification ===
  // After the result comes back (VERIFIED or PENDING_VERIFICATION), we
  // IMMEDIATELY navigate to the order-confirmation screen — we do NOT stay on
  // this payment/upload screen. goToOrderConfirmation replaces history so the
  // back button can't return here.
  async function handleUpload(file: File) {
    if (!attempt) return
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5MB')
      return
    }
    setPhase('verifying')
    setVerifying(true)
    try {
      const fd = new FormData()
      fd.append('screenshot', file)
      fd.append('attemptId', attempt.id)
      const res = await authedFetch(`/api/orders/${order.id}/upi/upload`, {
        method: 'POST',
        body: fd,
      })
      const j = await res.json()
      if (!res.ok) {
        if (j.expired) {
          setPhase('expired')
          toast.error(j.error)
        } else {
          throw new Error(j.error || 'Upload failed')
        }
        return
      }
      // === AUTO-REDIRECT on completion ===
      // Whether VERIFIED or PENDING_VERIFICATION, navigate to the order
      // confirmation screen immediately. The confirmation screen shows the
      // appropriate status (Paid vs Pending Verification).
      if (j.outcome === 'VERIFIED') {
        toast.success(j.message || 'Payment verified! Your order is confirmed.')
        goToOrderConfirmation(order, 'PAID')
      } else {
        // PENDING_VERIFICATION — order is placed, awaiting manual review
        toast.error(
          j.message ||
            "We couldn't automatically verify your payment. Your order is pending manual verification."
        )
        goToOrderConfirmation(order, 'PENDING_VERIFICATION')
      }
    } catch (e: any) {
      toast.error(e.message)
      setPhase('awaiting_payment')
    } finally {
      setVerifying(false)
    }
  }

  // === Handle "Continue without screenshot" ===
  // Customer has paid but can't/won't upload a screenshot. Sends the order to
  // manual verification (no screenshot) and shows a reassuring message.
  async function handleContinueWithoutScreenshot() {
    if (!attempt) return
    if (
      !confirm(
        'If you have completed the payment, do not worry — our team will verify it manually. Click OK to continue without uploading a screenshot. Your order is placed.'
      )
    ) {
      return
    }
    setVerifying(true)
    try {
      const res = await authedFetch(`/api/orders/${order.id}/upi/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId: attempt.id }),
      })
      const j = await res.json()
      if (!res.ok) {
        throw new Error(j.error || 'Failed to submit for manual review')
      }
      // Auto-redirect to order confirmation (pending verification state)
      toast.success(
        j.message ||
          "Your order is placed and pending manual verification. If you've paid, don't worry — our team will confirm shortly."
      )
      goToOrderConfirmation(order, 'PENDING_VERIFICATION')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setVerifying(false)
    }
  }

  // === RENDER ===
  const mm = Math.floor(remainingMs / 60000)
  const ss = Math.floor((remainingMs % 60000) / 1000)
  const timeStr = `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`

  return (
    <div className="flex min-h-full flex-col pb-6">
      <header className="sticky top-0 z-10 bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setView('orders')}
            className="grid h-9 w-9 place-items-center rounded-full bg-muted"
            aria-label="Cancel and go to orders"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-xl font-bold text-foreground">UPI Payment</h1>
        </div>
      </header>

      <div className="flex flex-col gap-4 px-4">
        {/* Order summary */}
        <section className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Order</span>
            <span className="text-sm font-bold text-foreground">{order.orderNumber}</span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Amount to pay</span>
            <span className="text-2xl font-extrabold text-brand">{rupees(order.totalAmount)}</span>
          </div>
        </section>

        {/* === CHECKING (initial status check) === */}
        {phase === 'checking' && (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <Loader2 className="h-8 w-8 animate-spin text-brand" />
            <p className="text-sm text-muted-foreground">Checking payment status…</p>
          </div>
        )}

        {/* === INITIATING === */}
        {phase === 'initiating' && (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <Loader2 className="h-8 w-8 animate-spin text-brand" />
            <p className="text-sm text-muted-foreground">Preparing your payment…</p>
          </div>
        )}

        {/* === AWAITING PAYMENT (QR + Pay button + countdown + upload) === */}
        {(phase === 'awaiting_payment' || phase === 'verifying') && attempt && (
          <>
            {/* Countdown timer */}
            <div
              className={`flex items-center justify-center gap-2 rounded-2xl p-3 text-center ${
                remainingMs < 60000 ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
              }`}
            >
              <Clock className="h-5 w-5" />
              <span className="text-sm font-bold">
                {verifying ? 'Verifying payment…' : `Time remaining: ${timeStr}`}
              </span>
            </div>

            {/* QR code for desktop scanning */}
            <section className="flex flex-col items-center rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
              <p className="mb-3 text-center text-xs font-bold uppercase text-muted-foreground">
                Scan to Pay with any UPI app
              </p>
              {qrDataUrl && (
                <img
                  src={qrDataUrl}
                  alt="UPI Payment QR Code"
                  className="h-64 w-64 rounded-xl border border-border"
                />
              )}
              <p className="mt-3 text-center text-xs text-muted-foreground">
                {attempt.payeeName} · {attempt.payeeVpa}
              </p>
              <p className="mt-1 text-center text-[11px] text-muted-foreground">
                Ref: {attempt.upiTxnRef}
              </p>
            </section>

            {/* Pay button (opens UPI app on mobile) */}
            <button
              onClick={openUpiApp}
              disabled={verifying}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3.5 text-sm font-bold text-brand-foreground shadow-md disabled:opacity-50"
            >
              <Smartphone className="h-4 w-4" />
              {verifying ? 'Verifying payment…' : `Pay ${rupees(order.totalAmount)} via UPI app`}
            </button>

            {/* === Upload section with GPay-specific guidance === */}
            <section className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
              <p className="mb-2 text-xs font-bold uppercase text-muted-foreground">
                After paying, upload the confirmation image
              </p>

              {/* GPay vs other apps guidance */}
              <div className="mb-3 space-y-2">
                <div className="rounded-lg bg-blue-50 p-2.5">
                  <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-blue-900">
                    <Share2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />
                    <span>
                      <strong>Using Google Pay?</strong> Screenshots are blocked (appear black).
                      Instead, tap the{' '}
                      <strong>&quot;Share&quot;</strong> button on the payment success screen — or
                      go to <strong>Transaction History</strong> → select the transaction → tap{' '}
                      <strong>Share/Download</strong> — then upload that shared receipt image here.
                    </span>
                  </p>
                </div>
                <div className="rounded-lg bg-emerald-50 p-2.5">
                  <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-emerald-900">
                    <Camera className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    <span>
                      <strong>Using PhonePe, Paytm, BHIM, or other apps?</strong> A regular
                      screenshot of the payment success screen works fine — just take a screenshot
                      and upload it.
                    </span>
                  </p>
                </div>
              </div>

              <p className="mb-3 text-xs text-muted-foreground">
                Upload the image within <strong>{timeStr}</strong>. We&apos;ll verify it
                automatically with AI — this usually takes a few seconds.
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleUpload(f)
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={verifying}
                className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-brand py-3 text-sm font-bold text-brand disabled:opacity-50"
              >
                {verifying ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Verifying with AI…
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" /> Upload Payment Confirmation
                  </>
                )}
              </button>

              {/* Divider */}
              <div className="my-3 flex items-center gap-3 text-[10px] text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                OR
                <span className="h-px flex-1 bg-border" />
              </div>

              {/* Continue without screenshot — same visual weight as the upload
                  button (same padding, border-2, text-sm) so the two options
                  feel familiar. Uses a softer amber border to distinguish it
                  as the secondary option. */}
              <button
                onClick={handleContinueWithoutScreenshot}
                disabled={verifying}
                className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-amber-400 bg-amber-50 py-3 text-sm font-bold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
              >
                {verifying ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {verifying ? 'Submitting…' : 'I have paid — Continue without screenshot'}
              </button>
              <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
                If you&apos;ve completed the payment but can&apos;t upload the screenshot, tap above.
                Your order is placed — our team will verify your payment manually and confirm it
                shortly. Don&apos;t worry, you won&apos;t be charged twice.
              </p>
            </section>

            {/* Helper note */}
            <div className="flex items-start gap-2 rounded-xl bg-muted/30 p-2.5">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Once you upload the image, we&apos;ll verify it and take you to your order
                confirmation automatically. If we can&apos;t verify it instantly, your order is
                still placed — our team will confirm manually.
              </p>
            </div>
          </>
        )}

        {/* === EXPIRED === */}
        {phase === 'expired' && (
          <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
            <div className="grid h-20 w-20 place-items-center rounded-full bg-red-100">
              <XCircle className="h-12 w-12 text-red-600" />
            </div>
            <h2 className="text-xl font-extrabold text-foreground">Payment Window Expired</h2>
            <p className="px-4 text-sm text-muted-foreground">
              The 5-minute payment window has lapsed. You can start a new payment attempt below.
            </p>
            <button
              onClick={() => initiateAttempt()}
              className="mt-4 flex w-full max-w-sm items-center justify-center gap-2 rounded-xl bg-brand py-3 text-sm font-bold text-brand-foreground"
            >
              <RefreshCw className="h-4 w-4" /> Start new payment attempt
            </button>
          </div>
        )}

        <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
          By paying, you agree that orders cannot be cancelled or refunded once preparation begins at{' '}
          {RESTAURANT.name}. If you face any issues, call us at {RESTAURANT.phone}.
        </p>
        <div className="h-8" />
      </div>
    </div>
  )
}
