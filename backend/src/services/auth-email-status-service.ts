/**
 * Auth email-status (auth-password · AP-D17 + signup-orphan harden).
 *
 * Public signup/signin preflight: does this email already have an auth.users
 * row, and is that row confirmed?
 *
 * Why `confirmed` matters:
 *   Signup OTP with `shouldCreateUser: true` creates the auth.users row BEFORE
 *   the email is sent. If SMTP / Supabase's built-in email cap fails, the row
 *   is left as an unconfirmed stub. Treating that stub as a full account
 *   dead-ends the doctor on "An account already exists". Callers should only
 *   refuse signup when `exists && confirmed`.
 *
 * Service-role only. Never logs the email (PII).
 *
 * Note: supabase-js GoTrueAdminApi in our pin has no `getUserByEmail`.
 * We call GoTrue's admin users endpoint with `email=` (when supported),
 * and fall back to a bounded `listUsers` scan if the filter is ignored.
 */

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from '../config/database';
import { env } from '../config/env';
import { InternalError } from '../utils/errors';

export type EmailStatus = {
  exists: boolean;
  /** True when email_confirmed_at / confirmed_at is set (usable account). */
  confirmed: boolean;
};

type AuthUserLite = {
  email?: string | null;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
};

function requireAdmin(): SupabaseClient {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }
  return admin;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isConfirmed(user: AuthUserLite): boolean {
  return Boolean(user.email_confirmed_at || user.confirmed_at);
}

function statusFromUser(user: AuthUserLite | null): EmailStatus {
  if (!user) {
    return { exists: false, confirmed: false };
  }
  return { exists: true, confirmed: isConfirmed(user) };
}

/**
 * Bounded scan via listUsers (fallback when GoTrue email filter is unavailable).
 */
async function scanUsersForEmail(
  admin: SupabaseClient,
  email: string
): Promise<AuthUserLite | null> {
  const perPage = 200;
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new InternalError('Could not look up email status');
    }
    const users = (data.users ?? []) as User[];
    const match = users.find((u) => (u.email ?? '').toLowerCase() === email);
    if (match) {
      return match;
    }
    if (users.length < perPage) {
      return null;
    }
  }
  return null;
}

/**
 * Prefer GoTrue `?email=` filter; verify the match so a no-op filter cannot
 * falsely report "missing". Returns null when the filter appears ignored.
 */
async function lookupByEmailFilter(email: string): Promise<AuthUserLite | null | undefined> {
  const base = env.SUPABASE_URL.replace(/\/$/, '');
  const url = `${base}/auth/v1/admin/users?page=1&per_page=2&email=${encodeURIComponent(email)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    },
  });
  if (!res.ok) {
    return undefined;
  }
  const json = (await res.json()) as { users?: AuthUserLite[] };
  const users = json.users ?? [];
  if (users.length === 0) {
    return null;
  }
  const match = users.find((u) => (u.email ?? '').toLowerCase() === email);
  if (match) {
    return match;
  }
  // Filter ignored (returned unrelated users) — caller should scan.
  return undefined;
}

/**
 * Returns whether an auth user already exists for this email, and whether
 * that account is confirmed (usable for sign-in / should block re-signup).
 * @param _correlationId unused — reserved for structured logs (no PII).
 */
export async function getEmailStatus(
  email: string,
  _correlationId: string
): Promise<EmailStatus> {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return { exists: false, confirmed: false };
  }

  const admin = requireAdmin();

  try {
    const filtered = await lookupByEmailFilter(normalized);
    if (filtered !== undefined) {
      return statusFromUser(filtered);
    }
  } catch {
    // Fall through to listUsers scan.
  }

  const match = await scanUsersForEmail(admin, normalized);
  return statusFromUser(match);
}
