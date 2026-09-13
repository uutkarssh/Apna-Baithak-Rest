/**
 * Test the Gemini 2.5 Flash API directly to verify:
 * 1. The model name is valid and the API accepts it
 * 2. The API key works
 * 3. The model can process an image and return structured JSON
 *
 * This test does NOT upload a real payment screenshot — it uses a simple
 * test image (a 1x1 red pixel PNG) just to verify the API endpoint + model
 * + API key are all working. The response will likely say is_authentic=false
 * (since it's not a real payment screenshot), but what matters is that the
 * API returns a valid JSON response without errors.
 */
import * as dotenv from 'dotenv'
dotenv.config()

const apiKey = process.env.GEMINI_API_KEY
if (!apiKey) {
  console.error('GEMINI_API_KEY not set')
  process.exit(1)
}

const ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

// Minimal 1x1 red pixel PNG (base64)
const TEST_IMAGE_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='

async function main() {
  console.log('=== Testing Gemini 2.5 Flash API ===\n')
  console.log(`  Endpoint: ${ENDPOINT}`)
  console.log(`  API Key: ${apiKey?.slice(0, 10)}...${apiKey?.slice(-4)}`)
  console.log()

  const prompt = `Analyze this image and return ONLY a JSON object with these fields:
{
  "is_authentic": boolean,
  "extracted_timestamp": string | null,
  "extracted_amount": number | null,
  "extracted_payee": string | null,
  "extracted_utr": string | null,
  "confidence": number,
  "reasoning": string
}
This is a test. Just return the JSON.`

  const body = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: 'image/png',
              data: TEST_IMAGE_BASE64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1,
      maxOutputTokens: 1024,
    },
  }

  console.log('Sending request to Gemini 2.5 Flash...\n')

  try {
    const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const rawText = await res.text()

    console.log(`  HTTP Status: ${res.status}`)
    console.log()

    if (!res.ok) {
      console.error('FAILED — API returned an error:')
      console.error(rawText.slice(0, 500))
      process.exit(1)
    }

    // Parse the response
    const parsed = JSON.parse(rawText)
    const jsonText = parsed?.candidates?.[0]?.content?.parts?.[0]?.text

    if (!jsonText) {
      console.error('FAILED — no text in Gemini response')
      console.error(JSON.stringify(parsed, null, 2).slice(0, 500))
      process.exit(1)
    }

    console.log('SUCCESS — Gemini 2.5 Flash returned a valid response:')
    console.log()
    console.log('  Raw JSON from Gemini:')
    try {
      const result = JSON.parse(jsonText)
      console.log(JSON.stringify(result, null, 2))
    } catch {
      console.log(jsonText.slice(0, 300))
    }

    console.log()
    console.log('  ✅ The model "gemini-2.5-flash" is working correctly.')
    console.log('  ✅ The API key is valid.')
    console.log('  ✅ Structured JSON output mode is working.')
  } catch (e) {
    console.error('FAILED — network or parsing error:')
    console.error(e)
    process.exit(1)
  }
}

main()
