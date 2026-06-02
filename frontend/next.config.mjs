import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

// Load .env.local from frontend dir and use parsed values so client bundle gets them reliably
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, ".env.local");
const parsed = fs.existsSync(envPath)
  ? dotenv.parse(fs.readFileSync(envPath, "utf8"))
  : {};
dotenv.config({ path: envPath, override: true });

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Inline from parsed file so client bundle gets values even when process.env is wrong (e.g. E2E worker)
  env: {
    NEXT_PUBLIC_SUPABASE_URL: parsed.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: parsed.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    NEXT_PUBLIC_API_URL: parsed.NEXT_PUBLIC_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "",
  },
  // Hostnames that are allowed to load Next.js dev-server internals (HMR
  // websocket, /_next/* asset chunks, error overlay frames). Without this,
  // accessing the dev server through anything other than localhost (in our
  // case the Tailscale Funnel hostname clariva-dev.tail363099.ts.net) emits
  // "Cross origin request detected" warnings now and will be HARD-blocked
  // in a future Next.js major. Pure dev-server hardening — has zero effect
  // on production builds (Vercel doesn't read this).
  // See: https://nextjs.org/docs/app/api-reference/config/next-config-js/allowedDevOrigins
  allowedDevOrigins: [
    "clariva-dev.tail363099.ts.net",
    "clariva-dev",
  ],

  /**
   * Permanent redirects for renamed routes.
   *
   * `/dashboard/service-reviews` → `/dashboard/booking-review`
   * Added 2026-05-14 by sidebar-restructure batch (sr-02 / DL-5).
   * Notification email templates and doctor bookmarks may still hit the
   * old path; the 308 keeps them working without a server-side rewrite.
   *
   * TODO: remove after 2026-06-15 if access logs show zero traffic on
   * `/dashboard/service-reviews` for 30 consecutive days. Until then,
   * keep this redirect in place.
   */
  async redirects() {
    return [
      {
        source: "/dashboard/service-reviews",
        destination: "/dashboard/booking-review",
        permanent: true,
      },
    ];
  },

  /**
   * Dev-only proxy so laptop-only work at http://localhost:3000 can reach the
   * local backend without Tailscale Funnel. Browser code uses same-origin
   * `/api/v1/...` when hostname is localhost (see lib/api-base.ts).
   * No effect on production builds (Vercel serves API from a separate origin).
   */
  async rewrites() {
    if (process.env.NODE_ENV !== "development") {
      return [];
    }
    return [
      {
        source: "/api/v1/:path*",
        destination: "http://localhost:3001/api/v1/:path*",
      },
    ];
  },
};

export default nextConfig;
