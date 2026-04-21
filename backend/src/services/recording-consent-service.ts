/**
 * Recording Consent Service (Plan 02 · Task 27 · Decision 4 LOCKED)
 *
 * Three-function facade around the `appointments.recording_consent_*`
 * columns shipped in migration 053:
 *
 *   - `captureBookingConsent`    — write path (IG-bot, /book page, or the
 *                                  standalone `POST /:id/recording-consent`
 *                                  route). Idempotent; later writes overwrite
 *                                  earlier ones with a fresh timestamp so
 *                                  the patient can legitimately "change
 *                                  their mind" via the route. Version stamp
 *                                  comes from the caller (frozen at the
 *                                  moment the patient saw the copy).
 *   - `rePitchOnDecline`         — pure helper that returns the soft re-pitch
 *                                  copy + a `shouldShow` flag. Re-pitch cap
 *                                  is enforced by the caller (IG handler
 *                                  tracks its own "already pitched" flag in
 *                                  conversation metadata; booking page
 *                                  tracks it in React state) — the service
 *                                  only owns the string.
 *   - `getConsentForSession`     — read path for the doctor-side banner +
 *                                  Plans 04 / 05 / video-adapter recording
 *                                  gate. Joins `consultation_sessions ⟶
 *                                  appointments` on `appointment_id` so the
 *                                  consultation surface stays session-keyed
 *                                  while the source of truth lives on the
 *                                  appointment row (Task 35 will drop the
 *                                  legacy `consultation_room_*` columns;
 *                                  this join contract is stable through
 *                                  that change).
 *
 * ## Read-side semantics for NULL decisions
 *
 * `decision === null` means the patient was never asked (pre-Task-27
 * bookings, or the IG bot dropped before reaching the `recording_consent`
 * step). Plans 04 / 05 / video recording gate treat NULL **conservatively**
 * on a per-modality basis:
 *   - video / voice: NULL → fall back to Decision 4's `recording-on-by-default`
 *     posture. Recording starts; the doctor-side banner shows nothing (it
 *     only renders when `decision === false`).
 *   - text (Plan 04): NULL → identical posture; the consultation-messages
 *     table is captured unconditionally for medical-record purposes
 *     regardless of this flag.
 * The flag is NOT a general recording on/off switch — it only says "the
 * patient explicitly opted out and the doctor should know". Everything
 * else is policy.
 *
 * No PHI logged. Correlation id flows through for audit joins.
 *
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-27-recording-consent-capture-and-re-pitch.md
 * @see backend/migrations/053_appointments_recording_consent.sql
 */

import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import { InternalError, NotFoundError } from '../utils/errors';
import {
  RECORDING_CONSENT_BODY_V1,
  RECORDING_CONSENT_VERSION,
} from '../constants/recording-consent';

// ----------------------------------------------------------------------------
// Write path: captureBookingConsent
// ----------------------------------------------------------------------------

export interface CaptureBookingConsentInput {
  appointmentId: string;
  decision: boolean;
  /**
   * Frozen at the moment the patient saw the copy. Callers must pass
   * `RECORDING_CONSENT_VERSION` (imported from
   * `backend/src/constants/recording-consent.ts`) unless they are
   * deliberately re-capturing an old version (migration / backfill
   * scenario — not expected in v1).
   */
  consentVersion: string;
  correlationId: string;
}

/**
 * Persist the patient's recording-consent answer onto the appointment row.
 *
 * Writes all three columns in a single UPDATE:
 *   - `recording_consent_decision` = `input.decision`
 *   - `recording_consent_at`       = `now()` (server-side, not caller-side,
 *                                    so the audit timestamp is the DB clock)
 *   - `recording_consent_version`  = `input.consentVersion`
 *
 * Idempotency: there is no unique guard — later writes win. That's the
 * designed behavior for the "patient changed their mind" path via the
 * `POST /:id/recording-consent` route. The `recording_consent_version`
 * snapshot protects us from losing the historical wording in the audit
 * log — we keep the latest wording token on the row, and if a dispute
 * later needs the earlier answer, the HTTP access log + correlation id
 * is the path.
 *
 * Throws:
 *   - `NotFoundError`  when the appointment does not exist (update matched 0 rows).
 *   - `InternalError`  when the admin Supabase client is unavailable or
 *                      the UPDATE errors at the DB layer.
 */
export async function captureBookingConsent(
  input: CaptureBookingConsentInput,
): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const nowIso = new Date().toISOString();

  const { data, error } = await admin
    .from('appointments')
    .update({
      recording_consent_decision: input.decision,
      recording_consent_at: nowIso,
      recording_consent_version: input.consentVersion,
    })
    .eq('id', input.appointmentId)
    .select('id')
    .maybeSingle();

  if (error) {
    logger.error(
      {
        correlationId: input.correlationId,
        appointmentId: input.appointmentId,
        error: error.message,
      },
      'recording_consent_capture_failed',
    );
    throw new InternalError('Failed to persist recording consent');
  }

  if (!data) {
    throw new NotFoundError('Appointment not found');
  }

  logger.info(
    {
      correlationId: input.correlationId,
      appointmentId: input.appointmentId,
      decision: input.decision,
      consentVersion: input.consentVersion,
    },
    'recording_consent_captured',
  );
}

// ----------------------------------------------------------------------------
// Re-pitch helper: rePitchOnDecline
// ----------------------------------------------------------------------------

export interface RePitchOnDeclineInput {
  appointmentId: string;
  correlationId: string;
}

export interface RePitchOnDeclineResult {
  /**
   * Whether the UI / bot should render the re-pitch. Today this is always
   * `true` — the soft-re-pitch limit is 1, enforced by the caller (IG
   * handler / React state). If later we decide to suppress the re-pitch
   * for declines on reschedule, or gate by doctor setting, that branch
   * goes here; callers keep the same interface.
   */
  shouldShow: boolean;
  /**
   * Plaintext copy to show after the first "no". No markdown — callers
   * (booking page modal, dm-copy builder) own their own formatting.
   */
  copy: string;
}

/**
 * Return the soft re-pitch copy to show after the patient's first decline.
 *
 * Pure-ish: reads nothing from the DB in v1, but takes `appointmentId` +
 * `correlationId` so future gating by doctor setting / doctor specialty
 * is a local change. Callers already have the id in hand.
 *
 * Cap enforcement lives in callers:
 *   - IG handler tracks `conversationState.recordingConsentRePitched` and
 *     only invokes this function once per decline cycle.
 *   - `/book` page tracks a local React boolean and only opens the modal
 *     on the first uncheck.
 * The service intentionally doesn't know what attempt this is — if we
 * re-shaped this to "how many times has the patient been asked", we'd
 * need a counter column, and we already decided Decision 4 that a single
 * soft re-pitch is the entire policy.
 */
export async function rePitchOnDecline(
  input: RePitchOnDeclineInput,
): Promise<RePitchOnDeclineResult> {
  logger.debug(
    {
      correlationId: input.correlationId,
      appointmentId: input.appointmentId,
    },
    'recording_consent_re_pitch_requested',
  );

  return {
    shouldShow: true,
    copy: RECORDING_CONSENT_BODY_V1,
  };
}

// ----------------------------------------------------------------------------
// Read path: getConsentForSession
// ----------------------------------------------------------------------------

export interface GetConsentForSessionInput {
  /** `consultation_sessions.id` — the session-keyed read entry point. */
  sessionId: string;
}

export interface ConsentForSession {
  /** `null` → patient never answered; `true`/`false` → captured answer. */
  decision: boolean | null;
  capturedAt: Date | null;
  version: string | null;
}

/**
 * Look up the recording-consent answer for a given session.
 *
 * Two-step query: first resolve the session → appointment id, then read
 * the consent columns off the appointment row. We intentionally do NOT
 * collapse these into a single join because the Supabase JS client's
 * join syntax for nested `select` requires a FK declaration on the
 * actual DB schema, and the `consultation_sessions.appointment_id →
 * appointments.id` FK is already declared (migration 049), so a one-shot
 * `.select('appointment:appointments(...)')` would work — but the
 * two-step version is more legible for readers new to the join and lets
 * us reshape the return type without fighting Supabase's typed-client
 * inference. Two round-trips is acceptable at doctor-side
 * SessionStartBanner fetch frequency (once per session).
 *
 * Throws:
 *   - `NotFoundError`  when the session does not exist.
 *   - `InternalError`  when the admin Supabase client is unavailable or
 *                      DB errors.
 */
export async function getConsentForSession(
  input: GetConsentForSessionInput,
): Promise<ConsentForSession> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { data: sessionRow, error: sessionErr } = await admin
    .from('consultation_sessions')
    .select('appointment_id')
    .eq('id', input.sessionId)
    .maybeSingle();

  if (sessionErr) {
    logger.error(
      { sessionId: input.sessionId, error: sessionErr.message },
      'recording_consent_session_lookup_failed',
    );
    throw new InternalError('Failed to read consultation session');
  }

  if (!sessionRow) {
    throw new NotFoundError('Consultation session not found');
  }

  const { data: apptRow, error: apptErr } = await admin
    .from('appointments')
    .select('recording_consent_decision, recording_consent_at, recording_consent_version')
    .eq('id', sessionRow.appointment_id)
    .maybeSingle();

  if (apptErr) {
    logger.error(
      {
        sessionId: input.sessionId,
        appointmentId: sessionRow.appointment_id,
        error: apptErr.message,
      },
      'recording_consent_appointment_lookup_failed',
    );
    throw new InternalError('Failed to read appointment consent');
  }

  if (!apptRow) {
    // Session row points at a non-existent appointment — schema invariant
    // breach (FK + ON DELETE CASCADE should prevent this). Surface as 404
    // rather than masking as "no decision".
    throw new NotFoundError('Appointment for session not found');
  }

  const capturedAtRaw = apptRow.recording_consent_at as string | null;
  return {
    decision: (apptRow.recording_consent_decision as boolean | null) ?? null,
    capturedAt: capturedAtRaw ? new Date(capturedAtRaw) : null,
    version: (apptRow.recording_consent_version as string | null) ?? null,
  };
}

// ----------------------------------------------------------------------------
// Re-exports so the IG handler + route don't have to know the constants path.
// ----------------------------------------------------------------------------

export { RECORDING_CONSENT_VERSION, RECORDING_CONSENT_BODY_V1 };
