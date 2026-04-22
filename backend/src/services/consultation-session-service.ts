/**
 * Consultation Session Service — modality-blind facade (Plan 01 · Task 15)
 *
 * Single entry point for `createSession()` / `endSession()` / `getJoinToken()`
 * across text, voice, and video. All three adapters are now registered:
 * video (Plan 01 · Task 15), text (Plan 04 · Task 18 — Supabase Realtime),
 * and voice (Plan 05 · Task 23 — Twilio Video audio-only wrapper).
 *
 * **Lazy-write cutover strategy.** Every facade `createSession()` call writes
 * a new `consultation_sessions` row AND lets the legacy
 * `appointments.consultation_room_*` columns continue to be populated by
 * `appointment-service.ts:startConsultation` for the cutover window. Existing
 * in-flight rooms (created before this task shipped) finish on the legacy
 * read path; no backfill. Task 35 ships the drop migration ~14 days later
 * once telemetry confirms zero in-flight legacy rows.
 *
 * **Invariant guarded by PR-time grep.** No file outside this one imports
 * from `./video-session-twilio` directly:
 *   `rg "from .*video-session-twilio" --type ts | rg -v "consultation-session-service\.ts"`
 *
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-15-consultation-sessions-facade-and-schema.md
 * @see COMPLIANCE.md - No PHI in logs
 */

import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import { InternalError, NotFoundError } from '../utils/errors';
import {
  isTwilioVideoConfigured as adapterIsTwilioVideoConfigured,
  videoSessionTwilioAdapter,
} from './video-session-twilio';
import {
  provisionCompanionChannel,
  textSessionSupabaseAdapter,
} from './text-session-supabase';
import { voiceSessionTwilioAdapter } from './voice-session-twilio';
import {
  emitConsultEnded,
  emitConsultStarted,
} from './consultation-message-service';
import { sendPostConsultChatHistoryDm } from './notification-service';
import { startAudioOnlyRecording } from './recording-track-service';
import type {
  ConsultationSessionAdapter,
  CreateSessionInput,
  JoinToken,
  Modality,
  Provider,
  SessionRecord,
  SessionStatus,
} from '../types/consultation-session';

// ============================================================================
// Adapter registry
// ============================================================================

/**
 * Registered per-modality adapters.
 *
 * - `video` — `videoSessionTwilioAdapter` (Plan 01 · Task 15).
 * - `text`  — `textSessionSupabaseAdapter` (Plan 04 · Task 18).
 * - `voice` — `voiceSessionTwilioAdapter` (Plan 05 · Task 23, Twilio Video
 *   audio-only wrapper). See `voice-session-twilio.ts` for the contract:
 *   thin wrapper around the video adapter with audio-only Recording Rules
 *   + post-`endSession` transcription enqueue.
 */
const ADAPTER_REGISTRY: Record<Modality, () => ConsultationSessionAdapter> = {
  video: () => videoSessionTwilioAdapter,
  text: () => textSessionSupabaseAdapter,
  voice: () => voiceSessionTwilioAdapter,
};

function getAdapter(modality: Modality): ConsultationSessionAdapter {
  const factory = ADAPTER_REGISTRY[modality];
  if (!factory) {
    throw new InternalError(`Unknown modality: ${String(modality)}`);
  }
  return factory();
}

// ============================================================================
// Public API: lifecycle
// ============================================================================

/**
 * Provision a consultation session for an appointment. Idempotent at the
 * facade level: if a `consultation_sessions` row already exists for
 * `(appointmentId, modality)` and is not yet `ended`/`cancelled`, that row
 * is returned without touching the provider.
 *
 * Returns the persisted `SessionRecord` (with the row UUID) so callers can
 * pass `session.id` to `getJoinToken` / `endSession` later.
 */
export async function createSession(
  input: CreateSessionInput,
  correlationId: string
): Promise<SessionRecord> {
  const existing = await findActiveSessionByAppointment(
    input.appointmentId,
    input.modality
  );
  if (existing) {
    logger.info(
      {
        correlationId,
        appointmentId: input.appointmentId,
        sessionId: existing.id,
        modality: input.modality,
      },
      'Consultation session already exists - returning existing'
    );
    return existing;
  }

  const adapter = getAdapter(input.modality);
  const adapterResult = await adapter.createSession(input, correlationId);

  const row = await persistSessionRow(input, adapter, adapterResult.providerSessionId);

  // Plan 08 · Task 43 · Decision 10 LOCKED — audio-only baseline for
  // every fresh VIDEO session.
  //
  // Why video-only and not voice? The voice adapter
  // (`voice-session-twilio.ts#createSession`) already calls
  // `applyAudioOnlyRecordingRules` on its own post-room-create path
  // (Plan 05 · Task 23). Task 43 deliberately left that wiring
  // untouched so voice keeps its straight-line contract — the
  // `startAudioOnlyRecording` ledger-writing entry point is the
  // long-term shared surface, but collapsing voice onto it is a
  // follow-up (see docs/capture/inbox.md) rather than a keystone
  // change.
  //
  // For video sessions the Task 43 service is the single
  // source-of-truth for the baseline: it (a) asks Twilio to lock
  // `include audio` / `exclude video` (idempotent via
  // twilio-recording-rules.setRecordingRulesToAudioOnly), and (b)
  // writes a `recording_started` double-row ledger entry so the
  // audit trail is complete from T0.
  //
  // Wrapped in try/catch — a baseline-establishment failure MUST
  // NOT tear down the freshly persisted session row (the Twilio
  // room exists; participants can still join; the worst case is a
  // degraded audit trail which the reconciliation worker catches).
  // We log at error severity so alarm pipelines can fire.
  if (row.modality === 'video' && adapterResult.providerSessionId) {
    try {
      await startAudioOnlyRecording({
        sessionId:   row.id,
        roomSid:     adapterResult.providerSessionId,
        initiatedBy: 'system',
        correlationId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(
        {
          correlationId,
          sessionId: row.id,
          roomSid: adapterResult.providerSessionId,
          error: message,
          severity: 'critical',
        },
        'createSession: startAudioOnlyRecording FAILED (alarm — session proceeds without baseline audit row)',
      );
    }
  }

  // Plan 06 · Task 36 · Decision 9 LOCKED: auto-provision a companion
  // text channel for every fresh voice + video session. Text sessions
  // skip — the text adapter owns its chat surface end-to-end and the
  // primary chat IS the consult.
  //
  // Best-effort contract: a failed companion provisioning MUST NOT
  // block the primary consult. Tasks 38 + 24c render a "Chat
  // unavailable" notice when `row.companion` is absent.
  if (row.modality === 'voice' || row.modality === 'video') {
    try {
      const companion = await provisionCompanionChannel({
        sessionId: row.id,
        doctorId: row.doctorId,
        patientId: row.patientId,
        appointmentId: row.appointmentId,
        correlationId,
      });
      if (companion) {
        row.companion = companion;
      }
    } catch (err) {
      logger.error(
        {
          correlationId,
          sessionId: row.id,
          appointmentId: row.appointmentId,
          modality: row.modality,
          err: err instanceof Error ? err.message : String(err),
        },
        'createSession: companion-channel provisioning failed — proceeding without companion chat',
      );
    }
  }

  // Plan 06 · Task 37: fire the canonical "Consultation started at HH:MM."
  // banner across every modality. The helper swallows all errors per its
  // contract (see `consultation-message-service.emitSystemMessage` —
  // dedup + 23514 + admin-unavailable are all turned into warnings, not
  // throws), so no try/catch here.
  await emitConsultStarted(row.id);

  return row;
}

/**
 * End a consultation session: tear down the provider-side resource and mark
 * the row `ended`. Idempotent — calling twice is a no-op.
 */
export async function endSession(
  sessionId: string,
  correlationId: string
): Promise<void> {
  const session = await findSessionById(sessionId);
  if (!session) {
    throw new NotFoundError('Consultation session not found');
  }

  if (session.status === 'ended' || session.status === 'cancelled') {
    return;
  }

  const adapter = getAdapter(session.modality);
  if (session.providerSessionId) {
    await adapter.endSession(session.providerSessionId, correlationId);
  }

  await updateSessionStatus(session.id, 'ended', { actualEndedAt: new Date() });

  // Plan 06 · Task 37: fire the companion-chat "consult ended" banner.
  // Best-effort; the helper itself swallows errors. Wrapping in try/catch
  // here is belt-and-suspenders in case the helper contract ever drifts
  // — a failed banner must never break the session-end transaction.
  try {
    await emitConsultEnded(session.id);
  } catch (err) {
    logger.warn(
      {
        correlationId,
        sessionId: session.id,
        error: err instanceof Error ? err.message : String(err),
      },
      'endSession: emitConsultEnded threw (non-fatal; session is still marked ended)',
    );
  }

  // Plan 07 · Task 31 · Decision 1 sub-decision LOCKED: fire the post-
  // consult chat-history DM to the patient. Fire-and-forget — the
  // helper is idempotent (column-keyed dedup via migration 067's
  // `post_consult_dm_sent_at`) and never throws, but we wrap in a
  // double-safety try/catch so a contract drift can't bubble into
  // endSession and roll back the status flip.
  //
  // Wrapped in `void Promise.resolve().then(...)` so the dispatch does
  // not block endSession's resolution — the caller (controller) gets
  // the OK as soon as the status flip + system-banner are persisted;
  // the DM fan-out (IG-DM + SMS round-trips) happens on the next tick.
  // Mirrors the fire-and-forget pattern used by Task 30's
  // `notifyReplayWatcher` in `recording-access-service`.
  void Promise.resolve()
    .then(() =>
      sendPostConsultChatHistoryDm({
        sessionId: session.id,
        correlationId,
      }),
    )
    .catch((err: unknown) => {
      logger.warn(
        {
          correlationId,
          sessionId: session.id,
          error: err instanceof Error ? err.message : String(err),
        },
        'endSession: sendPostConsultChatHistoryDm threw (non-fatal; session is still marked ended)',
      );
    });
}

/**
 * Mint a participant join token for an existing session.
 *
 * `getJoinToken` is the only path callers should use to request Twilio
 * Video tokens (or future Supabase Realtime / Twilio voice tokens). Direct
 * imports of `generateVideoAccessToken` from outside this file are
 * forbidden by the PR-time grep.
 */
export async function getJoinToken(
  sessionId: string,
  role: 'doctor' | 'patient',
  correlationId: string
): Promise<JoinToken> {
  const session = await findSessionById(sessionId);
  if (!session) {
    throw new NotFoundError('Consultation session not found');
  }

  const adapter = getAdapter(session.modality);
  return adapter.getJoinToken(
    {
      appointmentId: session.appointmentId,
      doctorId: session.doctorId,
      role,
      providerSessionId: session.providerSessionId,
      sessionId: session.id,
    },
    correlationId
  );
}

/**
 * Bridge helper for the lazy-write cutover window: mint a token for an
 * appointment that may or may not have a `consultation_sessions` row yet.
 *
 * - If a session row exists, it is used (provider session id flows through).
 * - If no row exists (legacy in-flight room created before Task 15 shipped),
 *   the adapter's `getJoinToken` is called directly with the appointment id.
 *   The adapter's room-name convention (`appointment-{appointmentId}`) is
 *   stable across the cutover so the legacy room still resolves.
 *
 * Removed when Task 35 drops the legacy `appointments.consultation_room_*`
 * columns. Until then this is the safe path for `appointment-service.ts`
 * `startConsultation` / `getConsultationToken` to mint tokens uniformly.
 */
export async function getJoinTokenForAppointment(
  input: {
    appointmentId: string;
    doctorId: string;
    modality: Modality;
    role: 'doctor' | 'patient';
  },
  correlationId: string
): Promise<JoinToken> {
  const session = await findActiveSessionByAppointment(input.appointmentId, input.modality);
  const adapter = getAdapter(input.modality);
  return adapter.getJoinToken(
    {
      appointmentId: input.appointmentId,
      doctorId: input.doctorId,
      role: input.role,
      providerSessionId: session?.providerSessionId,
      sessionId: session?.id,
    },
    correlationId
  );
}

// ============================================================================
// Public API: row-level helpers (kept on the facade so direct UPDATEs aren't
// scattered across service files)
// ============================================================================

/**
 * Update lifecycle status. Use the timestamp helpers below for join/leave
 * events; this one is for status enum transitions only.
 */
export async function updateSessionStatus(
  sessionId: string,
  status: SessionStatus,
  options: { actualStartedAt?: Date; actualEndedAt?: Date } = {}
): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) return;

  const patch: Record<string, unknown> = { status };
  if (options.actualStartedAt) {
    patch.actual_started_at = options.actualStartedAt.toISOString();
  }
  if (options.actualEndedAt) {
    patch.actual_ended_at = options.actualEndedAt.toISOString();
  }

  const { error } = await admin
    .from('consultation_sessions')
    .update(patch)
    .eq('id', sessionId);

  if (error) {
    logger.warn(
      { sessionId, error: error.message },
      'consultation_sessions status update failed (non-fatal during cutover)'
    );
  }
}

/**
 * Stamp `doctor_joined_at` / `patient_joined_at`. First write wins
 * (idempotent at the SQL level via `IS NULL` filter so retries don't
 * overwrite a real timestamp with a later one).
 */
export async function markParticipantJoined(
  sessionId: string,
  role: 'doctor' | 'patient',
  joinedAt: Date
): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) return;

  const column = role === 'doctor' ? 'doctor_joined_at' : 'patient_joined_at';

  const { error } = await admin
    .from('consultation_sessions')
    .update({ [column]: joinedAt.toISOString() })
    .eq('id', sessionId)
    .is(column, null);

  if (error) {
    logger.warn(
      { sessionId, role, error: error.message },
      'consultation_sessions join timestamp update failed (non-fatal during cutover)'
    );
  }
}

// ============================================================================
// Public API: lookups
// ============================================================================

/**
 * Look up a session by its UUID.
 */
export async function findSessionById(sessionId: string): Promise<SessionRecord | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;

  const { data, error } = await admin
    .from('consultation_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();

  if (error) {
    logger.warn({ sessionId, error: error.message }, 'consultation_sessions lookup failed');
    return null;
  }
  if (!data) return null;
  return rowToSessionRecord(data as ConsultationSessionRow);
}

/**
 * Find the most-recent non-terminal session for an appointment + modality.
 * Used by `createSession()` for idempotency and by callers (controllers)
 * that want to bridge a stale `appointmentId` to its session row during
 * the lazy-write window.
 */
export async function findActiveSessionByAppointment(
  appointmentId: string,
  modality: Modality
): Promise<SessionRecord | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;

  const { data, error } = await admin
    .from('consultation_sessions')
    .select('*')
    .eq('appointment_id', appointmentId)
    .eq('modality', modality)
    .not('status', 'in', '(ended,cancelled)')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.warn(
      { appointmentId, modality, error: error.message },
      'consultation_sessions active lookup failed'
    );
    return null;
  }
  if (!data) return null;
  return rowToSessionRecord(data as ConsultationSessionRow);
}

/**
 * Find a session by its provider-side session id (Twilio room SID for
 * video). Used by webhook handlers (`consultation-verification-service.ts`)
 * to bridge a Twilio RoomSid to the modality-blind session row.
 *
 * Post-Task-35: this is the ONLY RoomSid → appointment lookup path. The
 * legacy `appointments.consultation_room_sid` read path was removed when
 * that migration dropped the column.
 */
export async function findSessionByProviderSessionId(
  provider: Provider,
  providerSessionId: string
): Promise<SessionRecord | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;
  const trimmed = providerSessionId?.trim();
  if (!trimmed) return null;

  const { data, error } = await admin
    .from('consultation_sessions')
    .select('*')
    .eq('provider', provider)
    .eq('provider_session_id', trimmed)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.warn(
      { provider, providerSessionId: trimmed, error: error.message },
      'consultation_sessions provider lookup failed'
    );
    return null;
  }
  if (!data) return null;
  return rowToSessionRecord(data as ConsultationSessionRow);
}

/**
 * Compact shape exposed on appointment API responses in place of the
 * dropped `appointments.consultation_room_sid` / `consultation_started_at`
 * / `consultation_ended_at` columns.
 *
 * Shipped as part of Task 35. Frontend reads
 * `appointment.consultation_session?.provider_session_id` as the new
 * "has a consultation been started?" flag (replaces the old
 * `consultation_room_sid` boolean gate). `actual_started_at` /
 * `actual_ended_at` replace the two timestamp columns.
 */
export interface AppointmentConsultationSessionSummary {
  id: string;
  modality: Modality;
  status: SessionStatus;
  provider: Provider;
  provider_session_id: string | null;
  actual_started_at: string | null;
  actual_ended_at: string | null;
}

/**
 * Look up the latest `consultation_sessions` row for an appointment,
 * regardless of modality / status. Used by appointment API enrichment
 * (Task 35 replaces direct legacy-column reads on the frontend).
 *
 * "Latest" = `ORDER BY created_at DESC LIMIT 1`. If the user starts a
 * session, ends it, and a retry re-starts a new row, the newest wins —
 * which is the behavior the frontend wants (most-recent state).
 */
export async function findLatestAppointmentSessionSummary(
  appointmentId: string
): Promise<AppointmentConsultationSessionSummary | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;

  const { data, error } = await admin
    .from('consultation_sessions')
    .select(
      'id, modality, status, provider, provider_session_id, actual_started_at, actual_ended_at'
    )
    .eq('appointment_id', appointmentId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.warn(
      { appointmentId, error: error.message },
      'consultation_sessions summary lookup failed'
    );
    return null;
  }
  if (!data) return null;
  return {
    id: data.id as string,
    modality: data.modality as Modality,
    status: data.status as SessionStatus,
    provider: data.provider as Provider,
    provider_session_id: (data.provider_session_id as string | null) ?? null,
    actual_started_at: (data.actual_started_at as string | null) ?? null,
    actual_ended_at: (data.actual_ended_at as string | null) ?? null,
  };
}

/**
 * Bulk variant of `findLatestAppointmentSessionSummary`. Fetches all
 * `consultation_sessions` rows matching the provided appointment ids in a
 * single query and returns a Map keyed by `appointment_id` whose value is
 * the most-recent summary (by `created_at DESC`).
 *
 * Use this when enriching a list response to avoid N+1 reads.
 */
export async function findLatestAppointmentSessionSummariesBulk(
  appointmentIds: readonly string[]
): Promise<Map<string, AppointmentConsultationSessionSummary>> {
  const result = new Map<string, AppointmentConsultationSessionSummary>();
  if (appointmentIds.length === 0) return result;

  const admin = getSupabaseAdminClient();
  if (!admin) return result;

  const { data, error } = await admin
    .from('consultation_sessions')
    .select(
      'id, appointment_id, modality, status, provider, provider_session_id, actual_started_at, actual_ended_at, created_at'
    )
    .in('appointment_id', appointmentIds as string[])
    .order('created_at', { ascending: false });

  if (error) {
    logger.warn(
      { count: appointmentIds.length, error: error.message },
      'consultation_sessions bulk summary lookup failed'
    );
    return result;
  }
  if (!data) return result;

  for (const row of data as Array<Record<string, unknown>>) {
    const appointmentId = row.appointment_id as string;
    // First hit wins because the query is ordered DESC by created_at.
    if (result.has(appointmentId)) continue;
    result.set(appointmentId, {
      id: row.id as string,
      modality: row.modality as Modality,
      status: row.status as SessionStatus,
      provider: row.provider as Provider,
      provider_session_id: (row.provider_session_id as string | null) ?? null,
      actual_started_at: (row.actual_started_at as string | null) ?? null,
      actual_ended_at: (row.actual_ended_at as string | null) ?? null,
    });
  }
  return result;
}

// ============================================================================
// Re-exports — backward-compat surface for callers that previously imported
// from the legacy `consultation-room-service.ts`. New code should NOT depend
// on these; they exist so the rename PR is small and the facade can absorb
// future call-sites without churn elsewhere.
// ============================================================================

/**
 * Cheap config check used by `appointment-service.ts:startConsultation` to
 * fast-fail with a friendly error before attempting room provisioning.
 */
export function isVideoModalityConfigured(): boolean {
  return adapterIsTwilioVideoConfigured();
}

// ============================================================================
// Internal: persistence + row mapping
// ============================================================================

interface ConsultationSessionRow {
  id: string;
  appointment_id: string;
  doctor_id: string;
  patient_id: string | null;
  modality: Modality;
  status: SessionStatus;
  provider: Provider;
  provider_session_id: string | null;
  scheduled_start_at: string;
  expected_end_at: string;
  actual_started_at: string | null;
  actual_ended_at: string | null;
  doctor_joined_at: string | null;
  patient_joined_at: string | null;
  recording_consent_at_book: boolean | null;
  recording_artifact_ref: string | null;
  created_at: string;
  updated_at: string;
}

function rowToSessionRecord(row: ConsultationSessionRow): SessionRecord {
  return {
    id: row.id,
    appointmentId: row.appointment_id,
    doctorId: row.doctor_id,
    patientId: row.patient_id ?? null,
    modality: row.modality,
    status: row.status,
    provider: row.provider,
    providerSessionId: row.provider_session_id ?? undefined,
    scheduledStartAt: new Date(row.scheduled_start_at),
    expectedEndAt: new Date(row.expected_end_at),
  };
}

async function persistSessionRow(
  input: CreateSessionInput,
  adapter: ConsultationSessionAdapter,
  providerSessionId: string | undefined
): Promise<SessionRecord> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    // Cutover safety: if the admin client is unavailable, return a synthetic
    // record so the caller (legacy `startConsultation`) can still hand a
    // join URL to the doctor. The legacy `appointments.consultation_room_*`
    // write path will keep the appointment usable; the missing
    // consultation_sessions row will be visible in Q-style ops queries
    // that compare the two writers during the cutover window.
    logger.warn(
      { appointmentId: input.appointmentId, modality: input.modality },
      'consultation_sessions persist skipped (admin client unavailable)'
    );
    return {
      id: '',
      appointmentId: input.appointmentId,
      doctorId: input.doctorId,
      patientId: input.patientId,
      modality: input.modality,
      status: 'scheduled',
      provider: adapter.provider,
      providerSessionId,
      scheduledStartAt: input.scheduledStartAt,
      expectedEndAt: input.expectedEndAt,
    };
  }

  const { data, error } = await admin
    .from('consultation_sessions')
    .insert({
      appointment_id: input.appointmentId,
      doctor_id: input.doctorId,
      patient_id: input.patientId,
      modality: input.modality,
      // Plan 09 · Migration 075 made `current_modality` NOT NULL with no
      // default. On fresh sessions the live modality equals the booked
      // modality; mid-consult switches update it via the state machine
      // (`executeAndCommitTransition` in modality-change-service.ts).
      current_modality: input.modality,
      provider: adapter.provider,
      provider_session_id: providerSessionId ?? null,
      scheduled_start_at: input.scheduledStartAt.toISOString(),
      expected_end_at: input.expectedEndAt.toISOString(),
      recording_consent_at_book: input.recordingConsentAtBook ?? null,
      status: 'scheduled' satisfies SessionStatus,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new InternalError(
      `consultation_sessions insert failed: ${error?.message ?? 'no row returned'}`
    );
  }

  return rowToSessionRecord(data as ConsultationSessionRow);
}
