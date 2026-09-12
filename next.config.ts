import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Bundle the public/ directory into the standalone server output so the
  // serverless function on Vercel can fs.readFile() the letterhead PNG and
  // the brand TTFs. Without this, buildReceiptPdf() cannot find the fonts,
  // falls back to StandardFonts.Helvetica (WinAnsi), and throws on the
  // first page.drawText(rupees(...)) because WinAnsi cannot encode ₹.
  output: "standalone",
  reactStrictMode: false,
  // Allow the sandbox preview gateway origin to load Next.js assets.
  allowedDevOrigins: ["*.space-z.ai"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "sxqnqorornkpdrmntpce.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
