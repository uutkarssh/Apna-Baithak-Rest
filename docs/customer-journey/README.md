# Apna Baithak — Customer Order Journey (Visual Guide)

This folder contains a complete step-by-step visual walkthrough of the customer
ordering journey on the Apna Baithak PWA, from opening the installed app to
receiving their order.

## Files

### Main document
- **`apna-baithak-customer-journey.pdf`** — 32-page PDF document with all 30
  screenshots, one per page, each with a step number badge, title, description,
  and the full screenshot. A4 portrait format, 1.89 MB.
  - Download this if you just want to read the guide.

### Individual screenshots
- **`journey-01-home-not-logged-in.png`** through **`journey-30-order-details.png`** —
  the 30 individual PNG screenshots referenced in the PDF.
  - Download these if you want to reuse individual screenshots in your own
    presentations, social media posts, or training materials.

## The 30 steps at a glance

| # | Step |
|---|------|
| 1 | Open the installed app |
| 2 | Tap "Sign in" (bottom-right corner) |
| 3 | Tap "Sign up" to create an account |
| 4 | Fill the form and tap "Create account" |
| 4b | Email verification screen |
| 5 | Return to the sign-in screen |
| 6 | Enter email and password |
| 7 | Logged in — home page |
| 8 | Home page (logged in, no address yet) |
| 9 | Tap "DELIVER TO" to set delivery location |
| 10 | Search for their area |
| 11 | Tap the matching search result |
| 12 | Fill the address details form |
| 13 | Tap "Confirm & Proceed" to save |
| 14 | Saved address appears in location picker |
| 15 | Home page — ready to order |
| 16 | Browse the home page |
| 17 | Scroll to see Featured Items |
| 18 | Tap "ADD" on an item |
| 19 | Add more items |
| 20 | Or tap "Menu" to see all categories |
| 21 | Tap a category to see its items |
| 22 | ADD button becomes a quantity stepper |
| 23 | Cart with multiple items and quantities |
| 24 | Tap "Cart" to review your order |
| 25 | Tap "Place Order" |
| 26 | Add a contact number (if prompted) |
| 27 | Checkout screen — pick payment mode |
| 28 | Tap "Place Order" to confirm |
| 29 | Tap "Track my order" |
| 30 | Tap "View details" for full order info |

## How these were captured

These screenshots were taken on the live production site
(https://apnabaithakcafe.vercel.app) using a real test customer account that
walked through the entire flow end-to-end. The test account and its order were
deleted after capture, so the production database is clean.

Each screenshot was captured at iPhone 14 viewport size (390×844 CSS pixels)
to match what most mobile customers see.

## Notes

- The screenshots reflect the state of the app as of the commit when they were
  captured. If the app's UI changes later, these screenshots will be out of
  date — regenerate them by re-running the walkthrough.
- Phone numbers, email addresses, and addresses shown in the screenshots are
  test data, not real customer information.
