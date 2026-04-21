/**
 * Video-Recording Audit Types (Plan 08 · Task 45)
 *
 * Shapes the three data-model extensions that light up Plan 08:
 *   - `recording_access_type` ENUM ('audio_only' | 'full_video') on
 *     `recording_access_audit.access_type`.
 *   - `video_escalation_audit` row + narrow unions for preset_reason_code
 *     and patient_response (the two CHECK-enforced TEXT columns).
 *   - `video_otp_window` row + narrow union for last_otp_verified_via.
 *
 * Co-located here (rather than `types/database.ts`) to match the
 * consultation-era convention (see `consultation-transcript.ts`,
 * `consultation-session.ts`) — `database.ts` stays the home for the
 * pre-consultation core domain (Appointment, Patient, Conversation, …).
 *
 * Field names are camelCase at the service boundary; the persisted rows
 * use snake_case column names in Postgres. Service layers that read
 * directly from the admin Supabase client should declare their own
 * snake_case-typed locals and map to these camelCase shapes at the
 * boundary.
 *
 * @see backend/migrations/069_recording_access_audit_access_type.sql
 * @see backend/migrations/070_video_escalation_audit_and_otp_window.sql
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-45-video-recording-audit-extensions-migration.md
 */

// ============================================================================
// Enums — mirror the CHECK / ENUM shapes in migrations 069 + 070.
// ============================================================================

/**
 * Audio-only vs full-video discriminator on every `recording_access_audit`
 * row (Decision 10 LOCKED). Back-fill value for Plan 07 rows = `'audio_only'`;
 * Plan 08 Task 44 is the sole `'full_video'` writer.
 *
 * Postgres ENUM `recording_access_type` — see Migration 069 head comment
 * for the naming-prefix rationale.
 */
export type RecordingAccessType = 'audio_only' | 'full_video';

/**
 * Preset-reason tag the doctor picks from Task 40's modal radio buttons.
 * `null` allowed at the row level for future non-modal callers (Plan 10+
 * admin/AI-initiated escalations); v1 writers always set one of the four
 * values.
 *
 * Kept as `TEXT + CHECK` in Postgres (Migration 070) so future UX
 * iterations can widen additively under the same CHECK name without an
 * `ALTER TYPE` round-trip.
 */
export type VideoEscalationPresetReasonCode =
  | 'visible_symptom'
  | 'document_procedure'
  | 'patient_request'
  | 'other';

/**
 * Patient's response to the consent modal in Task 41. `null` = still
 * pending; the row-shape CHECK in Migration 070 pins `(response,
 * responded_at)` as co-present once either is set.
 */
export type VideoEscalationPatientResponse = 'allow' | 'decline' | 'timeout';

/**
 * How the patient last proved presence for video-replay OTP. v1 single
 * value; additively widens (email, authenticator, biometric) via
 * Migration 070's `TEXT + CHECK`.
 */
export type VideoOtpVerificationMethod = 'sms';

// ============================================================================
// Row shapes — camelCase mirrors of migrations 069 + 070 tables.
// ============================================================================

/**
 * One row per doctor-initiated video-recording request. Written by Plan
 * 08 Task 41's escalation service (service-role; RLS-bypassing). Updated
 * exactly once when the patient responds (allow / decline / timeout);
 * then immutable.
 *
 * Pending state:  `patientResponse === null && respondedAt === null`.
 * Resolved state: both non-null (enforced by the DB row-shape CHECK
 *                 `video_escalation_audit_response_shape`).
 */
export interface VideoEscalationAuditRow {
  id: string;
  sessionId: string;
  /**
   * Doctor UUID. INTENTIONALLY no FK at the DB layer — account-deletion
   * carve-out (see Migration 070 head comment). Downstream joins must
   * tolerate dangling refs after a doctor scrub.
   */
  doctorId: string;
  requestedAt: string;
  /** Free-text reason, 5..200 chars (CHECK-enforced). */
  reason: string;
  presetReasonCode: VideoEscalationPresetReasonCode | null;
  patientResponse: VideoEscalationPatientResponse | null;
  respondedAt: string | null;
  correlationId: string | null;
}

/**
 * Insert shape for the escalation service. `id`, `requestedAt`, and the
 * response-side columns default or are populated later; callers only
 * supply the request-time context.
 */
export interface InsertVideoEscalationAuditRow {
  sessionId: string;
  doctorId: string;
  reason: string;
  presetReasonCode?: VideoEscalationPresetReasonCode | null;
  correlationId?: string | null;
}

/**
 * Update shape for Task 41's consent-response handler. `respondedAt` is
 * server-assigned (clock-skew doctrine — never trust patient clock); the
 * service should call `new Date().toISOString()` at UPDATE time.
 */
export interface UpdateVideoEscalationAuditResponse {
  patientResponse: VideoEscalationPatientResponse;
  respondedAt: string;
}

/**
 * One row per patient who has verified a video-replay SMS OTP. PK is the
 * patient id — `UPSERT` is the write pattern ("re-verified today; bump
 * the timestamp"). Read on every video-replay attempt in Task 44.
 */
export interface VideoOtpWindowRow {
  patientId: string;
  lastOtpVerifiedAt: string;
  lastOtpVerifiedVia: VideoOtpVerificationMethod;
  correlationId: string | null;
}

/**
 * UPSERT payload for Task 44's OTP-verify handler. Omits nothing — every
 * field either has a value or `null`.
 */
export interface UpsertVideoOtpWindowRow {
  patientId: string;
  lastOtpVerifiedAt: string;
  lastOtpVerifiedVia: VideoOtpVerificationMethod;
  correlationId?: string | null;
}
