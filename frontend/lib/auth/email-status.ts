/**
 * Signup/signin email preflight (auth-password · AP-D17 + signup-orphan harden).
 * Calls the public backend endpoint — no Bearer token.
 *
 * `confirmed` distinguishes a usable account from an unconfirmed stub left
 * behind when OTP email delivery failed after Supabase created the user.
 */

import { requireApiBaseUrl } from "@/lib/api-base";

export type EmailStatusResult =
  | { ok: true; exists: boolean; confirmed: boolean }
  | { ok: false; message: string };

/**
 * Returns whether an account already exists for this email, and whether it is
 * confirmed. On network/API failure, returns ok:false so the caller can
 * surface a generic error (do not proceed to OTP — better fail closed than
 * send a code to an existing confirmed account as if it were a new signup).
 */
export async function checkEmailStatus(
  email: string
): Promise<EmailStatusResult> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) {
    return { ok: false, message: "Please enter your email." };
  }

  try {
    const res = await fetch(
      `${requireApiBaseUrl()}/api/v1/auth/email-status`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
        cache: "no-store",
      }
    );
    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      data?: { exists?: boolean; confirmed?: boolean };
      error?: { message?: string };
    };

    if (!res.ok || json.success === false) {
      if (res.status === 429) {
        return {
          ok: false,
          message: "Too many requests. Wait a moment and try again.",
        };
      }
      return {
        ok: false,
        message: "Could not verify email. Please try again.",
      };
    }

    return {
      ok: true,
      exists: json.data?.exists === true,
      // Fail closed: missing `confirmed` from an older backend → treat as confirmed
      // when exists, so we never silently re-OTP a real account.
      confirmed:
        json.data?.exists === true
          ? json.data?.confirmed !== false
          : json.data?.confirmed === true,
    };
  } catch {
    return {
      ok: false,
      message: "Could not verify email. Please try again.",
    };
  }
}
