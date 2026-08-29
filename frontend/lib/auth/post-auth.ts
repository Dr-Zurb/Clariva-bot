/**
 * Post-auth routing helpers (auth-v2 · av2-02).
 *
 * `profile_completed` is routing-only (AV2-D3) — never a trust/authz boundary.
 * The real patient-facing gate remains doctor verification.
 */

export type AuthUserLike = {
  user_metadata?: Record<string, unknown> | null;
  app_metadata?: Record<string, unknown> | null;
} | null;

/** True only when the flag is strictly `true` (routing convenience). */
export function isProfileCompleted(user: AuthUserLike): boolean {
  return user?.user_metadata?.profile_completed === true;
}

/**
 * JWT hint for human front-desk staff (receptionist-portal P1).
 * Backend `clinic_staff` is authoritative; this is routing only (P1-Q2).
 */
export function isReceptionistRole(user: AuthUserLike): boolean {
  return user?.app_metadata?.role === "receptionist";
}

function receptionistHomePath(next?: string | null): string {
  const dest = safeNextPath(next, "/desk");
  if (
    dest.startsWith("/dashboard") ||
    dest.startsWith("/admin") ||
    dest.startsWith("/complete-profile")
  ) {
    return "/desk";
  }
  return dest;
}

/**
 * Destination after a successful auth exchange / OTP verify.
 * Receptionist → /desk (no profile_completed). Incomplete doctor →
 * complete-profile; complete doctor → dashboard (or a safe `next`).
 */
export function destinationAfterAuth(
  user: AuthUserLike,
  next?: string | null
): string {
  if (isReceptionistRole(user)) return receptionistHomePath(next);
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
