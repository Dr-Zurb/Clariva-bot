/**
 * Post-auth routing helpers (auth-v2 · av2-02).
 *
 * `profile_completed` is routing-only (AV2-D3) — never a trust/authz boundary.
 * The real patient-facing gate remains doctor verification.
 */

export type AuthUserLike = {
  user_metadata?: Record<string, unknown> | null;
} | null;

/** True only when the flag is strictly `true` (routing convenience). */
export function isProfileCompleted(user: AuthUserLike): boolean {
  return user?.user_metadata?.profile_completed === true;
}

/**
 * Destination after a successful auth exchange / OTP verify.
 * Incomplete → complete-profile; complete → dashboard (or a safe `next`).
 */
export function destinationAfterAuth(
  user: AuthUserLike,
  next?: string | null
): string {
  if (!isProfileCompleted(user)) return "/complete-profile";
  return safeNextPath(next, "/dashboard");
}

/**
 * Same-origin relative path only. Rejects protocol-relative (`//…`) and
 * backslash tricks. Used for optional `?next=` on the OAuth callback.
 */
export function safeNextPath(
  next: string | null | undefined,
  fallback = "/dashboard"
): string {
  if (typeof next !== "string" || next.length === 0) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return fallback;
  }
  return next;
}
