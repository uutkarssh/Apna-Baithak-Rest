import type { Metadata, Viewport } from "next";
import { AdminServiceWorkerRegister } from "@/components/pwa/admin-service-worker-register";
import { AdminInstallPrompt } from "@/components/pwa/admin-install-prompt";

/**
 * Admin route-segment layout.
 *
 * This layout applies to ALL routes under /admin/* and overrides the root
 * layout's metadata. The key fields being overridden:
 *
 *   - manifest      → /admin-manifest.json   (separate PWA identity)
 *   - applicationName → "Apna Baithak Admin"
 *   - appleWebApp.title → "Apna Baithak Admin"
 *   - themeColor    → #1A1A1A  (dark, so the iOS status bar blends with
 *                              the admin dashboard's dark chrome)
 *   - icons         → /admin-brand/...
 *
 * Because the admin manifest has `scope: "/admin"` and `start_url: "/admin"`,
 * when a user installs the admin PWA, the installed app:
 *   - Opens directly to /admin (not the customer home)
 *   - Has its own home-screen icon (red-orange gradient + ADMIN badge)
 *   - Runs in its own standalone window, separate from the customer PWA
 *   - Is uninstallable independently
 *
 * The admin SW (admin-sw.js) is registered with scope '/admin/' by the
 * AdminServiceWorkerRegister component below, so it does NOT interfere with
 * the customer SW (sw.js) which has scope '/'.
 */

export const metadata: Metadata = {
  title: {
    default: "Apna Baithak Admin",
    template: "%s · Apna Baithak Admin",
  },
  description:
    "Admin dashboard for Apna Baithak — manage orders, menu items, reviews and UPI verifications.",
  manifest: "/admin-manifest.json",
  applicationName: "Apna Baithak Admin",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Apna Baithak Admin",
  },
  icons: {
    icon: [
      { url: "/admin-brand/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/admin-brand/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/admin-brand/favicon-48x48.png", sizes: "48x48", type: "image/png" },
      { url: "/admin-brand/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/admin-brand/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/admin-brand/favicon.ico",
    apple: "/admin-brand/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#1A1A1A",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      {children}
      <AdminServiceWorkerRegister />
      <AdminInstallPrompt />
    </>
  );
}
