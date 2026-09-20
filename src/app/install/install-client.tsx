'use client'

// InstallClient — interactive install landing page.
//
// Detects the user's OS/browser and shows the right install flow:
//
//   Android Chrome (or any Chromium browser with beforeinstallprompt support)
//     → Shows a big "Install App" button that fires the native install prompt.
//       This is the true 1-click install experience.
//
//   iOS Safari
//     → Shows step-by-step instructions to tap the Share button →
//       "Add to Home Screen". iOS doesn't allow programmatic install prompts,
//       so we can't make it 1-click — but the steps are clear and short.
//
//   Desktop / other browsers
//     → Shows a "Open the website" button + brief explanation that the
//       site is a PWA they can also install from the browser's address bar
//       install icon (Chrome) or via the ⋮ menu.
//
// The page also:
//   - Detects if the PWA is ALREADY installed (display-mode: standalone)
//     and shows an "Open App" button instead of install instructions.
//   - Shows the restaurant brand + a few key selling points (free delivery,
//     menu size, etc.) so the QR-code scanner has context.
//   - Has a fallback "Open website" link at the bottom — never dead-ends
//     the user even if install isn't possible on their browser.

import { useEffect, useState } from 'react'
import { Download, Share, Smartphone, Home, Loader2, CheckCircle2, ExternalLink, Bell } from 'lucide-react'
import { motion } from 'framer-motion'

type Platform = 'android-installed' | 'ios-installed' | 'android' | 'ios' | 'desktop' | 'standalone' | 'loading'

// Type for the BeforeInstallPromptEvent — not in the standard lib.dom.d.ts yet.
// See https://developer.mozilla.org/en-US/docs/Web/API/BeforeInstallPromptEvent
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallClient() {
  const [platform, setPlatform] = useState<Platform>('loading')
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installing, setInstalling] = useState(false)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // 1. Check if the PWA is already installed (running in standalone mode)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    if (isStandalone) {
      setPlatform('standalone')
      return
    }

    // 2. Detect OS/browser
    const ua = navigator.userAgent
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream
    const isAndroid = /Android/i.test(ua)
    const isStandaloneIOS = (window.navigator as any).standalone === true

    if (isStandaloneIOS) {
      setPlatform('ios-installed')
      return
    }
    if (isIOS) {
      setPlatform('ios')
      return
    }
    if (isAndroid) {
      setPlatform('android')
      // Don't return — keep listening for beforeinstallprompt below
    } else {
      // Desktop or other — but still listen for beforeinstallprompt in case
      // it's a Chromium-based desktop browser that supports PWA install.
      setPlatform('desktop')
    }

    // 3. Listen for the beforeinstallprompt event (Android Chrome + desktop Chromium)
    //    We capture the event but DON'T immediately prompt — we save it for the
    //    user's tap on the Install button. This is the recommended pattern from
    //    https://web.dev/articles/install-criteria
    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault() // suppress the auto-prompt (Chrome's heuristics are unreliable)
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      // If we detected desktop but Chromium supports install, switch to android-like UI
      setPlatform((p) => (p === 'desktop' ? 'android' : p))
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)

    // 4. Listen for the appinstalled event — fires after successful install
    function onAppInstalled() {
      setInstalled(true)
      setDeferredPrompt(null)
    }
    window.addEventListener('appinstalled', onAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [])

  async function handleInstallClick() {
    if (!deferredPrompt) return
    setInstalling(true)
    try {
      await deferredPrompt.prompt()
      const choice = await deferredPrompt.userChoice
      if (choice.outcome === 'accepted') {
        setInstalled(true)
      }
      // Either way, clear the deferred prompt — it can only be used once
      setDeferredPrompt(null)
    } catch (e) {
      console.error('Install prompt failed:', e)
    } finally {
      setInstalling(false)
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-brand/5 via-background to-brand/10">
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-8">
        {/* Brand header */}
        <header className="mb-6 flex flex-col items-center text-center">
          <div className="grid h-20 w-20 place-items-center rounded-2xl bg-brand shadow-lg">
            <span className="text-3xl font-extrabold text-brand-foreground">AB</span>
          </div>
          <h1 className="mt-3 text-2xl font-extrabold text-foreground">Apna Baithak</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your neighbourhood kitchen on Suriyawan Road
          </p>
        </header>

        {/* Selling points */}
        <section className="mb-6 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-card p-3 shadow-sm">
            <p className="text-lg font-extrabold text-brand">10km</p>
            <p className="text-[10px] text-muted-foreground">delivery radius</p>
          </div>
          <div className="rounded-xl bg-card p-3 shadow-sm">
            <p className="text-lg font-extrabold text-brand">25-35</p>
            <p className="text-[10px] text-muted-foreground">min delivery</p>
          </div>
          <div className="rounded-xl bg-card p-3 shadow-sm">
            <p className="text-lg font-extrabold text-brand">16+</p>
            <p className="text-[10px] text-muted-foreground">menu items</p>
          </div>
        </section>

        {/* Main install card */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex-1 rounded-3xl border border-border/60 bg-card p-6 shadow-md"
        >
          {platform === 'loading' && (
            <div className="flex flex-col items-center justify-center gap-3 py-10">
              <Loader2 className="h-8 w-8 animate-spin text-brand" />
              <p className="text-sm text-muted-foreground">Checking your device…</p>
            </div>
          )}

          {platform === 'standalone' && (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <div className="grid h-16 w-16 place-items-center rounded-full bg-emerald-100">
                <CheckCircle2 className="h-9 w-9 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-lg font-extrabold text-foreground">App is installed!</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  You&apos;re already using the Apna Baithak app. Enjoy!
                </p>
              </div>
              <a
                href="/"
                className="mt-2 inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-bold text-brand-foreground shadow-md transition hover:brightness-105 active:scale-95"
              >
                <Home className="h-4 w-4" /> Open the app
              </a>
            </div>
          )}

          {platform === 'android' && !installed && (
            <div className="flex flex-col items-center gap-4 py-2 text-center">
              <div className="grid h-16 w-16 place-items-center rounded-full bg-brand/10">
                <Download className="h-9 w-9 text-brand" />
              </div>
              <div>
                <h2 className="text-lg font-extrabold text-foreground">Install the app</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Get the full Apna Baithak experience — faster than the browser, works offline, and you&apos;ll get push notifications when your order status changes.
                </p>
              </div>
              {deferredPrompt ? (
                <button
                  onClick={handleInstallClick}
                  disabled={installing}
                  className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand px-6 py-3.5 text-sm font-bold text-brand-foreground shadow-md transition hover:brightness-105 active:scale-95 disabled:opacity-50"
                >
                  {installing ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" /> Installing…
                    </>
                  ) : (
                    <>
                      <Download className="h-5 w-5" /> Install App
                    </>
                  )}
                </button>
              ) : (
                <div className="mt-2 w-full rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
                  If the Install button doesn&apos;t appear, tap the ⋮ menu in your browser&apos;s top-right corner → <b>Install app</b> / <b>Add to Home screen</b>.
                </div>
              )}
              <a
                href="/"
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
              >
                Or continue in browser <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}

          {platform === 'android' && installed && (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <div className="grid h-16 w-16 place-items-center rounded-full bg-emerald-100">
                <CheckCircle2 className="h-9 w-9 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-lg font-extrabold text-foreground">Installed!</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Look for the Apna Baithak icon on your home screen. Tap it to open the app.
                </p>
              </div>
              <a
                href="/"
                className="mt-2 inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-bold text-brand-foreground shadow-md transition hover:brightness-105 active:scale-95"
              >
                <Home className="h-4 w-4" /> Open the app
              </a>
            </div>
          )}

          {platform === 'ios' && (
            <div className="flex flex-col gap-4 py-2">
              <div className="flex flex-col items-center gap-2 text-center">
                <div className="grid h-16 w-16 place-items-center rounded-full bg-brand/10">
                  <Share className="h-9 w-9 text-brand" />
                </div>
                <h2 className="text-lg font-extrabold text-foreground">Add to Home Screen</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  On iPhone/iPad, you install the app via Safari&apos;s Share menu. It takes 3 taps.
                </p>
              </div>

              <ol className="mt-2 flex flex-col gap-3">
                <li className="flex items-start gap-3 rounded-xl bg-muted/50 p-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-brand-foreground">1</span>
                  <div>
                    <p className="text-sm font-bold text-foreground">Tap the Share button</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      It&apos;s the square with the up-arrow at the bottom of Safari (or top-right on iPad).
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-3 rounded-xl bg-muted/50 p-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-brand-foreground">2</span>
                  <div>
                    <p className="text-sm font-bold text-foreground">Choose &ldquo;Add to Home Screen&rdquo;</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Scroll down the share sheet, tap <b>Add to Home Screen</b>.
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-3 rounded-xl bg-muted/50 p-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-brand-foreground">3</span>
                  <div>
                    <p className="text-sm font-bold text-foreground">Tap &ldquo;Add&rdquo;</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      The app icon will appear on your home screen. Open it from there to get push notifications for your orders.
                    </p>
                  </div>
                </li>
              </ol>

              <div className="mt-2 flex items-start gap-2 rounded-xl bg-blue-50 p-3 text-xs text-blue-800">
                <Bell className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <b>Push notifications only work in the installed app</b> — not in regular Safari tabs. After installing, open the app from your home screen and place an order to enable them.
                </span>
              </div>

              <a
                href="/"
                className="mt-2 inline-flex items-center justify-center gap-1 text-xs font-semibold text-brand hover:underline"
              >
                Or continue in browser <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}

          {platform === 'desktop' && (
            <div className="flex flex-col items-center gap-4 py-2 text-center">
              <div className="grid h-16 w-16 place-items-center rounded-full bg-brand/10">
                <Smartphone className="h-9 w-9 text-brand" />
              </div>
              <div>
                <h2 className="text-lg font-extrabold text-foreground">Open on your phone for the best experience</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  The Apna Baithak app is designed for mobile. Scan the QR code on the flyer with your phone camera, or open this link on your phone.
                </p>
              </div>
              <a
                href="/"
                className="mt-2 inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-bold text-brand-foreground shadow-md transition hover:brightness-105 active:scale-95"
              >
                <Home className="h-4 w-4" /> Open the website
              </a>
              <p className="mt-2 text-[11px] text-muted-foreground">
                (On desktop Chrome/Edge, you can also install this site as an app from the install icon in the address bar.)
              </p>
            </div>
          )}
        </motion.section>

        {/* Footer */}
        <footer className="mt-6 text-center">
          <p className="text-xs text-muted-foreground">
            Freshly made. Delivered within 10 km.
          </p>
          <p className="mt-1 text-xs font-semibold text-brand">
            📞 +91 7307594163
          </p>
        </footer>
      </div>
    </main>
  )
}
