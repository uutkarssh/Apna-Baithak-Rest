import type { Metadata, Viewport } from "next";
import { Poppins, Outfit } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Providers } from "@/components/providers/providers";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { InstallPrompt } from "@/components/pwa/install-prompt";

// Poppins (semibold) — used for headings, brand, prices, buttons
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// Outfit (semibold) — used for body text and UI
const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Apna Baithak — Order food online",
  description:
    "Apna Baithak — your neighbourhood kitchen on Suriyawan Road. Fresh pizzas, burgers, pasta, chaat & more. Order online for delivery within 5 km.",
  keywords: ["Apna Baithak", "food delivery", "Suriyawan", "Bankat Khas", "online food order"],
  authors: [{ name: "Apna Baithak" }],
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/brand/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/brand/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/favicon-48x48.png", sizes: "48x48", type: "image/png" },
    ],
    shortcut: "/brand/favicon.ico",
    apple: "/brand/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Apna Baithak",
  },
  applicationName: "Apna Baithak",
};

export const viewport: Viewport = {
  themeColor: "#FF5252",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${poppins.variable} ${outfit.variable} antialiased bg-background text-foreground`}
      >
        <Providers>{children}</Providers>
        <ServiceWorkerRegister />
        <InstallPrompt />
        <Toaster />
        <Sonner />
      </body>
    </html>
  );
}
