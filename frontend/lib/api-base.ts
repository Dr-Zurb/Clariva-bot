/**
 * Backend base URL for API calls (no trailing slash).
 * Server components may use API_URL / BACKEND_API_URL when different from the public URL;
 * the browser always uses NEXT_PUBLIC_API_URL.
 */
function normalizeBase(raw: string): string {
  return raw.trim().replace(/\/$/, "");
}

export function getApiBaseUrl(): string {
  if (typeof window === "undefined") {
    const raw =
      process.env.API_URL ??
      process.env.BACKEND_API_URL ??
      process.env.NEXT_PUBLIC_API_URL ??
      "";
    return normalizeBase(typeof raw === "string" ? raw : "");
  }
  const raw = process.env.NEXT_PUBLIC_API_URL ?? "";
  return normalizeBase(typeof raw === "string" ? raw : "");
}

export function requireApiBaseUrl(): string {
  const base = getApiBaseUrl();
  if (!base) {
    throw new Error(
      "API base URL is not configured. Set NEXT_PUBLIC_API_URL to your Clariva backend origin (e.g. https://your-api.onrender.com) in Vercel Environment Variables. For server-only overrides, set API_URL or BACKEND_API_URL."
    );
  }
  return base;
}
