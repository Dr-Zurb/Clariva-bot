import { createClient } from "@/lib/supabase/client";

/** Refresh about a minute before `exp` so a register click never sends a dead JWT. */
const REFRESH_SKEW_MS = 60_000;

function tokenExpiryMs(accessToken: string): number | null {
  const payload = accessToken.split(".")[1];
  if (!payload) return null;
  try {
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/");
    const pad =
      padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
    const json = JSON.parse(atob(padded + pad)) as { exp?: unknown };
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function accessTokenNeedsRefresh(
  accessToken: string,
  nowMs: number = Date.now()
): boolean {
  const expMs = tokenExpiryMs(accessToken);
  if (expMs == null) return true;
  return expMs - nowMs < REFRESH_SKEW_MS;
}

/**
 * Browser-only: return a still-valid Supabase access token.
 * Server callers keep the token they already have (desk layout SSR).
 */
export async function getFreshBrowserAccessToken(
  current?: string
): Promise<string> {
  if (typeof window === "undefined") return current ?? "";
  try {
    if (current && !accessTokenNeedsRefresh(current)) return current;
    const supabase = createClient();
    const { data, error } = await supabase.auth.refreshSession();
    if (!error && data.session?.access_token) return data.session.access_token;
    const { data: stored } = await supabase.auth.getSession();
    return stored.session?.access_token ?? current ?? "";
  } catch {
    return current ?? "";
  }
}
