/**
 * Video Replay OTP Service (Plan 08 · Task 44 · Decision 10 LOCKED).
 *
 * Manages the SMS OTP friction layer on patient video-replay access.
 * Decision 10 mandates:
 *
 *   1. Default to audio-only replay even when video compositions exist.
 *   2. A "Show video" toggle surfaces video compositions.
 *   3. First video replay per 30-day rolling window → SMS OTP required.
 *   4. Subsequent replays within the window → OTP skipped (window read
 *      from `video_otp_window`, Migration 070).
 *
 * This service owns only the OTP send/verify lifecycle; the actual
 * video-URL mint lives in `recording-access-service.mintReplayUrl`'s
 * `artifactKind='video'` branch, which calls `isVideoOtpRequired`
 * here as a gate. Same caller → two service touches: OTP (this
 * service) → URL mint (recording-access-service).
 *
 * **Hashed code storage.** We persist only `SHA-256(salt || code)`
 * with a per-row 16-byte salt. A DB snapshot leak cannot enable OTP
 * replay even at the 5-min TTL. Rationale detailed in Migration 074.
 *
 * **Rate limits.**
 *   · Send: max 3 per patient per hour → 429 with `retry_after_seconds`.
 *   · Verify: max 5 wrong attempts per row → reason `'too_many_attempts'`;
 *     the row locks (patient must request a new OTP).
 *
 * **Idempotency / single-use.** A verified row flips `consumed_at`;
 * a second verify against the same `otpId` returns `'wrong_code'` so
 * the on-wire response shape doesn't leak "this id is valid".
 *
 * **Phone source of truth.** Callers pass the patient phone they
 * expect, but this service (via the controller) re-resolves the
 * `patients.phone` server-side and 400s on mismatch. Prevents a
 * compromised session from redirecting OTPs to attacker phones.
 *
 * @see backend/migrations/074_video_replay_otp_attempts_and_dashboard_event_widen.sql
 * @see backend/migrations/070_video_escalation_audit_and_otp_window.sql (video_otp_window)
 * @see backend/src/services/twilio-sms-service.ts (sendSms)
 */

import { createHash, randomBytes, randomInt } from 'crypto';
import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import { InternalError, ValidationError } from '../utils/errors';
import { sendSms } from './twilio-sms-service';

// ============================================================================
// Constants
// ============================================================================

const OTP_CODE_LENGTH = 6;
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_WRONG_ATTEMPTS = 5;
const OTP_WINDOW_DAYS = 30;
const OTP_SEND_RATE_LIMIT_PER_HOUR = 3;
const OTP_SALT_BYTES = 16;

// ============================================================================
// Public types
// ============================================================================

export interface IsVideoOtpRequiredInput {
  patientId: string;
}

export interface IsVideoOtpRequiredResult {
  required: boolean;
  lastVerifiedAt: Date | null;
}

export interface SendVideoReplayOtpInput {
  patientId: string;
  /** E.164-formatted phone. Caller (controller) validates match with on-file phone. */
  phone: string;
  correlationId?: string;
}

export interface SendVideoReplayOtpResult {
  otpId: string;
  expiresAt: Date;
}

export class VideoOtpRateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super(`Video replay OTP rate limit exceeded (retry after ${retryAfterSeconds}s)`);
    this.name = 'VideoOtpRateLimitError';
  }
}

export class VideoOtpSmsUnavailableError extends Error {
  constructor() {
    super('SMS provider did not accept the OTP send (no-op or rejection)');
    this.name = 'VideoOtpSmsUnavailableError';
  }
}

export type VerifyVideoReplayOtpReason =
  | 'expired'
  | 'too_many_attempts'
  | 'wrong_code';

export interface VerifyVideoReplayOtpInput {
  otpId: string;
  code: string;
  patientId: string;
  correlationId?: string;
}

export interface VerifyVideoReplayOtpResult {
  verified: boolean;
  reason?: VerifyVideoReplayOtpReason;
}

// ============================================================================
// Internal helpers
// ============================================================================

function hashOtpCode(code: string, saltHex: string): string {
  return createHash('sha256').update(`${saltHex}${code}`).digest('hex');
}

function generateOtpCode(): string {
  const n = randomInt(0, 10 ** OTP_CODE_LENGTH);
  return n.toString(10).padStart(OTP_CODE_LENGTH, '0');
}

function generateSaltHex(): string {
  return randomBytes(OTP_SALT_BYTES).toString('hex');
}

function requireAdmin(): NonNullable<ReturnType<typeof getSupabaseAdminClient>> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError(
      'video-replay-otp-service: Supabase admin client unavailable',
    );
  }
  return admin;
}

function buildOtpSmsBody(code: string): string {
  return (
    `Your Clariva video replay code is ${code}. Valid for 5 minutes. ` +
    `If you didn't request this, ignore this SMS.`
  );
}

// ============================================================================
// Public: isVideoOtpRequired
// ============================================================================

/**
 * Read `video_otp_window` for the patient and decide whether the
 * 30-day rolling skip window applies.
 *
 *   · No row               → required: true, lastVerifiedAt: null.
 *   · Row older than 30d   → required: true, lastVerifiedAt: <that date>.
 *   · Row within 30d       → required: false, lastVerifiedAt: <that date>.
 *
 * Non-throwing on lookup failure — fail-closed to `required: true`
 * (forces the patient through OTP; annoying but safer than leaking
 * video access on a transient DB hiccup).
 */
export async function isVideoOtpRequired(
  input: IsVideoOtpRequiredInput,
): Promise<IsVideoOtpRequiredResult> {
  const patientId = input.patientId?.trim();
  if (!patientId) {
    throw new ValidationError('patientId is required');
  }

  const admin = requireAdmin();
  const { data, error } = await admin
    .from('video_otp_window')
    .select('last_otp_verified_at')
    .eq('patient_id', patientId)
    .maybeSingle();

  if (error) {
    logger.warn(
      { patientId, error: error.message },
      'video-replay-otp-service: video_otp_window lookup failed; fail-closed (OTP required)',
    );
    return { required: true, lastVerifiedAt: null };
  }

  const row = (data ?? null) as { last_otp_verified_at: string | null } | null;
  if (!row?.last_otp_verified_at) {
    return { required: true, lastVerifiedAt: null };
  }

  const lastVerifiedAt = new Date(row.last_otp_verified_at);
  if (Number.isNaN(lastVerifiedAt.getTime())) {
    return { required: true, lastVerifiedAt: null };
  }

  const windowEndMs = lastVerifiedAt.getTime() + OTP_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const required = Date.now() >= windowEndMs;
  return { required, lastVerifiedAt };
}

// ============================================================================
// Public: sendVideoReplayOtp
// ============================================================================

/**
 * Generate a fresh 6-digit OTP, hash + persist, send via Twilio SMS.
 *
 * Rate-limited to 3 sends per patient per hour. Over the limit throws
 * `VideoOtpRateLimitError` with `retryAfterSeconds` set to the time
 * until the oldest of the last 3 sends ages out of the 1-hour window
 * (so the caller can surface a concrete "try again in Xm" hint).
 *
 * SMS delivery failure throws `VideoOtpSmsUnavailableError` — the row
 * is NOT inserted in that case (no point storing an OTP the patient
 * will never receive). Twilio's `sendSms` returning `false` (no-op
 * because SMS isn't configured, or the provider rejected the request)
 * both map to this error.
 */
export async function sendVideoReplayOtp(
  input: SendVideoReplayOtpInput,
): Promise<SendVideoReplayOtpResult> {
  const patientId = input.patientId?.trim();
  const phone = input.phone?.trim();
  const correlationId = input.correlationId?.trim() || 'unknown';

  if (!patientId) {
    throw new ValidationError('patientId is required');
  }
  if (!phone) {
    throw new ValidationError('phone is required');
  }

  const admin = requireAdmin();

  // Rate-limit pre-check. We use count+order so the same query also
  // gives us the oldest-in-window timestamp for `retryAfterSeconds`.
  const oneHourAgoIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: recent, error: recentErr } = await admin
    .from('video_replay_otp_attempts')
    .select('created_at')
    .eq('patient_id', patientId)
    .gte('created_at', oneHourAgoIso)
    .order('created_at', { ascending: true });

  if (recentErr) {
    // Fail-closed on lookup error — do NOT send an OTP we can't
    // rate-count. Aligns with the security-over-UX principle of
    // Decision 10.
    logger.warn(
      { correlationId, patientId, error: recentErr.message },
      'video-replay-otp-service: recent-send lookup failed; refusing send',
    );
    throw new InternalError(
      'video-replay-otp-service: could not verify rate limit; refusing send',
    );
  }

  const recentRows = (recent ?? []) as { created_at: string }[];
  if (recentRows.length >= OTP_SEND_RATE_LIMIT_PER_HOUR) {
    const oldestIso = recentRows[0]!.created_at;
    const oldestMs = new Date(oldestIso).getTime();
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((oldestMs + 60 * 60 * 1000 - Date.now()) / 1000),
    );
    logger.info(
      { correlationId, patientId, retryAfterSeconds },
      'video-replay-otp-service: send rate limited',
    );
    throw new VideoOtpRateLimitError(retryAfterSeconds);
  }

  const code = generateOtpCode();
  const salt = generateSaltHex();
  const codeHash = hashOtpCode(code, salt);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  // Persist BEFORE sending the SMS so we never ship a code whose
  // verify path would fail (patient enters the code; lookup misses).
  const { data: inserted, error: insertErr } = await admin
    .from('video_replay_otp_attempts')
    .insert({
      patient_id:     patientId,
      code_hash:      codeHash,
      salt,
      expires_at:     expiresAt.toISOString(),
      correlation_id: correlationId === 'unknown' ? null : correlationId,
    })
    .select('id')
    .single();

  if (insertErr || !inserted) {
    logger.error(
      { correlationId, patientId, error: insertErr?.message },
      'video-replay-otp-service: OTP row insert failed',
    );
    throw new InternalError(
      `video-replay-otp-service: OTP row insert failed (${insertErr?.message ?? 'no row'})`,
    );
  }

  const otpId = (inserted as { id: string }).id;

  const sent = await sendSms(phone, buildOtpSmsBody(code), correlationId);
  if (!sent) {
    // Best-effort: mark the row consumed so it can't be used (the
    // patient will never know the code; but leaving it active would
    // let an attacker who guesses the id brute-force the code).
    await admin
      .from('video_replay_otp_attempts')
      .update({ consumed_at: new Date().toISOString() })
      .eq('id', otpId);
    logger.warn(
      { correlationId, patientId, otpId },
      'video-replay-otp-service: SMS send returned false; marked OTP row consumed',
    );
    throw new VideoOtpSmsUnavailableError();
  }

  logger.info(
    { correlationId, patientId, otpId, expiresAt: expiresAt.toISOString() },
    'video-replay-otp-service: OTP sent',
  );

  return { otpId, expiresAt };
}

// ============================================================================
// Public: verifyVideoReplayOtp
// ============================================================================

/**
 * Verify a 6-digit code against a previously-sent OTP row.
 *
 * Flow:
 *   1. Lookup row by (id, patient_id). Row-missing OR patient-mismatch
 *      → `wrong_code` (don't leak "this id is for a different patient").
 *   2. If `consumed_at IS NOT NULL` → `wrong_code` (single-use).
 *   3. If `expires_at < now()` → `expired` (no attempt increment).
 *   4. If `attempt_count >= 5` → `too_many_attempts`.
 *   5. Hash submitted code + compare. On mismatch: increment
 *      attempt_count; return `wrong_code` or `too_many_attempts` if
 *      the increment pushed the counter to 5.
 *   6. On match: UPSERT `video_otp_window` + set `consumed_at`.
 */
export async function verifyVideoReplayOtp(
  input: VerifyVideoReplayOtpInput,
): Promise<VerifyVideoReplayOtpResult> {
  const otpId = input.otpId?.trim();
  const code = (input.code ?? '').trim();
  const patientId = input.patientId?.trim();
  const correlationId = input.correlationId?.trim() || 'unknown';

  if (!otpId) throw new ValidationError('otpId is required');
  if (!patientId) throw new ValidationError('patientId is required');

  if (code.length !== OTP_CODE_LENGTH || !/^\d{6}$/.test(code)) {
    // Don't spend a row-attempt on obvious malformed input; return
    // wrong_code without a lookup to avoid leaking row existence via
    // response timing. This matches the "wrong shape == wrong code"
    // convention used by other OTP services in the ecosystem.
    return { verified: false, reason: 'wrong_code' };
  }

  const admin = requireAdmin();

  const { data, error } = await admin
    .from('video_replay_otp_attempts')
    .select('id, patient_id, code_hash, salt, expires_at, attempt_count, consumed_at')
    .eq('id', otpId)
    .maybeSingle();

  if (error) {
    logger.warn(
      { correlationId, otpId, error: error.message },
      'video-replay-otp-service: OTP lookup failed',
    );
    throw new InternalError(
      `video-replay-otp-service: OTP lookup failed (${error.message})`,
    );
  }

  const row = (data ?? null) as {
    id: string;
    patient_id: string;
    code_hash: string;
    salt: string;
    expires_at: string;
    attempt_count: number;
    consumed_at: string | null;
  } | null;

  if (!row || row.patient_id !== patientId) {
    return { verified: false, reason: 'wrong_code' };
  }
  if (row.consumed_at) {
    return { verified: false, reason: 'wrong_code' };
  }

  const expiresMs = new Date(row.expires_at).getTime();
  if (!Number.isFinite(expiresMs) || Date.now() >= expiresMs) {
    return { verified: false, reason: 'expired' };
  }
  if (row.attempt_count >= OTP_MAX_WRONG_ATTEMPTS) {
    return { verified: false, reason: 'too_many_attempts' };
  }

  const submittedHash = hashOtpCode(code, row.salt);
  if (submittedHash !== row.code_hash) {
    const nextCount = row.attempt_count + 1;
    const { error: updateErr } = await admin
      .from('video_replay_otp_attempts')
      .update({ attempt_count: nextCount })
      .eq('id', otpId)
      .eq('attempt_count', row.attempt_count);
    if (updateErr) {
      logger.warn(
        { correlationId, otpId, error: updateErr.message },
        'video-replay-otp-service: attempt_count increment failed (non-fatal)',
      );
    }
    logger.info(
      { correlationId, otpId, attempt_count: nextCount },
      'video-replay-otp-service: wrong code',
    );
    if (nextCount >= OTP_MAX_WRONG_ATTEMPTS) {
      return { verified: false, reason: 'too_many_attempts' };
    }
    return { verified: false, reason: 'wrong_code' };
  }

  // Match — mark consumed + UPSERT the 30-day window.
  const nowIso = new Date().toISOString();
  const { error: consumeErr } = await admin
    .from('video_replay_otp_attempts')
    .update({ consumed_at: nowIso })
    .eq('id', otpId)
    .is('consumed_at', null);
  if (consumeErr) {
    logger.warn(
      { correlationId, otpId, error: consumeErr.message },
      'video-replay-otp-service: consume update failed (non-fatal)',
    );
  }

  const { error: upsertErr } = await admin
    .from('video_otp_window')
    .upsert(
      {
        patient_id:             patientId,
        last_otp_verified_at:   nowIso,
        last_otp_verified_via:  'sms',
        correlation_id:         correlationId === 'unknown' ? null : correlationId,
      },
      { onConflict: 'patient_id' },
    );
  if (upsertErr) {
    logger.error(
      { correlationId, otpId, patientId, error: upsertErr.message },
      'video-replay-otp-service: video_otp_window UPSERT failed',
    );
    // UPSERT failure is fatal: a "verified" without a window update
    // means the next replay still prompts OTP. Better to surface the
    // failure to the caller than lie.
    throw new InternalError(
      `video-replay-otp-service: video_otp_window UPSERT failed (${upsertErr.message})`,
    );
  }

  logger.info(
    { correlationId, otpId, patientId },
    'video-replay-otp-service: OTP verified; 30-day window refreshed',
  );

  return { verified: true };
}
