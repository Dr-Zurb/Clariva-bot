/**
 * Ghost-account sweep (auth-v2 · Model C).
 *
 * Auth-v2 is a single passwordless door: Google OAuth and Email OTP both
 * create the `auth.users` row on first authentication — there is no separate
 * "sign up" step. That is deliberate (auth = "prove you own this identity";
 * the real trust gate is **doctor verification**, downstream). The side effect
 * is abandoned attempts — a typo'd email, an idle-curious Google click, a
 * half-finished `/complete-profile` — leave harmless but untidy rows behind.
 *
 * This sweep prunes those ghosts. An account is a ghost ONLY when ALL hold:
 *   1. Not an admin (never touch `app_metadata.role === 'admin'`).
 *   2. `user_metadata.profile_completed` is falsy (never finished onboarding).
 *   3. `created_at` older than `GHOST_ACCOUNT_SWEEP_MIN_AGE_DAYS` (grace window
 *      so a doctor mid-onboarding is never swept).
 *   4. No "serious" `doctor_verification` row (submitted / reviewed) — an
 *      `unverified` default row does NOT count as engagement.
 *   5. No `appointments` (belt-and-braces; an incomplete profile cannot take
 *      bookings, but the check is cheap and the delete is irreversible).
 *
 * Deletion is `auth.admin.deleteUser` (service-role). `auth.users` FK CASCADE
 * (migrations 001 / 009 / 011 / 183 …) removes dependent rows automatically.
 *
 * SAFETY:
 *   · Ships DARK. `GHOST_ACCOUNT_SWEEP_ENABLED=false` (default) → dry-run:
 *     candidates are identified + logged, nothing is deleted. Flip to `true`
 *     only after observing dry-run output (mirrors ARCHIVAL_HARD_DELETE_ENABLED).
 *   · Candidates are collected across full pagination FIRST, then deleted, so
 *     mid-sweep deletes never shift the listUsers pages (skipping users).
 *   · `DELETE_CAP_PER_TICK` bounds irreversible deletes per run.
 *   · Never logs PII/PHI — only `userId` (uuid) + `createdAt`.
 *
 * Mounted at `POST /cron/ghost-account-sweep`. Schedule daily (off-peak).
 *
 * @see backend/migrations/183_doctor_verification.sql (doctor IS the auth.users row)
 * @see backend/src/config/env.ts (GHOST_ACCOUNT_SWEEP_* flags)
 */

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from '../config/database';
import { env } from '../config/env';
import { logger } from '../config/logger';

/** Page size for `auth.admin.listUsers`. */
const PER_PAGE = 200;

/** Hard ceiling on pages scanned per tick (PER_PAGE × MAX_PAGES users). */
const MAX_PAGES = 50;

/** Bound irreversible deletes per run — a backstop against a bad predicate. */
const DELETE_CAP_PER_TICK = 100;

/**
 * Verification statuses that prove the account is a real, engaged doctor and
 * must be kept. A bare `unverified` row (or no row) is NOT engagement.
 */
const SERIOUS_VERIFICATION_STATUSES = new Set<string>([
  'pending_review',
  'verified',
  'rejected',
]);

export interface GhostAccountSweepResult {
  /** True when the hard-delete kill switch is OFF (candidates logged only). */
  dryRun: boolean;
  /** Grace window (days) used this tick. */
  minAgeDays: number;
  /** Total accounts examined. */
  scanned: number;
  /** Ghosts identified (incomplete + past grace + no verification + no data). */
  candidates: number;
  /** Accounts actually deleted (0 in dry-run). */
  deleted: number;
  /** Non-fatal errors (per-account check/delete failures + list-page errors). */
  errors: number;
}

function emptyResult(dryRun: boolean, minAgeDays: number): GhostAccountSweepResult {
  return { dryRun, minAgeDays, scanned: 0, candidates: 0, deleted: 0, errors: 0 };
}

function isAdmin(user: User): boolean {
  const appRole = (user.app_metadata as Record<string, unknown> | undefined)?.role;
  const metaRole = (user.user_metadata as Record<string, unknown> | undefined)?.role;
  return appRole === 'admin' || metaRole === 'admin';
}

function isProfileCompleted(user: User): boolean {
  return Boolean(
    (user.user_metadata as Record<string, unknown> | undefined)?.profile_completed,
  );
}

/** True when the account has a submitted/reviewed verification row. */
async function hasSeriousVerification(
  admin: SupabaseClient,
  doctorId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from('doctor_verification')
    .select('status')
    .eq('doctor_id', doctorId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return false;
  return SERIOUS_VERIFICATION_STATUSES.has((data as { status: string }).status);
}

/** True when the account owns any appointment row (as doctor). */
async function hasAppointments(
  admin: SupabaseClient,
  doctorId: string,
): Promise<boolean> {
  const { count, error } = await admin
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('doctor_id', doctorId);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

/**
 * One tick of the ghost-account sweep. Idempotent and safe to re-run: a row
 * already deleted simply won't reappear in `listUsers`.
 */
export async function runGhostAccountSweepJob(
  correlationId: string,
): Promise<GhostAccountSweepResult> {
  const minAgeDays = env.GHOST_ACCOUNT_SWEEP_MIN_AGE_DAYS;
  const dryRun = !env.GHOST_ACCOUNT_SWEEP_ENABLED;
  const result = emptyResult(dryRun, minAgeDays);

  const admin = getSupabaseAdminClient();
  if (!admin) {
    logger.error(
      { correlationId },
      'ghost-account-sweep: no admin client — tick skipped',
    );
    return result;
  }

  const cutoffMs = Date.now() - minAgeDays * 24 * 60 * 60 * 1000;

  // Phase 1 — collect candidate ids across full pagination (read-only, so the
  // page window is stable). Deleting here would shift subsequent pages.
  const candidateIds: string[] = [];

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: PER_PAGE,
    });

    if (error) {
      logger.warn(
        { correlationId, page, error: error.message },
        'ghost-account-sweep: listUsers page failed',
      );
      result.errors += 1;
      break;
    }

    const users = data?.users ?? [];
    if (users.length === 0) break;

    for (const user of users) {
      result.scanned += 1;

      if (isAdmin(user)) continue;
      if (isProfileCompleted(user)) continue;

      const createdMs = user.created_at ? Date.parse(user.created_at) : NaN;
      if (!Number.isFinite(createdMs) || createdMs >= cutoffMs) continue;

      // Reads only — safe to interleave with pagination.
      let engaged: boolean;
      try {
        engaged =
          (await hasSeriousVerification(admin, user.id)) ||
          (await hasAppointments(admin, user.id));
      } catch (err) {
        // A check failure is a "keep" — never delete on incomplete evidence.
        result.errors += 1;
        logger.warn(
          {
            correlationId,
            userId: user.id,
            error: err instanceof Error ? err.message : String(err),
          },
          'ghost-account-sweep: engagement check failed — keeping account',
        );
        continue;
      }

      if (engaged) continue;

      candidateIds.push(user.id);
    }

    if (users.length < PER_PAGE) break;
  }

  result.candidates = candidateIds.length;

  // Phase 2 — act on the bounded batch.
  const toProcess = candidateIds.slice(0, DELETE_CAP_PER_TICK);

  if (dryRun) {
    for (const userId of toProcess) {
      logger.info(
        { correlationId, userId },
        'ghost-account-sweep: dry-run candidate (not deleted)',
      );
    }
    logger.info(
      { correlationId, ...result, cutoffIso: new Date(cutoffMs).toISOString() },
      'ghost-account-sweep: tick complete (dry-run)',
    );
    return result;
  }

  for (const userId of toProcess) {
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) {
      result.errors += 1;
      logger.warn(
        { correlationId, userId, error: delErr.message },
        'ghost-account-sweep: deleteUser failed',
      );
      continue;
    }
    result.deleted += 1;
    logger.info(
      { correlationId, userId },
      'ghost-account-sweep: deleted ghost account',
    );
  }

  logger.info(
    { correlationId, ...result, cutoffIso: new Date(cutoffMs).toISOString() },
    'ghost-account-sweep: tick complete',
  );
  return result;
}

/** @internal — tests only. */
export const __testInternals = {
  PER_PAGE,
  MAX_PAGES,
  DELETE_CAP_PER_TICK,
  SERIOUS_VERIFICATION_STATUSES,
};
