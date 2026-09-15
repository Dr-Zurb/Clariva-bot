/**
 * Consultation recording-audit ledger (Migration 064 + 071 + rec-13 / 196).
 *
 * CamelCase service-boundary mirror of `consultation_recording_audit`.
 * Writers that talk to the admin Supabase client keep snake_case locals
 * and map at the boundary — same convention as `video-recording-audit.ts`.
 *
 * @see backend/migrations/064_consultation_recording_audit.sql
 * @see backend/migrations/071_recording_audit_action_video_values.sql
 * @see backend/migrations/196_recording_pause_reason_codes_and_auto_resume_stamps.sql
 */

/** Mirrors `recording_audit_action` (064 + 071). */
export type RecordingAuditAction =
  | 'recording_started'
  | 'recording_paused'
  | 'recording_resumed'
  | 'recording_stopped'
  | 'patient_declined_pre_session'
  | 'patient_revoked_video_mid_session'
  | 'video_recording_started'
  | 'video_recording_reverted';

/** Mirrors `action_by_role` CHECK (064). rec-13 does not widen this. */
export type RecordingAuditActionByRole = 'doctor' | 'patient' | 'system' | 'support_staff';

/**
 * Five preset pause reasons (REC-D14). Mirrors
 * `recording_pause_reason_code`. Adding a sixth is a deliberate
 * migration + a failing content-sanity test.
 */
export const RECORDING_PAUSE_REASON_CODES = [
  'patient_request',
  'sensitive_disclosure',
  'third_party_present',
  'administrative',
  'technical',
] as const;

export type RecordingPauseReasonCode = (typeof RECORDING_PAUSE_REASON_CODES)[number];

export function isRecordingPauseReasonCode(value: unknown): value is RecordingPauseReasonCode {
  return (
    typeof value === 'string' &&
    (RECORDING_PAUSE_REASON_CODES as readonly string[]).includes(value)
  );
}

/**
 * Wire/read token for a pause that has no preset code (rec-13 redaction
 * or a pre-rec-15 row). Not one of the five codes — never guess.
 */
export const PAUSE_REASON_NOT_RECORDED = 'not_recorded_in_preset_form';

/**
 * Single definition of the REC-D16 bound (rec-16). Service, worker and
 * the state payload all reference this. Clients render remaining time
 * from the server's `autoResumeAt`, never `Date.now() + this`.
 */
export const RECORDING_PAUSE_AUTO_RESUME_MS = 5 * 60 * 1000;

/** Schema-capped extension count (REC-D16). Do not raise without a migration. */
export const RECORDING_PAUSE_MAX_EXTENSIONS = 1;

/**
 * `action_by` for system-attributed ledger rows (064 L142–143 /
 * `SYSTEM_SENDER_ID`). Never reuse for a patient (rec-13).
 */
export const RECORDING_SYSTEM_ACTOR_UUID = '00000000-0000-0000-0000-000000000000';

/** Per-tick cap so a cron outage backlog cannot starve one pod. */
export const RECORDING_AUTO_RESUME_BATCH_CAP = 50;

/**
 * Cron tick cadence (seconds). 5-minute policy; worst-case overshoot
 * is one tick (15s). Documented on the cron route.
 */
export const RECORDING_AUTO_RESUME_TICK_SECONDS = 15;

/** Claim older than this is released so a crashed pod cannot pin a row. */
export const RECORDING_AUTO_RESUME_CLAIM_STALE_MS = 2 * 60 * 1000;

/**
 * Orphan `attempted`-row SLA (064 L22–29 / rec-20). One place — do not
 * re-type 5 minutes at the worker or the cron route.
 */
export const RECORDING_AUDIT_ORPHAN_SLA_MS = 5 * 60 * 1000;

/** Per-tick cap so an April-onward backlog cannot starve one pod. */
export const RECORDING_ORPHAN_RECONCILE_BATCH_CAP = 50;

/**
 * Cron tick cadence (seconds). SLA is 5 minutes; worst-case lag after
 * the SLA is one tick (5:00–6:00). Far coarser than the 5s escalation
 * worker — a governance-table poll does not want that cadence.
 */
export const RECORDING_ORPHAN_RECONCILE_TICK_SECONDS = 60;

/** Claim older than this is released so a crashed pod cannot pin an orphan. */
export const RECORDING_ORPHAN_CLAIM_STALE_MS = 2 * 60 * 1000;

/**
 * How a pause row was closed (REC-D16). Column discriminator — not a
 * new `recording_audit_action` value (071: status stays off the action
 * name). `null` = still open.
 */
export type RecordingPauseClosedAs = 'manual_resume' | 'auto_resume' | 'session_ended_while_paused';

/** Schema-capped extension count (REC-D16 — one extension). */
export type RecordingAutoResumeExtensionsUsed = 0 | 1;

/** Capture kinds a pause suppressed / a resume restored (rec-14). */
export type RecordingCaptureKind = 'audio' | 'video';

/**
 * Why video was or was not restored on resume (REC3-D5).
 * `not_applicable` = the pause never covered video.
 */
export type VideoRestoreDecision = 'restored' | 'grant_lapsed' | 'grant_unknown' | 'not_applicable';

/**
 * One ledger row. New rec-13 columns are nullable: historical rows
 * have null codes, null deadlines, and null closed-as.
 *
 * Patient pauses with no `auth.users` id: `actionBy` is
 * `consultation_sessions.id` and `actionByRole` remains `'patient'`.
 * System rows use the all-zeros UUID — never reuse that for a patient.
 */
export interface ConsultationRecordingAuditRow {
  id: string;
  sessionId: string;
  action: RecordingAuditAction;
  actionBy: string;
  actionByRole: RecordingAuditActionByRole;
  reason: string | null;
  pauseReasonCode: RecordingPauseReasonCode | null;
  autoResumeAt: string | null;
  autoResumeExtensionsUsed: RecordingAutoResumeExtensionsUsed | null;
  pauseClosedAs: RecordingPauseClosedAs | null;
  metadata: Record<string, unknown>;
  correlationId: string | null;
  createdAt: string;
}
