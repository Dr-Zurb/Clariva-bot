/**
 * Browser auth methods (auth-v2 · av2-02 + auth-password · ap-01 / ap-05).
 *
 * Google = OAuth code flow → `/auth/callback`.
 * Email login = password-first + OTP fallback (`shouldCreateUser: false`).
 * Email signup = OTP-verify email, then `updateUser({ password })` (AP-D9).
 * Recovery = Email OTP only (no reset-link).
 */

import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

export type AuthResult =
  | { ok: true; user?: User }
  | { ok: false; message: string };

/** Matches OQ-1 draft + Supabase min-length config (ap-04a). */
export const MIN_PASSWORD_LENGTH = 8;

/** Map Supabase auth errors to doctor-facing copy (never log the raw email). */
export function authErrorMessage(error: {
  message?: string;
  code?: string;
}): string {
  const msg = (error?.message ?? "").toLowerCase();
  const code = (error?.code ?? "").toLowerCase();

  if (
    msg.includes("invalid login credentials") ||
    code === "invalid_credentials"
  ) {
    // Known email already confirmed via AP-D18 preflight on password sign-in;
    // generic "email or password" would be security theater + confusing UX.
    return "Incorrect password — or use a code instead.";
  }
  if (
    msg.includes("user already registered") ||
    msg.includes("already been registered") ||
    code === "email_exists" ||
    code === "user_already_exists"
  ) {
    return "An account already exists — sign in instead.";
  }
  if (
    msg.includes("leaked") ||
    msg.includes("pwned") ||
    msg.includes("data breach") ||
    msg.includes("compromised") ||
    (code === "weak_password" &&
      (msg.includes("hibp") || msg.includes("leak") || msg.includes("breach")))
  ) {
    return "That password has appeared in a data breach. Choose another.";
  }
  if (
    code === "weak_password" ||
    msg.includes("password should be at least") ||
    msg.includes("password is too short") ||
    (msg.includes("password") && msg.includes("at least"))
  ) {
    return `Password is too short (min ${MIN_PASSWORD_LENGTH} characters).`;
  }
  if (
    msg.includes("token has expired") ||
    msg.includes("otp_expired") ||
    code === "otp_expired"
  ) {
    return "That code has expired. Request a new one.";
  }
  if (
    msg.includes("otp") &&
    (msg.includes("invalid") || msg.includes("token"))
  ) {
    return "That code is invalid. Check and try again.";
  }
  if (msg.includes("email rate limit") || code === "over_email_send_rate_limit") {
    return "Too many codes sent. Wait a minute and try again.";
  }
  // Supabase Auth creates the user, then fails the email send (SMTP / built-in
  // rate cap). Surface that clearly so the doctor retries instead of assuming
  // the whole signup crashed — and so an orphaned unconfirmed row is expected.
  if (
    msg.includes("error sending") ||
    msg.includes("unable to send") ||
    msg.includes("failed to send") ||
    msg.includes("confirmation email") ||
    (msg.includes("magic link") && msg.includes("send")) ||
    (code === "unexpected_failure" && msg.includes("email")) ||
    code === "smtp_error"
  ) {
    return "We couldn't send your verification code. Wait a minute and try again.";
  }
  // Login OTP with shouldCreateUser:false (AP-D10) — unknown email.
  if (
    code === "otp_disabled" ||
    msg.includes("signups not allowed for otp") ||
    msg.includes("user not found") ||
    code === "user_not_found"
  ) {
    return "No account found — create one.";
  }
  if (msg.includes("signups not allowed")) {
    return "Sign-up is temporarily unavailable. Try again later.";
  }
  if (msg.includes("provider is not enabled") || msg.includes("validation_failed")) {
    return "This sign-in method is not available yet.";
  }
  return "Something went wrong. Please try again.";
}

export type SendEmailOtpOptions = {
  /** Default true. Login "use a code" passes false (AP-D10). */
  createIfMissing?: boolean;
};

function configCatchMessage(err: unknown): string {
  return err instanceof Error && err.message.startsWith("Supabase is not configured")
    ? err.message
    : "Something went wrong. Please try again.";
}

export async function signInWithGoogle(): Promise<AuthResult> {
  try {
    const supabase = createClient();
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback`,
      },
    });
    if (error) return { ok: false, message: authErrorMessage(error) };
    return { ok: true };
  } catch (err) {
    return { ok: false, message: configCatchMessage(err) };
  }
}

export async function sendEmailOtp(
  email: string,
  options: SendEmailOtpOptions = {}
): Promise<AuthResult> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) {
    return { ok: false, message: "Please enter your email." };
  }
  const shouldCreateUser = options.createIfMissing ?? true;
  try {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { shouldCreateUser },
    });
    if (error) return { ok: false, message: authErrorMessage(error) };
    return { ok: true };
  } catch (err) {
    return { ok: false, message: configCatchMessage(err) };
  }
}

export async function verifyEmailOtp(
  email: string,
  token: string
): Promise<AuthResult> {
  const trimmed = email.trim().toLowerCase();
  const code = token.trim();
  if (!trimmed) {
    return { ok: false, message: "Please enter your email." };
  }
  if (!code) {
    return { ok: false, message: "Please enter the code from your email." };
  }
  try {
    const supabase = createClient();
    const { data, error } = await supabase.auth.verifyOtp({
      email: trimmed,
      token: code,
      type: "email",
    });
    if (error) return { ok: false, message: authErrorMessage(error) };
    return { ok: true, user: data.user ?? undefined };
  } catch (err) {
    return { ok: false, message: configCatchMessage(err) };
  }
}

/**
 * Signup path (AP-D9): verify the 6-digit email OTP (confirms ownership +
 * establishes a session), then attach the password the user already entered.
 */
export async function verifyOtpThenSetPassword(
  email: string,
  token: string,
  password: string
): Promise<AuthResult> {
  if (!password) {
    return { ok: false, message: "Please enter a password." };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      message: `Password is too short (min ${MIN_PASSWORD_LENGTH} characters).`,
    };
  }
  const verified = await verifyEmailOtp(email, token);
  if (!verified.ok) return verified;
  try {
    const supabase = createClient();
    const { data, error } = await supabase.auth.updateUser({ password });
    if (error) return { ok: false, message: authErrorMessage(error) };
    return { ok: true, user: data.user ?? verified.user };
  } catch (err) {
    return { ok: false, message: configCatchMessage(err) };
  }
}

export async function signInWithPassword(
  email: string,
  password: string
): Promise<AuthResult> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) {
    return { ok: false, message: "Please enter your email." };
  }
  if (!password) {
    return { ok: false, message: "Please enter your password." };
  }
  try {
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: trimmed,
      password,
    });
    if (error) return { ok: false, message: authErrorMessage(error) };
    return { ok: true, user: data.user ?? undefined };
  } catch (err) {
    return { ok: false, message: configCatchMessage(err) };
  }
}

export async function signUpWithPassword(
  email: string,
  password: string
): Promise<AuthResult> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) {
    return { ok: false, message: "Please enter your email." };
  }
  if (!password) {
    return { ok: false, message: "Please enter a password." };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      message: `Password is too short (min ${MIN_PASSWORD_LENGTH} characters).`,
    };
  }
  try {
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email: trimmed,
      password,
    });
    if (error) return { ok: false, message: authErrorMessage(error) };
    return { ok: true, user: data.user ?? undefined };
  } catch (err) {
    return { ok: false, message: configCatchMessage(err) };
  }
}

/**
 * Set or change the signed-in user's password (Settings → Account).
 * Callers must re-auth first — current password (AP-D6) or email OTP
 * (AP-D19 forgot / never-set path).
 */
export async function updatePassword(newPassword: string): Promise<AuthResult> {
  if (!newPassword) {
    return { ok: false, message: "Please enter a new password." };
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      message: `Password is too short (min ${MIN_PASSWORD_LENGTH} characters).`,
    };
  }
  try {
    const supabase = createClient();
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    if (error) return { ok: false, message: authErrorMessage(error) };
    return { ok: true, user: data.user ?? undefined };
  } catch (err) {
    return { ok: false, message: configCatchMessage(err) };
  }
}

/**
 * Settings forgot-password / never-set path (AP-D19): send a 6-digit code
 * to the signed-in user's email. Does not create accounts.
 */
export async function sendPasswordResetOtp(email: string): Promise<AuthResult> {
  return sendEmailOtp(email, { createIfMissing: false });
}

/**
 * Prove email ownership via OTP, then attach the new password.
 * Server-validates the code (no reset-link; AP-D4).
 */
export async function resetPasswordWithEmailOtp(
  email: string,
  token: string,
  newPassword: string
): Promise<AuthResult> {
  if (!newPassword) {
    return { ok: false, message: "Please enter a new password." };
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      message: `Password is too short (min ${MIN_PASSWORD_LENGTH} characters).`,
    };
  }
  const verified = await verifyEmailOtp(email, token);
  if (!verified.ok) return verified;
  return updatePassword(newPassword);
}

/**
 * Pure OAuth (e.g. Google-only) → no email identity yet → "set password"
 * flow (session is proof). Anyone with an email identity → "change" flow
 * with current-password re-auth, or OTP reset (AP-D19) if they forgot /
 * never set one.
 */
export function isOAuthOnlyUser(user: User | null | undefined): boolean {
  const identities = user?.identities ?? [];
  if (identities.length === 0) return false;
  return identities.every((i) => i.provider !== "email");
}
