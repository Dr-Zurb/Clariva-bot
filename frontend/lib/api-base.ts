/**
 * Backend base URL for API calls (no trailing slash).
 * Server components may use API_URL / BACKEND_API_URL when different from the public URL.
 *
 * In local dev the browser often returns "" (same-origin): Next.js rewrites
 * `/api/v1/*` → `http://localhost:3001/api/v1/*`, and Tailscale Funnel path-routes
 * the same paths when the page is loaded from the funnel hostname.
 */
function normalizeBase(raw: string): string {
  return raw.trim().replace(/\/$/, "");
}

function isLocalDevHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

/** Tailscale MagicDNS / Funnel hostnames used in dev (see next.config allowedDevOrigins). */
function isDevFunnelHost(hostname: string): boolean {
  return hostname === "clariva-dev" || hostname.endsWith(".ts.net");
}

/** Browser dev: same-origin API via Next rewrite (localhost) or Funnel path routing. */
function browserDevSameOriginBase(): string | null {
  if (process.env.NODE_ENV !== "development") return null;
  if (typeof window === "undefined") return null;
  const { hostname } = window.location;
  if (isLocalDevHost(hostname) || isDevFunnelHost(hostname)) {
    return "";
  }
  return null;
}

export function getApiBaseUrl(): string {
  const sameOrigin = browserDevSameOriginBase();
  if (sameOrigin !== null) {
    return sameOrigin;
  }

  if (typeof window === "undefined") {
    const explicit =
      process.env.API_URL ?? process.env.BACKEND_API_URL ?? "";
    if (explicit) {
      return normalizeBase(explicit);
    }
    // SSR in `next dev`: hit the local backend directly (rewrites are browser-only).
    if (process.env.NODE_ENV === "development") {
      return "http://localhost:3001";
    }
    return normalizeBase(process.env.NEXT_PUBLIC_API_URL ?? "");
  }

  return normalizeBase(process.env.NEXT_PUBLIC_API_URL ?? "");
}

export function requireApiBaseUrl(): string {
  const base = getApiBaseUrl();
  // Empty string = same-origin `/api/v1/...` (dev proxy or Funnel path routing).
  if (base === "" && typeof window !== "undefined") {
    return "";
  }
  if (!base) {
    throw new Error(
      "API base URL is not configured. Set NEXT_PUBLIC_API_URL to your Clariva backend origin (e.g. https://your-api.onrender.com) in Vercel Environment Variables. For server-only overrides, set API_URL or BACKEND_API_URL."
    );
  }
  return base;
}
