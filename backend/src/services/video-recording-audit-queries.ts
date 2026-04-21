/**
 * Video-Recording Audit — shared query helpers (Plan 08 · Task 45)
 *
 * Thin wrappers around the Supabase admin client that pin the exact
 * query shapes Tasks 41 + 44 will use. Co-located here (with the types
 * in `types/video-recording-audit.ts`) so those downstream tasks can
 * import a tested primitive rather than re-hand-rolling the chain.
 *
 * None of these helpers carry business logic (rate-limit arithmetic,
 * cooldown windows, escalation rules) — that belongs in Tasks 41 + 44.
 * These are contract-pinning schema adapters only.
 *
 * @see backend/migrations/070_video_escalation_audit_and_otp_window.sql
 * @see backend/src/types/video-recording-audit.ts
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-45-video-recording-audit-extensions-migration.md
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  VideoEscalationAuditRow,
  VideoOtpWindowRow,
  InsertVideoEscalationAuditRow,
  UpdateVideoEscalationAuditResponse,
  UpsertVideoOtpWindowRow,
} from '../types/video-recording-audit';

// ============================================================================
// Snake-case row shapes as Supabase returns them. Kept internal to this
// module; callers consume the camelCase mirror from `types/video-recording-audit`.
// ============================================================================

interface VideoEscalationAuditRowDb {
  id: string;
  session_id: string;
  doctor_id: string;
  requested_at: string;
  reason: string;
  preset_reason_code: VideoEscalationAuditRow['presetReasonCode'];
  patient_response: VideoEscalationAuditRow['patientResponse'];
  responded_at: string | null;
  correlation_id: string | null;
}

interface VideoOtpWindowRowDb {
  patient_id: string;
  last_otp_verified_at: string;
  last_otp_verified_via: VideoOtpWindowRow['lastOtpVerifiedVia'];
  correlation_id: string | null;
}

// ============================================================================
// Mappers — keep the camelCase / snake_case split exclusively at the
// adapter boundary.
// ============================================================================

function escalationRowFromDb(row: VideoEscalationAuditRowDb): VideoEscalationAuditRow {
  return {
    id:                row.id,
    sessionId:         row.session_id,
    doctorId:          row.doctor_id,
    requestedAt:       row.requested_at,
    reason:            row.reason,
    presetReasonCode:  row.preset_reason_code,
    patientResponse:   row.patient_response,
    respondedAt:       row.responded_at,
    correlationId:     row.correlation_id,
  };
}

function otpWindowRowFromDb(row: VideoOtpWindowRowDb): VideoOtpWindowRow {
  return {
    patientId:          row.patient_id,
    lastOtpVerifiedAt:  row.last_otp_verified_at,
    lastOtpVerifiedVia: row.last_otp_verified_via,
    correlationId:      row.correlation_id,
  };
}

// ============================================================================
// video_escalation_audit helpers (Task 41 consumers)
// ============================================================================

/**
 * Fetch the N most recent escalation rows for a session, newest first.
 *
 * Task 41's rate-limit check reads this with `limit = 2` and then
 * inspects `requested_at` against the 5-min cooldown + the 2-per-consult
 * cap. The ordering is covered by the
 * `idx_video_escalation_audit_session_time` index (Migration 070).
 *
 * Returns `[]` if the session has no escalations yet.
 */
export async function fetchRecentEscalationsForSession(
  admin: SupabaseClient,
  sessionId: string,
  limit: number,
): Promise<VideoEscalationAuditRow[]> {
  const { data, error } = await admin
    .from('video_escalation_audit')
    .select('*')
    .eq('session_id', sessionId)
    .order('requested_at', { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(
      `fetchRecentEscalationsForSession: ${error.message ?? 'unknown supabase error'}`,
    );
  }
  return (data ?? []).map((row) => escalationRowFromDb(row as VideoEscalationAuditRowDb));
}

/**
 * Insert a new escalation row in the PENDING state (patient_response /
 * responded_at left null). Returns the inserted row so the caller can
 * thread `id` into subsequent audit updates and correlation tags.
 */
export async function insertVideoEscalationRequest(
  admin: SupabaseClient,
  row: InsertVideoEscalationAuditRow,
): Promise<VideoEscalationAuditRow> {
  const payload = {
    session_id:         row.sessionId,
    doctor_id:          row.doctorId,
    reason:             row.reason,
    preset_reason_code: row.presetReasonCode ?? null,
    correlation_id:     row.correlationId ?? null,
  };
  const { data, error } = await admin
    .from('video_escalation_audit')
    .insert(payload)
    .select('*')
    .single();
  if (error || !data) {
    throw new Error(
      `insertVideoEscalationRequest: ${error?.message ?? 'no row returned'}`,
    );
  }
  return escalationRowFromDb(data as VideoEscalationAuditRowDb);
}

/**
 * Resolve a pending escalation row with the patient's response + the
 * server-assigned response timestamp. The `(patient_response,
 * responded_at)` row-shape CHECK (Migration 070) enforces co-presence
 * at the DB layer; this helper sets both atomically.
 *
 * Returns the resolved row on success; `null` if no matching id (the
 * caller treats this as a lost-race / stale-event no-op).
 */
export async function resolveVideoEscalationResponse(
  admin: SupabaseClient,
  escalationId: string,
  update: UpdateVideoEscalationAuditResponse,
): Promise<VideoEscalationAuditRow | null> {
  const { data, error } = await admin
    .from('video_escalation_audit')
    .update({
      patient_response: update.patientResponse,
      responded_at:     update.respondedAt,
    })
    .eq('id', escalationId)
    .is('patient_response', null)
    .select('*')
    .maybeSingle();
  if (error) {
    throw new Error(
      `resolveVideoEscalationResponse: ${error.message ?? 'unknown supabase error'}`,
    );
  }
  if (!data) return null;
  return escalationRowFromDb(data as VideoEscalationAuditRowDb);
}

// ============================================================================
// video_otp_window helpers (Task 44 consumers)
// ============================================================================

/**
 * Fetch a patient's OTP-window row within the 30-day horizon.
 *
 * Task 44's skip-OTP check calls this with `windowStart = new Date(now
 * - 30 days).toISOString()`; a returned non-null row means the patient
 * proved presence recently and we skip re-prompting.
 *
 * We filter with `gt` on `last_otp_verified_at` at the query layer
 * (rather than reading the row and comparing in JS) so a future stale
 * row (> 30 days old) correctly returns null without a separate
 * eviction job.
 */
export async function fetchVideoOtpWindow(
  admin: SupabaseClient,
  patientId: string,
  windowStart: string,
): Promise<VideoOtpWindowRow | null> {
  const { data, error } = await admin
    .from('video_otp_window')
    .select('*')
    .eq('patient_id', patientId)
    .gt('last_otp_verified_at', windowStart)
    .maybeSingle();
  if (error) {
    throw new Error(
      `fetchVideoOtpWindow: ${error.message ?? 'unknown supabase error'}`,
    );
  }
  if (!data) return null;
  return otpWindowRowFromDb(data as VideoOtpWindowRowDb);
}

/**
 * UPSERT a patient's OTP-window row on successful verify. `patient_id`
 * is the natural conflict key (PK on the table). Overwrites any stale
 * row — we only keep the most-recent verification.
 */
export async function upsertVideoOtpWindow(
  admin: SupabaseClient,
  row: UpsertVideoOtpWindowRow,
): Promise<VideoOtpWindowRow> {
  const payload = {
    patient_id:             row.patientId,
    last_otp_verified_at:   row.lastOtpVerifiedAt,
    last_otp_verified_via:  row.lastOtpVerifiedVia,
    correlation_id:         row.correlationId ?? null,
  };
  const { data, error } = await admin
    .from('video_otp_window')
    .upsert(payload, { onConflict: 'patient_id' })
    .select('*')
    .single();
  if (error || !data) {
    throw new Error(
      `upsertVideoOtpWindow: ${error?.message ?? 'no row returned'}`,
    );
  }
  return otpWindowRowFromDb(data as VideoOtpWindowRowDb);
}
