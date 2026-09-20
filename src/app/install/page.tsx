// /app/install/page.tsx
//
// Dedicated install landing page — the URL encoded in the printed QR code.
// (https://apnabaithakcafe.vercel.app/install)
//
// Why a dedicated page (vs. just QR-coding the home URL):
//   - On Android Chrome, the page can listen for the `beforeinstallprompt`
//     event and show a single big "Install App" button that triggers the
//     native install prompt in one tap. (Auto-prompts are often suppressed
//     by Chrome's heuristics; a button tied to beforeinstallprompt always
//     works.)
//   - On iOS Safari, Web Push + PWA install only work after "Add to Home
//     Screen". The page detects iOS and shows clear step-by-step instructions
//     with a screenshot of the Share button.
//   - On desktop, we just tell the user to use the website directly (PWAs
//     on desktop are installable but most customers will be on mobile).
//
// The page does NOT require login — it's a public landing page. After install,
// the customer opens the PWA from their home screen, lands on /, and the
// normal app flow takes over (browse menu → sign in → order → enable push
// from the post-order screen or the home banner).

import type { Metadata } from 'next'
import InstallClient from './install-client'

export const metadata: Metadata = {
  title: 'Install Apna Baithak — Order food online',
  description:
    'Install the Apna Baithak app on your phone for the fastest way to order fresh pizzas, burgers, pasta, chaat & more. Delivered within 10 km of Suriyawan Road.',
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Install Apna Baithak',
    description:
      'Install the Apna Baithak app on your phone for the fastest way to order fresh food online.',
    type: 'website',
  },
}

export default function InstallPage() {
  return <InstallClient />
}
