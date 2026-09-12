// Gemini Vision API — verifies a UPI payment screenshot.
//
// Sends the screenshot + a structured prompt to a Gemini vision-capable model,
// asking it to return a strict JSON response with:
//   is_authentic (boolean)      — does it look like a genuine UPI payment confirmation?
//   extracted_timestamp (string)— the payment timestamp shown in the screenshot
//   extracted_amount (number)   — the payment amount in rupees
//   extracted_payee (string)    — the payee/receiver UPI ID or name
//   extracted_utr (string)      — the UTR / transaction reference number
//   confidence (number)         — 0.0 to 1.0
//   reasoning (string)          — short note explaining the verdict
//
// Server-side ONLY — GEMINI_API_KEY is never exposed to the client.

import { TIMESTAMP_WINDOW_MS } from './upi'

export type GeminiVerification = {
  is_authentic: boolean
  extracted_timestamp: string | null
  extracted_amount: number | null
  extracted_payee: string | null
  extracted_utr: string | null
  confidence: number
  reasoning: string
}

export type VerificationChecks = {
  authentic: boolean
  timestamp: boolean
  amount: boolean
  payee: boolean
  utr: boolean // true if UTR is present AND not previously used (caller checks reuse)
  failedChecks: string[]
}

// Gemini Vision API endpoint.
// Tries gemini-2.0-flash first (latest); the calling code falls back to
// pending-verification if the API/model is unavailable, so a wrong model
// name never blocks the customer.
const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'

/**
 * Calls Gemini Vision with the screenshot + a structured prompt.
 * Returns the parsed structured response, or throws on error.
 *
 * If the API key is missing or the call fails, the caller should treat this
 * as a verification failure (mark order PENDING_VERIFICATION for admin review)
 * rather than blocking the customer.
 */
export async function verifyScreenshotWithGemini(params: {
  imageBase64: string
  mimeType: string
  expectedAmount: number
  expectedPayeeId: string
  expectedPayeeName: string
  serverTime: Date
}): Promise<{ result: GeminiVerification; raw: string }> {
  const { imageBase64, mimeType, expectedAmount, expectedPayeeId, expectedPayeeName, serverTime } =
    params
  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured')
  }

  const prompt = buildVerificationPrompt({
    expectedAmount,
    expectedPayeeId,
    expectedPayeeName,
    serverTimeIso: serverTime.toISOString(),
  })

  const body = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: mimeType,
              data: imageBase64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      // Force JSON output mode so we can parse programmatically
      responseMimeType: 'application/json',
      temperature: 0.1, // low temperature for deterministic extraction
      maxOutputTokens: 1024,
    },
  }

  const res = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const rawText = await res.text()

  if (!res.ok) {
    throw new Error(`Gemini API error ${res.status}: ${rawText.slice(0, 300)}`)
  }

  // Parse Gemini response → extract the text part → parse as JSON
  let jsonText: string
  try {
    const parsed = JSON.parse(rawText)
    jsonText = parsed?.candidates?.[0]?.content?.parts?.[0]?.text
    if (!jsonText) {
      throw new Error('empty text part in Gemini response')
    }
  } catch (e) {
    throw new Error(`Failed to parse Gemini response: ${(e as Error).message}`)
  }

  let result: GeminiVerification
  try {
    result = JSON.parse(jsonText)
  } catch (e) {
    throw new Error(`Gemini did not return valid JSON: ${jsonText.slice(0, 300)}`)
  }

  // Normalize: ensure all fields have the right types / nulls
  result = {
    is_authentic: Boolean(result.is_authentic),
    extracted_timestamp: result.extracted_timestamp ?? null,
    extracted_amount:
      typeof result.extracted_amount === 'number'
        ? result.extracted_amount
        : result.extracted_amount != null
        ? Number(String(result.extracted_amount).replace(/[^0-9.]/g, '')) || null
        : null,
    extracted_payee: result.extracted_payee ?? null,
    extracted_utr: result.extracted_utr ?? null,
    confidence: typeof result.confidence === 'number' ? result.confidence : 0.5,
    reasoning: result.reasoning ?? '',
  }

  return { result, raw: rawText }
}

function buildVerificationPrompt(params: {
  expectedAmount: number
  expectedPayeeId: string
  expectedPayeeName: string
  serverTimeIso: string
}): string {
  const { expectedAmount, expectedPayeeId, expectedPayeeName, serverTimeIso } = params
  return `You are a payment verification assistant. You are given an image that a customer claims is a UPI payment confirmation.

IMPORTANT — VALID IMAGE FORMATS: The image may be EITHER:
  (a) A direct screenshot of a UPI app's payment success screen (taken by the phone's screenshot function), OR
  (b) A shared/downloaded receipt image generated by the UPI app itself (e.g. Google Pay's "Share" button on the success screen, or a receipt downloaded from Transaction History).
BOTH formats are legitimate and valid. Google Pay (GPay) in India blocks direct screenshots on its payment success screen (the screenshot appears black/blank due to FLAG_SECURE), so GPay users MUST use the app's "Share" button to generate a receipt image — that shared receipt image is a genuine, valid payment confirmation and must NOT be flagged as suspicious purely because its visual layout differs from a raw screenshot. PhonePe, Paytm, BHIM, and most other UPI apps allow normal screenshots, so images from those apps may be raw screenshots.

When judging is_authentic, base your verdict on signs of tampering/fabrication ONLY — NOT on whether the image is a screenshot vs. a shared receipt. Signs of a FAKE/doctored image include: inconsistent fonts, mismatched UI elements, visible editing artifacts, obviously fabricated/generated layout, wrong app branding, pixel-level manipulation, text that doesn't align with the app's standard UI. A genuine shared receipt from GPay (which may have a slightly different layout, white background, or receipt-style format) should be marked is_authentic=true as long as it shows real payment confirmation details and has no tampering signs.

Analyze the image and extract the following information. Return ONLY a JSON object (no markdown, no commentary) with exactly these fields:

{
  "is_authentic": boolean,
  "extracted_timestamp": string | null,
  "extracted_amount": number | null,
  "extracted_payee": string | null,
  "extracted_utr": string | null,
  "confidence": number,
  "reasoning": string
}

Field definitions:

1. is_authentic (boolean): Does this image look like a GENUINE, unedited UPI payment confirmation? It may be a raw screenshot OR an app-generated shared receipt (both are valid). Set to false ONLY if you see signs of tampering/fabrication: inconsistent fonts, mismatched UI elements, visible editing artifacts, obviously fabricated/generated layout, wrong app branding, pixel manipulation. Set to true if it appears to be a real payment success confirmation (regardless of whether it's a screenshot or a shared receipt format).

2. extracted_timestamp (string | null): The date/time of the payment as shown in the image. Format it as ISO 8601 (YYYY-MM-DDTHH:MM:SS). If the image shows a date but no time, use 00:00:00. If no readable timestamp is found, return null. Use the timezone as shown (assume IST if not specified).

3. extracted_amount (number | null): The payment amount in rupees as a number (e.g. 200, not "200.00" or "₹200"). If no amount is found, return null.

4. extracted_payee (string | null): The payee/receiver UPI ID or name as shown in the image (e.g. "tiwarivivek857390-2@okaxis" or "Apna Baithak"). If the payee is not shown, return null.

5. extracted_utr (string | null): The UTR / transaction reference number / UPI reference ID as shown in the image (typically a 12-digit number for UPI, or a longer alphanumeric string). If no UTR is found, return null.

6. confidence (number): Your confidence in the extraction, from 0.0 to 1.0.

7. reasoning (string): A short note (1-2 sentences) explaining your verdict, especially if is_authentic is false. If you marked a shared receipt as authentic, note that it's a legitimate app-generated receipt format.

Context for your analysis:
- Expected payment amount: ${expectedAmount} rupees
- Expected payee UPI ID: ${expectedPayeeId}
- Expected payee name: ${expectedPayeeName}
- Current server time (IST): ${serverTimeIso}

Return ONLY the JSON object. Do not wrap it in markdown code fences.`
}

/**
 * Run all 5 verification checks against the Gemini result + the expected values.
 * Returns which checks passed/failed.
 *
 * The `utrReuse` param is whether the extracted UTR was already used to verify
 * a DIFFERENT order (the caller queries the DB for this).
 */
export function runVerificationChecks(params: {
  gemini: GeminiVerification
  expectedAmount: number
  expectedPayeeId: string
  expectedPayeeName: string
  serverTime: Date
  utrReuse: boolean // true = UTR already used on another verified order
}): VerificationChecks {
  const { gemini, expectedAmount, expectedPayeeId, expectedPayeeName, serverTime, utrReuse } = params

  // (a) Authenticity
  const authentic = gemini.is_authentic === true

  // (b) Timestamp — extracted timestamp must be within ±10 min of server time
  let timestampOk = false
  if (gemini.extracted_timestamp) {
    const extracted = new Date(gemini.extracted_timestamp)
    if (!isNaN(extracted.getTime())) {
      const diff = Math.abs(extracted.getTime() - serverTime.getTime())
      timestampOk = diff <= TIMESTAMP_WINDOW_MS
    }
  }

  // (c) Amount — exact match
  const amountOk =
    gemini.extracted_amount != null && gemini.extracted_amount === expectedAmount

  // (d) Payee — matches either the UPI ID or the name (case-insensitive, trimmed)
  const payeeOk = matchPayee(gemini.extracted_payee, expectedPayeeId, expectedPayeeName)

  // (e) UTR — present AND not reused on another verified order
  const utrOk = Boolean(gemini.extracted_utr) && !utrReuse

  const failedChecks: string[] = []
  if (!authentic) failedChecks.push('authenticity')
  if (!timestampOk) failedChecks.push('timestamp')
  if (!amountOk) failedChecks.push('amount')
  if (!payeeOk) failedChecks.push('payee')
  if (!utrOk) failedChecks.push('utr')

  return { authentic, timestamp: timestampOk, amount: amountOk, payee: payeeOk, utr: utrOk, failedChecks }
}

function matchPayee(
  extracted: string | null,
  expectedId: string,
  expectedName: string
): boolean {
  if (!extracted) return false
  const e = extracted.toLowerCase().trim()
  const id = expectedId.toLowerCase().trim()
  const name = expectedName.toLowerCase().trim()
  // Match if the extracted payee contains the expected ID or name (or vice versa)
  return (
    e.includes(id) ||
    id.includes(e) ||
    e.includes(name) ||
    name.includes(e)
  )
}
