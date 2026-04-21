/**
 * Dashboard Events Service (Plan 07 · Task 30).
 *
 * Thin wrapper over the `doctor_dashboard_events` table. Three concerns:
 *
 *   1. **`insertDashboardEvent`** — service-role insert path used by
 *      `notification-service.ts#notifyDoctorOfPatientReplay` (and any
 *      future event-emitter, e.g. Plan 09's `modality_switched`). Adds
 *      idempotency on `(doctor_id, payload->>'recording_access_audit_id')`
 *      so retries from a Twilio 5xx don't double-fire the feed entry.
 *
 *   2. **`getDashboardEventsForDoctor`** — paginated read for the doctor
 *      dashboard feed. Service-role read with explicit `doctor_id` filter
 *      (we own the auth check at the controller layer; the RLS policy
 *      `doctor_dashboard_events_select_self` is a belt-and-suspenders
 *      defense for any future client-direct read).
 *
 *   3. **`markDashboardEventAcknowledged`** — sets `acknowledged_at = now()`
 *      for the row, gated on doctor ownership at the SQL layer (the
 *      `WHERE doctor_id = ?` filter is the auth check; if the row doesn't
 *      belong to the caller the UPDATE affects 0 rows and the helper
 *      throws `NotFoundError` — same shape the controller maps to a 404).
 *
 * Cursor pagination uses opaque `created_at|id` cursors so the order
 * stays stable under concurrent inserts. The cursor is base64-encoded so
 * the client treats it as opaque and we can change the shape later
 * without a client refactor.
 *
 * @see backend/migrations/066_doctor_dashboard_events.sql
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-30-mutual-replay-notifications.md
 */

import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import { InternalError, NotFoundError, ValidationError } from '../utils/errors';

// ============================================================================
// Public types
// ============================================================================

export type DashboardEventKind =
  | 'patient_replayed_recording'
  // Plan 08 · Task 42 — first Plan-08 consumer of the dashboard-events
  // feed. Fires when a patient taps [Stop] on the mid-call video-recording
  // indicator; the feed entry is the doctor-side reactive surface per
  // task-42 "Doctor-side reactive surface" (subtler than a banner, no
  // audible alarm). Migration 073 widens the event_kind CHECK to allow
  // inserts with this value.
  | 'patient_revoked_video_mid_session'
  // Plan 08 · Task 44 · Decision 10 LOCKED — patient clicked the
  // "Show video" toggle on `<RecordingReplayPlayer>` and (after the
  // first-per-30-days SMS OTP) the backend successfully minted a video
  // composition URL. Semantically-distinct from the audio baseline
  // because the doctor-dashboard feed entry carries a 🎥 indicator so
  // the doctor sees "video" vs "audio" at a glance. Migration 074
  // widens the event_kind CHECK to allow inserts with this value;
  // `notification-service.notifyDoctorOfPatientReplay` routes the
  // `artifactType: 'video'` branch to this kind instead of the
  // baseline `patient_replayed_recording`.
  | 'patient_replayed_video';

/**
 * Pinned shape for `event_kind === 'patient_replayed_recording'`. Other
 * future kinds will live in a discriminated union here so the frontend
 * can switch on `event_kind` exhaustively.
 */
export interface PatientReplayedRecordingPayload {
  /**
   * `'audio'` (Task 30 baseline), `'transcript'` (Task 32), or
   * `'video'` (Plan 08 Task 44). `'video'` payloads are paired with
   * `event_kind = 'patient_replayed_video'` (not the baseline
   * `patient_replayed_recording`) so the dashboard can fork the feed
   * entry without parsing the payload.
   */
  artifact_type:               'audio' | 'transcript' | 'video';
  /**
   * What the patient did with the artifact:
   *   - 'reviewed'   → played the audio replay (Task 29 flow) OR opened
   *                     the transcript review surface (Task 32 review).
   *   - 'downloaded' → downloaded the PDF transcript (Task 32 export).
   *
   * Optional because the field is additive (Task 32 introduced it); old
   * rows without it default to 'reviewed' at the UI layer — Task 30
   * originally only carried reviewed semantics. Future read paths must
   * treat `undefined` as 'reviewed' for backward compatibility.
   */
  action_kind?:                'reviewed' | 'downloaded';
  recording_access_audit_id:   string;
  patient_display_name:        string;
  replayed_at:                 string;
  consult_date:                string | null;
  accessed_by_role:            'patient' | 'support_staff';
  accessed_by_user_id:         string;
  escalation_reason?:          string;
}

/**
 * Pinned shape for `event_kind === 'patient_revoked_video_mid_session'`
 * (Plan 08 · Task 42). Fired from `recording-escalation-service.
 * patientRevokeVideoMidCall` after the Twilio rule-flip returns to
 * `audio_only`. The doctor-side feed entry is NOT a disruptive banner —
 * see task-42 "Doctor-side reactive surface" + Notes #2.
 *
 * Why a separate payload type rather than overloading
 * `PatientReplayedRecordingPayload`?
 *   · Different required fields (no `artifact_type`, no
 *     `recording_access_audit_id`, etc.).
 *   · Keeps the per-event-kind contract legible at call sites.
 *   · `InsertDashboardEventInput['payload']` unions them so the service
 *     writes are still strongly typed.
 */
export interface PatientRevokedVideoMidSessionPayload {
  /** `video_escalation_audit.id` of the `allow` row that was revoked.
   *  Threads the dashboard feed → audit ledger → Twilio correlation-id. */
  video_escalation_audit_id:  string;
  /** Server-assigned ISO timestamp of the revoke. Matches the same
   *  moment stamped on `video_escalation_audit.revoked_at`. */
  revoked_at:                 string;
  /** Free-text resolved at insert time. Empty string if the patient has
   *  no display name pinned (Plan 05 feature-flag off). The doctor's
   *  feed item falls back to "Your patient" in that case. */
  patient_display_name:       string;
  /** Best-effort `consultation_sessions.actual_started_at` so the feed
   *  row can render "Revoked during consult on …". NULL if unavailable. */
  consult_started_at:         string | null;
}

/**
 * Union of per-event-kind payloads. Callers typically pick the right
 * shape via `eventKind` discriminator; this union type lets the
 * `InsertDashboardEventInput` accept either without collapsing to
 * `unknown`.
 */
export type DashboardEventPayload =
  | PatientReplayedRecordingPayload
  | PatientRevokedVideoMidSessionPayload;

export interface DashboardEvent {
  id:              string;
  doctorId:        string;
  eventKind:       DashboardEventKind;
  sessionId:       string | null;
  payload:         DashboardEventPayload;
  acknowledgedAt:  string | null;
  createdAt:       string;
}

export interface InsertDashboardEventInput {
  doctorId:    string;
  eventKind:   DashboardEventKind;
  sessionId:   string | null;
  payload:     DashboardEventPayload;
  /**
   * Idempotency key. When set, we pre-check `doctor_dashboard_events`
   * for any row with the same `(doctor_id, payload->>'recording_access_audit_id')`
   * tuple and return `{ inserted: false, eventId: <existing> }` instead
   * of inserting a duplicate.
   *
   * For `patient_replayed_recording`, this should be the
   * `recording_access_audit.id` of the row written by
   * `recording-access-service.mintReplayUrl()`. Future event kinds may
   * dedupe on a different key; the helper keys generically on
   * `payload->>'recording_access_audit_id'` because that's the only
   * caller today.
   */
  recordingAccessAuditId?: string;
}

export interface InsertDashboardEventResult {
  inserted: boolean;
  eventId:  string;
}

export interface GetDashboardEventsInput {
  doctorId:    string;
  unreadOnly?: boolean;
  limit?:      number;
  /** Opaque base64 cursor returned from a previous page. */
  cursor?:     string;
}

export interface GetDashboardEventsResult {
  events:      DashboardEvent[];
  nextCursor?: string;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT     = 100;

// ============================================================================
// Cursor helpers
// ============================================================================

interface DecodedCursor {
  createdAt: string;
  id:        string;
}

function encodeCursor(cur: DecodedCursor): string {
  return Buffer.from(`${cur.createdAt}|${cur.id}`, 'utf8').toString('base64url');
}

function decodeCursor(raw: string): DecodedCursor | null {
  try {
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    const [createdAt, id] = decoded.split('|');
    if (!createdAt || !id) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

// ============================================================================
// Row → DashboardEvent mapper
// ============================================================================

interface RawRow {
  id:              string;
  doctor_id:       string;
  event_kind:      string;
  session_id:      string | null;
  payload:         unknown;
  acknowledged_at: string | null;
  created_at:      string;
}

function toEvent(row: RawRow): DashboardEvent {
  const payload =
    row.payload && typeof row.payload === 'object'
      ? (row.payload as DashboardEventPayload)
      : ({} as DashboardEventPayload);
  return {
    id:             row.id,
    doctorId:       row.doctor_id,
    eventKind:      row.event_kind as DashboardEventKind,
    sessionId:      row.session_id,
    payload,
    acknowledgedAt: row.acknowledged_at,
    createdAt:      row.created_at,
  };
}

// ============================================================================
// Public: insertDashboardEvent
// ============================================================================

export async function insertDashboardEvent(
  input: InsertDashboardEventInput,
): Promise<InsertDashboardEventResult> {
  if (!input.doctorId?.trim()) {
    throw new ValidationError('doctorId is required');
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError(
      'dashboard-events-service: Supabase admin client unavailable',
    );
  }

  // Idempotency pre-check. We key on (doctor_id, recording_access_audit_id)
  // — recordingAccessAuditId is unique per replay attempt, so two retries
  // of `mintReplayUrl` for the same attempt land on the same dedup key.
  if (input.recordingAccessAuditId?.trim()) {
    const { data: existing, error: existingErr } = await admin
      .from('doctor_dashboard_events')
      .select('id')
      .eq('doctor_id', input.doctorId)
      .eq('payload->>recording_access_audit_id', input.recordingAccessAuditId)
      .limit(1);
    if (existingErr) {
      logger.warn(
        {
          doctorId: input.doctorId,
          recordingAccessAuditId: input.recordingAccessAuditId,
          error: existingErr.message,
        },
        'dashboard-events-service: idempotency pre-check failed; will attempt insert anyway',
      );
    }
    if (existing && existing.length > 0) {
      const existingRow = existing[0] as { id: string };
      return { inserted: false, eventId: existingRow.id };
    }
  }

  const { data, error } = await admin
    .from('doctor_dashboard_events')
    .insert({
      doctor_id:  input.doctorId,
      event_kind: input.eventKind,
      session_id: input.sessionId,
      payload:    input.payload,
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new InternalError(
      `dashboard-events-service: insert failed (${error?.message ?? 'no row returned'})`,
    );
  }
  const inserted = data as { id: string };
  return { inserted: true, eventId: inserted.id };
}

// ============================================================================
// Public: getDashboardEventsForDoctor
// ============================================================================

export async function getDashboardEventsForDoctor(
  input: GetDashboardEventsInput,
): Promise<GetDashboardEventsResult> {
  if (!input.doctorId?.trim()) {
    throw new ValidationError('doctorId is required');
  }
  const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError(
      'dashboard-events-service: Supabase admin client unavailable',
    );
  }

  let query = admin
    .from('doctor_dashboard_events')
    .select(
      'id, doctor_id, event_kind, session_id, payload, acknowledged_at, created_at',
    )
    .eq('doctor_id', input.doctorId);

  if (input.unreadOnly) {
    query = query.is('acknowledged_at', null);
  }

  // Order: created_at DESC, id DESC. Cursor decodes a (created_at, id)
  // tuple and we ask for rows strictly older than the cursor (lexical
  // tiebreak on id). Keeping ordering consistent with the unread-first
  // index — we sort by created_at DESC after RLS surfaces the rows. The
  // explicit "unread before read" order is enforced at the controller
  // layer for v1 (we just send chronological); a future v1.1 can switch
  // to two-bucket fetch (unread page + read page) if doctors complain.
  query = query.order('created_at', { ascending: false }).order('id', { ascending: false });

  const cursor = input.cursor?.trim() ? decodeCursor(input.cursor.trim()) : null;
  if (cursor) {
    // Equivalent to: WHERE (created_at, id) < (?, ?). Supabase doesn't
    // expose tuple comparison; emulate with the OR-of-(strictly less)
    // pattern.
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    );
  }

  // Fetch limit+1 so we know if there's a next page without a count(*).
  const { data, error } = await query.limit(limit + 1);
  if (error) {
    throw new InternalError(
      `dashboard-events-service: query failed (${error.message})`,
    );
  }

  const rows = (data ?? []) as RawRow[];
  const hasNext = rows.length > limit;
  const pageRows = hasNext ? rows.slice(0, limit) : rows;
  const events = pageRows.map(toEvent);

  let nextCursor: string | undefined;
  if (hasNext && pageRows.length > 0) {
    const last = pageRows[pageRows.length - 1]!;
    nextCursor = encodeCursor({ createdAt: last.created_at, id: last.id });
  }

  return nextCursor ? { events, nextCursor } : { events };
}

// ============================================================================
// Public: markDashboardEventAcknowledged
// ============================================================================

export async function markDashboardEventAcknowledged(input: {
  doctorId: string;
  eventId:  string;
}): Promise<void> {
  if (!input.doctorId?.trim()) {
    throw new ValidationError('doctorId is required');
  }
  if (!input.eventId?.trim()) {
    throw new ValidationError('eventId is required');
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError(
      'dashboard-events-service: Supabase admin client unavailable',
    );
  }

  // Auth check is the WHERE filter — the row only updates if it belongs
  // to the caller. A second call against an already-ack'd row is a
  // no-op (we don't overwrite acknowledged_at; the UPDATE just doesn't
  // change the value because we filter on `IS NULL`).
  const { data, error } = await admin
    .from('doctor_dashboard_events')
    .update({ acknowledged_at: new Date().toISOString() })
    .eq('doctor_id', input.doctorId)
    .eq('id', input.eventId)
    .is('acknowledged_at', null)
    .select('id')
    .maybeSingle();

  if (error) {
    throw new InternalError(
      `dashboard-events-service: acknowledge update failed (${error.message})`,
    );
  }

  if (!data) {
    // Either the row doesn't exist, doesn't belong to the caller, or
    // was already acknowledged. Treat the first two as 404; the third
    // (already-ack'd by the same doctor in a different tab) is also a
    // no-op success — distinguish by re-checking with no `IS NULL`
    // filter.
    const { data: existing, error: existingErr } = await admin
      .from('doctor_dashboard_events')
      .select('id, acknowledged_at')
      .eq('doctor_id', input.doctorId)
      .eq('id', input.eventId)
      .maybeSingle();
    if (existingErr) {
      throw new InternalError(
        `dashboard-events-service: post-update lookup failed (${existingErr.message})`,
      );
    }
    if (!existing) {
      throw new NotFoundError('Dashboard event not found');
    }
    // Already acknowledged — return success silently.
    return;
  }
}
