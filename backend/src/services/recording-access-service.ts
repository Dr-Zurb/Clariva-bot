/**
 * Recording Access Service (Plan 07 Â· Task 29 Â· Decision 4 + 10 LOCKED).
 *
 * Patient-self-serve replay of a consult's audio recording, with the
 * **three-door policy pipeline** doctored into every call: AuthZ â†’
 * support-escalation validation â†’ patient self-serve window â†’
 * revocation list â†’ artifact readiness â†’ audit write â†’ URL mint â†’
 * mutual notification â†’ return.
 *
 * **Stream-only (Decision 10 LOCKED).** This service produces a signed
 * URL that the frontend hands to an HTML5 `<audio>` element. The URL
 * carries a 15-min TTL; the frontend re-mints transparently on expiry.
 * Server-side watermark is documented out-of-scope; the audit row is
 * the real defense.
 *
 * **Audit ledger semantics.** Every `mintReplayUrl()` call writes
 * exactly ONE `recording_access_audit` row regardless of outcome â€”
 * granted AND denied. Regulatory doctrine treats "denied access
 * attempt" as first-class signal (a support-ticket search for "denied:
 * revoked" must surface every attempt). `getReplayAvailability()` is
 * the preflight-for-UI helper and is intentionally NOT audited (would
 * pollute the trail with "is the button enabled?" reads).
 *
 * **Pipeline order is security-critical.** AuthZ first so non-
 * participants don't leak information about which artifacts exist /
 * are revoked. Support-staff escalation validated before any window
 * check so a missing reason fails fast as `ValidationError` (which
 * never audits â€” bad input never audits). Window check before
 * revocation so a 91-day-old replay attempt cleanly surfaces the
 * "contact support" empty state without needing to fetch Twilio
 * metadata. Revocation before artifact-readiness so a revoked artifact
 * never burns a Twilio API call. Audit row written BEFORE the URL is
 * minted so a process crash mid-mint still leaves an audit footprint.
 *
 * **Mutual notification stub.** Plan 07 Task 30 ships the helpers that
 * fan out the "your doctor just replayed your consult" /
 * "your patient just replayed the recording" DMs. Until Task 30 lands,
 * this service logs at `info` so the wiring is exercised; Task 30
 * swaps `notifyReplayWatcher()` for the real fan-out. Notification
 * failures are non-fatal â€” a granted mint succeeds even if the DM
 * never arrives.
 *
 * **v1 scope: `artifactKind: 'audio'` only.** Plan 08 Task 41 extends
 * for `'video'` (with audio-first + SMS OTP + warning-modal friction
 * layered on top); Task 32's transcript export uses `'transcript'`. The
 * discriminated-union shape is intentional so adding a new kind is an
 * additive change inside `mintReplayUrl()` without rewriting callers.
 *
 * @see backend/migrations/065_recording_access_audit.sql
 * @see backend/src/services/twilio-compositions.ts (Twilio adapter this service composes)
 * @see backend/src/services/regulatory-retention-service.ts (TTL window resolver)
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-29-recording-replay-player-patient-self-serve.md
 */

import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import {
  InternalError,
  NotFoundError,
  ValidationError,
} from '../utils/errors';
import { findSessionById } from './consultation-session-service';
import {
  notifyDoctorOfPatientReplay,
  notifyPatientOfDoctorReplay,
} from './notification-service';
import { getRecordingArtifactsForSession } from './recording-track-service';
import { resolveRetentionPolicy } from './regulatory-retention-service';
import {
  fetchCompositionMetadata,
  getComputedTwilioMediaUrl,
  mintCompositionSignedUrl,
} from './twilio-compositions';
import { isVideoOtpRequired } from './video-replay-otp-service';

// ============================================================================
// Public types
// ============================================================================

export type MintReplayErrorCode =
  | 'not_a_participant'
  | 'beyond_self_serve_window'
  | 'revoked'
  | 'artifact_not_ready'
  | 'artifact_not_found'
  | 'no_video_artifact';

export class MintReplayError extends Error {
  constructor(
    public readonly code: MintReplayErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'MintReplayError';
  }
}

/**
 * Thrown from `mintReplayUrl({ artifactKind: 'video' })` when the
 * patient's 30-day OTP window has lapsed. Carries `lastVerifiedAt`
 * so the controller can surface "last verified N days ago" copy to
 * the patient's OTP prompt. Plan 08 · Task 44 · Decision 10 LOCKED.
 */
export class VideoOtpRequiredError extends Error {
  constructor(public readonly lastVerifiedAt: Date | null) {
    super('Video replay requires SMS OTP re-verification');
    this.name = 'VideoOtpRequiredError';
  }
}

/**
 * v1 ships `'audio'`. Plan 08 · Task 44 additively lights up
 * `'video'` for the doctor-escalated / patient-gated video replay
 * path (`access_type='full_video'` in the audit trail). Plan 07
 * Task 32 writes `'transcript'` via a different service
 * (`transcript-pdf-service`) â€” that kind is NOT minted through
 * `mintReplayUrl`.
 */
export type ReplayArtifactKind = 'audio' | 'video';

export type ReplayCallerRole = 'doctor' | 'patient' | 'support_staff';

export interface MintReplayInput {
  sessionId:        string;
  artifactKind:     ReplayArtifactKind;
  /** Caller's user id. Patient: real `consultation_sessions.patient_id`. */
  requestingUserId: string;
  requestingRole:   ReplayCallerRole;
  /** Required when role='support_staff'; â‰¥10 chars; persisted in audit metadata. */
  escalationReason?: string;
  correlationId:    string;
}

export interface MintReplayResult {
  signedUrl:   string;
  expiresAt:   Date;
  /** Twilio Composition SID; surfaced for client-side cache-busting. */
  artifactRef: string;
}

export interface ReplayAvailability {
  available:           boolean;
  reason?:             MintReplayErrorCode;
  /** Set when available=true for patient callers. */
  selfServeExpiresAt?: Date;
  /**
   * Plan 08 · Task 44 · Decision 10 LOCKED. `true` when at least one
   * completed video composition exists for this session. Drives the
   * "Show video" toggle on `<RecordingReplayPlayer>` — the toggle is
   * never rendered when this is `false` (or omitted) because there's
   * nothing to toggle to. Unlike the audio availability signal this
   * is NOT an auth/policy gate — a patient with `hasVideo=true` may
   * still be blocked at mint time if the 30-day OTP window has lapsed.
   */
  hasVideo?:           boolean;
}

export interface ReplayAvailabilityInput {
  sessionId:        string;
  requestingUserId: string;
  requestingRole:   ReplayCallerRole;
}

// ============================================================================
// Constants
// ============================================================================

const SIGNED_URL_TTL_SEC = 15 * 60;
const SUPPORT_ESCALATION_REASON_MIN = 10;
const SUPPORT_ESCALATION_REASON_MAX = 500;
const DEFAULT_PATIENT_SELF_SERVE_DAYS = 90;

// ============================================================================
// Internal: shared session shape
// ============================================================================

/**
 * Shared session-context shape used by the internal policy pipeline.
 * Exported so adjacent artifact services (Task 32 transcript PDF) can
 * reuse `runPolicyChecks` without re-loading the same rows.
 */
export interface SessionContext {
  id:               string;
  doctorId:         string;
  patientId:        string | null;
  actualEndedAt:    Date | null;
  doctorCountry:    string | null;
  doctorSpecialty:  string | null;
}

async function loadSessionContext(sessionId: string): Promise<SessionContext> {
  const session = await findSessionById(sessionId);
  if (!session) {
    throw new NotFoundError('Consultation session not found');
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError(
      'recording-access-service: Supabase admin client unavailable',
    );
  }

  // SessionRecord doesn't expose actual_ended_at â€” read it directly.
  const { data: sessionRow, error: sessionErr } = await admin
    .from('consultation_sessions')
    .select('actual_ended_at')
    .eq('id', sessionId)
    .maybeSingle();
  if (sessionErr) {
    throw new InternalError(
      `recording-access-service: session lookup failed (${sessionErr.message})`,
    );
  }
  const actualEndedAtIso =
    (sessionRow as { actual_ended_at: string | null } | null)?.actual_ended_at ?? null;

  // Pull doctor (country, specialty) for the policy lookup. Best-effort:
  // a missing row falls back to the global ('*', '*') policy in
  // `regulatory-retention-service`.
  let doctorCountry: string | null = null;
  let doctorSpecialty: string | null = null;
  const { data: ds } = await admin
    .from('doctor_settings')
    .select('country, specialty')
    .eq('doctor_id', session.doctorId)
    .maybeSingle();
  if (ds) {
    const row = ds as { country: string | null; specialty: string | null };
    doctorCountry = row.country ?? null;
    doctorSpecialty = row.specialty ?? null;
  }

  return {
    id:              session.id,
    doctorId:        session.doctorId,
    patientId:       session.patientId,
    actualEndedAt:   actualEndedAtIso ? new Date(actualEndedAtIso) : null,
    doctorCountry,
    doctorSpecialty,
  };
}

// ============================================================================
// Internal: artifact resolution (audio only in v1)
// ============================================================================

interface ResolvedAudioArtifact {
  compositionSid: string;
  /** Source row hint for debugging â€” 'index' or 'transcript'. */
  source: 'index' | 'transcript';
}

/**
 * Resolve the audio Composition SID for a session. Prefers
 * `recording_artifact_index` (Plan 02 canonical registry); falls back
 * to the latest non-failed `consultation_transcripts.composition_sid`
 * (Plan 05 Task 25's writer). Either path returns a SID that
 * `twilio-compositions.fetchCompositionMetadata` can resolve.
 *
 * Returns `null` when no artifact reference exists for the session
 * (caller throws `MintReplayError('artifact_not_found')`).
 */
async function resolveAudioArtifact(
  sessionId: string,
): Promise<ResolvedAudioArtifact | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError(
      'recording-access-service: Supabase admin client unavailable',
    );
  }

  // Path A: recording_artifact_index (canonical when populated).
  const { data: artifactRows, error: artifactErr } = await admin
    .from('recording_artifact_index')
    .select('storage_uri, hard_deleted_at, patient_self_serve_visible')
    .eq('session_id', sessionId)
    .eq('artifact_kind', 'audio_composition')
    .is('hard_deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1);
  if (!artifactErr && artifactRows && artifactRows.length > 0) {
    const row = artifactRows[0] as {
      storage_uri: string | null;
      hard_deleted_at: string | null;
      patient_self_serve_visible: boolean | null;
    };
    const sid = extractCompositionSid(row.storage_uri ?? '');
    if (sid) {
      return { compositionSid: sid, source: 'index' };
    }
  }

  // Path B: consultation_transcripts. The canonical Composition SID
  // lives on the `composition_sid` column for any non-failed row.
  const { data: transcriptRows, error: transcriptErr } = await admin
    .from('consultation_transcripts')
    .select('composition_sid, status, created_at')
    .eq('consultation_session_id', sessionId)
    .neq('status', 'failed')
    .order('created_at', { ascending: false })
    .limit(1);
  if (transcriptErr) {
    logger.warn(
      { sessionId, error: transcriptErr.message },
      'recording-access-service: transcript lookup failed (non-fatal)',
    );
  }
  if (transcriptRows && transcriptRows.length > 0) {
    const row = transcriptRows[0] as { composition_sid: string | null };
    const sid = (row.composition_sid ?? '').trim();
    if (sid && sid.startsWith('CJ')) {
      // Twilio Composition SIDs start with 'CJ'. Room SIDs ('RMâ€¦')
      // are placeholders the worker hasn't resolved yet â€” those don't
      // correspond to a real composition and we treat them as
      // "not yet ready".
      return { compositionSid: sid, source: 'transcript' };
    }
  }

  return null;
}

// ============================================================================
// Internal: video artifact resolution (Plan 08 · Task 44 · Decision 10 LOCKED)
// ============================================================================

interface ResolvedVideoArtifact {
  compositionSid: string;
  source: 'twilio';
}

/**
 * Resolve the VIDEO Composition SID for a session. Unlike audio
 * (which has both a canonical `recording_artifact_index` and a
 * fallback transcript path), video has only one source of truth:
 * the live Twilio Compositions API via
 * `getRecordingArtifactsForSession`. Videos are also
 * lower-volume â€” only doctor-escalated sessions produce them â€”
 * so there's no need to precompute a searchable index yet.
 *
 * Returns the first completed video composition. Non-completed
 * compositions (processing / enqueued) are filtered out so the
 * caller sees `null` rather than a SID that would then fail the
 * Stage 5 `status === 'completed'` check with a confusing error.
 * In-progress sessions are expected to wait until the worker
 * finalises the composition.
 */
async function resolveVideoArtifact(
  sessionId: string,
): Promise<ResolvedVideoArtifact | null> {
  try {
    const { videoCompositions } = await getRecordingArtifactsForSession({ sessionId });
    // Pick the most recent completed video composition. The tracker
    // returns them ordered from Twilio; we filter on status to
    // avoid handing back a SID whose media URL isn't ready yet.
    const completed = videoCompositions.find((c) => c.status === 'completed');
    if (!completed) return null;
    return { compositionSid: completed.compositionSid, source: 'twilio' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(
      { sessionId, error: message },
      'recording-access-service: video artifact lookup failed (treating as not found)',
    );
    return null;
  }
}

/**
 * `recording_artifact_index.storage_uri` is opaque per-bucket but for
 * the audio_composition kind the convention is to embed the
 * Composition SID as either the path tail or as `compositions/CJxxx`.
 * Try a couple of common shapes; otherwise returns the input
 * untouched if it already looks like a SID.
 */
function extractCompositionSid(storageUri: string): string | null {
  const trimmed = storageUri.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('CJ')) return trimmed;
  // /compositions/CJxxx... or /audio/CJxxx.mp4
  const match = /(CJ[a-zA-Z0-9]{10,})/.exec(trimmed);
  return match?.[1] ?? null;
}

// ============================================================================
// Internal: revocation list check
// ============================================================================

/**
 * Check the `signed_url_revocation` blocklist for any prefix that
 * matches the canonical media URL prefix of this composition.
 * Returns true when revoked.
 *
 * The list stores prefixes like `'recordings/patient_<uuid>/'` (Plan 02
 * Task 33 convention) â€” but this service operates over Twilio
 * Composition URLs (`https://video.twilio.com/v1/Compositions/<sid>/Media`).
 * To bridge: at revocation-write time the worker SHOULD also write a
 * Twilio-prefixed entry; until that's wired we check both shapes:
 *   1. Twilio-prefixed `https://video.twilio.com/v1/Compositions/<sid>`
 *   2. Generic prefixes (substring match against the SID).
 */
/**
 * Exported for Task 32 transcript PDF service: the revocation list is
 * session-keyed in addition to URL-prefix-keyed, so a transcript export
 * must honor the same blocklist even though it's not a Twilio
 * composition URL. Callers can pass an empty `compositionSid` when
 * only the session-scoped shape matters.
 */
export async function isSessionOrCompositionRevoked(
  sessionId: string,
  compositionSid: string,
): Promise<boolean> {
  return isRevoked(sessionId, compositionSid);
}

async function isRevoked(
  sessionId: string,
  compositionSid: string,
): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError(
      'recording-access-service: Supabase admin client unavailable',
    );
  }

  const compositionUrl = getComputedTwilioMediaUrl(compositionSid);

  // Pull a small slice of the blocklist (prefixes only) and check
  // membership in application code. The list is small in practice
  // (one row per deleted patient + one per support-revoke). If it
  // grows beyond a few thousand entries, swap to a SQL prefix match
  // via `LIKE url_prefix || '%'`.
  const { data, error } = await admin
    .from('signed_url_revocation')
    .select('url_prefix')
    .order('revoked_at', { ascending: false })
    .limit(1000);
  if (error) {
    logger.warn(
      { sessionId, error: error.message },
      'recording-access-service: revocation lookup failed; treating as not-revoked (fail-open)',
    );
    return false;
  }
  const rows = (data ?? []) as { url_prefix: string }[];
  for (const row of rows) {
    const prefix = (row.url_prefix ?? '').trim();
    if (!prefix) continue;
    if (
      compositionUrl.startsWith(prefix) ||
      compositionSid.startsWith(prefix) ||
      prefix.includes(compositionSid)
    ) {
      return true;
    }
  }
  return false;
}

// ============================================================================
// Internal: audit row write
// ============================================================================

interface AuditMetadata {
  outcome:                  'granted' | 'denied';
  deny_reason?:             MintReplayErrorCode;
  escalation_reason?:       string;
  ttl_seconds?:             number;
  twilio_status?:           string;
  url_prefix?:              string;
  policy_id?:               string;
  self_serve_window_ends_at?: string;
}

/**
 * Per Migration 069 the column is an ENUM (`recording_access_type`)
 * with values `'audio_only'` + `'full_video'`. `'audio_only'` is the
 * default for the audio branch + every denial row; the video branch
 * writes `'full_video'` to draw a clean line in the audit trail.
 */
type RecordingAccessType = 'audio_only' | 'full_video';

interface AuditRow {
  session_id:       string;
  artifact_ref:     string;
  artifact_kind:    'audio' | 'video';
  access_type?:     RecordingAccessType;
  accessed_by:      string;
  accessed_by_role: ReplayCallerRole;
  metadata:         AuditMetadata;
  correlation_id:   string | null;
}

async function writeAuditRow(row: AuditRow): Promise<string> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError(
      'recording-access-service: Supabase admin client unavailable â€” cannot write audit',
    );
  }
  const { data, error } = await admin
    .from('recording_access_audit')
    .insert(row as unknown as Record<string, unknown>)
    .select('id')
    .single();
  if (error || !data) {
    throw new InternalError(
      `recording-access-service: audit insert failed (${error?.message ?? 'no row returned'})`,
    );
  }
  return (data as { id: string }).id;
}

// ============================================================================
// Internal: mutual-replay notification dispatch (Task 30)
// ============================================================================

interface NotifyReplayInput {
  sessionId:              string;
  callerRole:             ReplayCallerRole;
  callerUserId:           string;
  artifactKind:           ReplayArtifactKind;
  recordingAccessAuditId: string;
  escalationReason?:      string;
  correlationId:          string;
}

/**
 * Fire the Task 30 mutual-replay notification helpers based on caller
 * role. Decision 4 LOCKED routing:
 *
 *   - `'doctor'`         â†’ notify the patient via IG-DM + SMS.
 *   - `'patient'`        â†’ notify the doctor via dashboard event.
 *   - `'support_staff'`  â†’ notify the doctor via dashboard event (the
 *                          doctor is the consent relationship holder per
 *                          Task 29 Notes #11; the patient is NOT
 *                          notified for support-staff replays because
 *                          Decision 4 frames support escalations as
 *                          internal tooling â€” surfacing them in the
 *                          patient inbox would dilute the trust model).
 *
 * Both helpers are fire-and-forget â€” exceptions are logged but never
 * propagate (notification failures must not undo a granted mint).
 *
 * The input carries `recordingAccessAuditId` so the helpers can dedupe
 * against the persisted audit row id; retries from a Twilio 5xx don't
 * double-fire.
 */
async function notifyReplayWatcher(input: NotifyReplayInput): Promise<void> {
  try {
    // Plan 08 Task 44 lights up `'video'` here alongside audio. Both
    // map cleanly onto the `artifactType` parameter the Task 30
    // helpers accept. Transcript PDFs still flow through a different
    // path (Task 32) so they don't reach this function.
    if (input.artifactKind !== 'audio' && input.artifactKind !== 'video') {
      logger.warn(
        {
          correlationId: input.correlationId,
          sessionId: input.sessionId,
          artifactKind: input.artifactKind,
        },
        'recording-access-service: replay notification skipped (unsupported artifactKind)',
      );
      return;
    }

    const artifactType: 'audio' | 'video' = input.artifactKind;

    if (input.callerRole === 'doctor') {
      const result = await notifyPatientOfDoctorReplay({
        sessionId:              input.sessionId,
        artifactType,
        recordingAccessAuditId: input.recordingAccessAuditId,
        correlationId:          input.correlationId,
      });
      logger.info(
        {
          correlationId: input.correlationId,
          sessionId: input.sessionId,
          callerRole: input.callerRole,
          artifactType,
          result: 'skipped' in result ? { skipped: true, reason: result.reason } : { anySent: result.anySent },
        },
        'recording-access-service: notifyPatientOfDoctorReplay dispatched',
      );
      return;
    }

    if (input.callerRole === 'patient' || input.callerRole === 'support_staff') {
      const result = await notifyDoctorOfPatientReplay({
        sessionId:              input.sessionId,
        artifactType,
        recordingAccessAuditId: input.recordingAccessAuditId,
        accessedByRole:         input.callerRole,
        accessedByUserId:       input.callerUserId,
        ...(input.escalationReason ? { escalationReason: input.escalationReason } : {}),
        correlationId:          input.correlationId,
      });
      logger.info(
        {
          correlationId: input.correlationId,
          sessionId: input.sessionId,
          callerRole: input.callerRole,
          artifactType,
          result,
        },
        'recording-access-service: notifyDoctorOfPatientReplay dispatched',
      );
      return;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { correlationId: input.correlationId, error: message },
      'recording-access-service: replay notification threw (ignored â€” non-fatal)',
    );
  }
}

// ============================================================================
// Internal: pipeline check stages (shared by mint + availability)
// ============================================================================

export interface PipelineCheckOutput {
  session:       SessionContext;
  policyId?:     string;
  selfServeWindowEndsAt?: Date;
}

/**
 * Stages 1â€“3: AuthZ â†’ support-escalation â†’ patient-window. These are
 * the cheap, no-Twilio stages â€” both `mintReplayUrl` and
 * `getReplayAvailability` run them.
 *
 * Throws `ValidationError` for support-escalation bad-input (never
 * audited). Throws `MintReplayError` for the policy denials. Returns
 * the loaded session + window timestamps on pass.
 *
 * Exported for Task 32 (`transcript-pdf-service`) which reuses the same
 * three checks with an additional session-ended gate layered on top.
 * Do NOT add artifact-kind-specific branching inside; that belongs in
 * the caller.
 */
export async function runReplayPolicyChecks(input: {
  sessionId:        string;
  requestingUserId: string;
  requestingRole:   ReplayCallerRole;
  escalationReason?: string;
}): Promise<PipelineCheckOutput> {
  // Stage 1 â€” AuthZ.
  const session = await loadSessionContext(input.sessionId);
  const isParticipant =
    (input.requestingRole === 'doctor' && input.requestingUserId === session.doctorId) ||
    (input.requestingRole === 'patient' &&
      session.patientId !== null &&
      input.requestingUserId === session.patientId) ||
    input.requestingRole === 'support_staff';
  if (!isParticipant) {
    throw new MintReplayError(
      'not_a_participant',
      'Caller is not a participant of this consultation',
    );
  }

  // Stage 2 â€” Support-staff escalation reason.
  if (input.requestingRole === 'support_staff') {
    const reason = (input.escalationReason ?? '').trim();
    if (reason.length < SUPPORT_ESCALATION_REASON_MIN) {
      throw new ValidationError(
        `Support-staff replay requires escalationReason â‰¥ ${SUPPORT_ESCALATION_REASON_MIN} chars`,
      );
    }
    if (reason.length > SUPPORT_ESCALATION_REASON_MAX) {
      throw new ValidationError(
        `Support-staff escalationReason must be â‰¤ ${SUPPORT_ESCALATION_REASON_MAX} chars`,
      );
    }
  }

  // Stage 3 â€” Patient window check. Doctors and support-staff bypass.
  let policyId: string | undefined;
  let selfServeWindowEndsAt: Date | undefined;
  if (input.requestingRole === 'patient') {
    if (!session.actualEndedAt) {
      // The consult never ended â€” there's nothing to replay yet. Treat
      // as not-ready rather than not-in-window.
      throw new MintReplayError(
        'artifact_not_ready',
        'Consultation has not ended; no recording available yet',
      );
    }
    const policy = await resolveRetentionPolicy({
      countryCode: session.doctorCountry,
      specialty:   session.doctorSpecialty,
      asOf:        session.actualEndedAt,
    });
    policyId = policy.policyId;
    const days = policy.patientSelfServeDays || DEFAULT_PATIENT_SELF_SERVE_DAYS;
    selfServeWindowEndsAt = new Date(
      session.actualEndedAt.getTime() + days * 24 * 60 * 60 * 1000,
    );
    if (Date.now() > selfServeWindowEndsAt.getTime()) {
      throw new MintReplayError(
        'beyond_self_serve_window',
        'Patient self-serve replay window has expired; contact support to request access',
      );
    }
  }

  return { session, policyId, selfServeWindowEndsAt };
}

// ============================================================================
// Public: mintReplayUrl
// ============================================================================

export async function mintReplayUrl(input: MintReplayInput): Promise<MintReplayResult> {
  const sessionId = input.sessionId?.trim();
  const requestingUserId = input.requestingUserId?.trim();
  const correlationId = input.correlationId?.trim() || 'unknown';
  const escalationReason = (input.escalationReason ?? '').trim() || undefined;

  if (!sessionId) {
    throw new ValidationError('sessionId is required');
  }
  if (!requestingUserId) {
    throw new ValidationError('requestingUserId is required');
  }
  if (input.artifactKind !== 'audio' && input.artifactKind !== 'video') {
    throw new ValidationError(
      `artifactKind '${input.artifactKind}' is not supported (expected 'audio' or 'video')`,
    );
  }
  const artifactKind: 'audio' | 'video' = input.artifactKind;

  // Stages 1â€“3 (cheap; no Twilio). Errors here are routed through the
  // shared denial-write helper EXCEPT ValidationError (bad input never
  // audits).
  let policyOutput: PipelineCheckOutput;
  try {
    policyOutput = await runReplayPolicyChecks({
      sessionId,
      requestingUserId,
      requestingRole: input.requestingRole,
      escalationReason,
    });
  } catch (err) {
    if (err instanceof MintReplayError) {
      await writeDenialAudit({
        sessionId,
        artifactRef: '',
        accessedBy: requestingUserId,
        accessedByRole: input.requestingRole,
        denyReason: err.code,
        escalationReason,
        correlationId,
        artifactKind,
      });
    }
    throw err;
  }

  const { policyId, selfServeWindowEndsAt } = policyOutput;

  // Stage 3.5 â€” video OTP gate (Plan 08 Task 44 Decision 10 LOCKED).
  //
  // Patients replaying video must either already be within a 30-day
  // skip window (row in `video_otp_window` dated within 30 days) OR
  // have just re-verified via SMS OTP (the controller calls
  // `verifyVideoReplayOtp` before this and the UPSERT into
  // `video_otp_window` lands inside that call).
  //
  // Doctors + support staff are NOT subject to the patient OTP: the
  // friction protects the patient's self-serve replay path specifically.
  //
  // We gate AFTER policy checks so non-participants still hit
  // `not_a_participant` first (no point prompting OTP for someone
  // who can't access the session at all), but BEFORE any Twilio
  // traffic so the UI can render the OTP modal without us having
  // paid the compositions lookup.
  if (artifactKind === 'video' && input.requestingRole === 'patient') {
    const patientIdForWindow = policyOutput.session.patientId ?? requestingUserId;
    const otpState = await isVideoOtpRequired({ patientId: patientIdForWindow });
    if (otpState.required) {
      logger.info(
        {
          correlationId,
          sessionId,
          patientId: patientIdForWindow,
          lastVerifiedAt: otpState.lastVerifiedAt?.toISOString() ?? null,
        },
        'recording-access-service: video replay blocked â€” SMS OTP required',
      );
      // Intentionally NOT auditing this branch. The OTP prompt is
      // a UX gate, not an access denial: until the patient either
      // verifies or aborts, no access decision has been made. A
      // successful OTP → subsequent mintReplayUrl call will write
      // the `access_type='full_video'` granted row; an abandoned
      // OTP flow doesn't need a "denied because we asked for OTP"
      // audit row cluttering the trail.
      throw new VideoOtpRequiredError(otpState.lastVerifiedAt);
    }
  }

  // Stages 4â€“5 â€” revocation + artifact readiness.
  const artifact =
    artifactKind === 'video'
      ? await resolveVideoArtifact(sessionId)
      : await resolveAudioArtifact(sessionId);
  if (!artifact) {
    const missingCode: MintReplayErrorCode =
      artifactKind === 'video' ? 'no_video_artifact' : 'artifact_not_found';
    await writeDenialAudit({
      sessionId,
      artifactRef: '',
      accessedBy: requestingUserId,
      accessedByRole: input.requestingRole,
      denyReason: missingCode,
      escalationReason,
      correlationId,
      artifactKind,
    });
    throw new MintReplayError(
      missingCode,
      artifactKind === 'video'
        ? 'No video recording exists for this consultation'
        : 'No audio recording exists for this consultation',
    );
  }

  const revoked = await isRevoked(sessionId, artifact.compositionSid);
  if (revoked) {
    await writeDenialAudit({
      sessionId,
      artifactRef: artifact.compositionSid,
      accessedBy: requestingUserId,
      accessedByRole: input.requestingRole,
      denyReason: 'revoked',
      escalationReason,
      correlationId,
      artifactKind,
    });
    throw new MintReplayError(
      'revoked',
      'This recording has been revoked and is no longer accessible',
    );
  }

  let metadata: Awaited<ReturnType<typeof fetchCompositionMetadata>>;
  try {
    metadata = await fetchCompositionMetadata(artifact.compositionSid);
  } catch (err) {
    if (err instanceof NotFoundError) {
      await writeDenialAudit({
        sessionId,
        artifactRef: artifact.compositionSid,
        accessedBy: requestingUserId,
        accessedByRole: input.requestingRole,
        denyReason: 'artifact_not_found',
        escalationReason,
        correlationId,
        artifactKind,
      });
      throw new MintReplayError(
        'artifact_not_found',
        `${artifactKind === 'video' ? 'Video' : 'Audio'} recording artifact not found at provider`,
      );
    }
    throw err;
  }
  if (metadata.status !== 'completed') {
    await writeDenialAudit({
      sessionId,
      artifactRef: artifact.compositionSid,
      accessedBy: requestingUserId,
      accessedByRole: input.requestingRole,
      denyReason: 'artifact_not_ready',
      escalationReason,
      correlationId,
      twilioStatus: metadata.status,
      artifactKind,
    });
    throw new MintReplayError(
      'artifact_not_ready',
      `Recording is still ${metadata.status}; please retry shortly`,
    );
  }

  // Stage 6 â€” write granted audit BEFORE the URL mint (so a process
  // crash mid-mint still leaves a footprint).
  const grantedMetadata: AuditMetadata = {
    outcome:       'granted',
    ttl_seconds:   SIGNED_URL_TTL_SEC,
    twilio_status: metadata.status,
    url_prefix:    metadata.mediaUrlPrefix,
  };
  if (escalationReason) {
    grantedMetadata.escalation_reason = escalationReason;
  }
  if (policyId) {
    grantedMetadata.policy_id = policyId;
  }
  if (selfServeWindowEndsAt) {
    grantedMetadata.self_serve_window_ends_at = selfServeWindowEndsAt.toISOString();
  }
  const recordingAccessAuditId = await writeAuditRow({
    session_id:       sessionId,
    artifact_ref:     artifact.compositionSid,
    artifact_kind:    artifactKind,
    access_type:      artifactKind === 'video' ? 'full_video' : 'audio_only',
    accessed_by:      requestingUserId,
    accessed_by_role: input.requestingRole,
    metadata:         grantedMetadata,
    correlation_id:   correlationId,
  });

  // Stage 7 â€” mint.
  const minted = await mintCompositionSignedUrl({
    compositionSid: artifact.compositionSid,
    ttlSec:         SIGNED_URL_TTL_SEC,
  });

  // Stage 8 â€” fire mutual notification (fire-and-forget; never throws).
  // The `void Promise.resolve().then(...)` wrapper ensures a hanging
  // helper (slow IG-DM API, slow dashboard insert) doesn't delay the
  // mint response â€” the helpers are observer-pattern writes on top of
  // an already-written audit row.
  void Promise.resolve().then(() =>
    notifyReplayWatcher({
      sessionId,
      callerRole:             input.requestingRole,
      callerUserId:           requestingUserId,
      artifactKind:           input.artifactKind,
      recordingAccessAuditId,
      ...(escalationReason ? { escalationReason } : {}),
      correlationId,
    }),
  );

  // Stage 9 â€” return.
  logger.info(
    {
      correlationId,
      sessionId,
      compositionSid:    artifact.compositionSid,
      requestingRole:    input.requestingRole,
      ttlSec:            SIGNED_URL_TTL_SEC,
      artifactSource:    artifact.source,
    },
    'recording-access-service: replay URL minted',
  );

  return {
    signedUrl:   minted.signedUrl,
    expiresAt:   minted.expiresAt,
    artifactRef: artifact.compositionSid,
  };
}

interface DenialAuditInput {
  sessionId:      string;
  artifactRef:    string;
  accessedBy:     string;
  accessedByRole: ReplayCallerRole;
  denyReason:     MintReplayErrorCode;
  escalationReason?: string;
  correlationId:  string;
  twilioStatus?:  string;
  /**
   * Artifact being denied. Defaults to `'audio'` to preserve the
   * existing caller contract; Plan 08 Task 44's video branch passes
   * `'video'` so denial rows line up with the granted-row's
   * `access_type='full_video'`.
   */
  artifactKind?:  'audio' | 'video';
}

async function writeDenialAudit(input: DenialAuditInput): Promise<void> {
  try {
    const meta: AuditMetadata = {
      outcome:     'denied',
      deny_reason: input.denyReason,
    };
    if (input.escalationReason) {
      meta.escalation_reason = input.escalationReason;
    }
    if (input.twilioStatus) {
      meta.twilio_status = input.twilioStatus;
    }
    const kind = input.artifactKind ?? 'audio';
    await writeAuditRow({
      session_id:       input.sessionId,
      artifact_ref:     input.artifactRef,
      artifact_kind:    kind,
      access_type:      kind === 'video' ? 'full_video' : 'audio_only',
      accessed_by:      input.accessedBy,
      accessed_by_role: input.accessedByRole,
      metadata:         meta,
      correlation_id:   input.correlationId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      {
        correlationId: input.correlationId,
        sessionId:     input.sessionId,
        denyReason:    input.denyReason,
        error:         message,
      },
      'recording-access-service: denial audit write FAILED â€” original denial still propagates',
    );
    // Swallow â€” the original denial is the meaningful signal to the
    // caller. Losing the audit row is bad but not as bad as masking
    // the denial behind a cascade-write failure.
  }
}

// ============================================================================
// Public: getReplayAvailability (no audit; preflight for UI)
// ============================================================================

export async function getReplayAvailability(
  input: ReplayAvailabilityInput,
): Promise<ReplayAvailability> {
  const sessionId = input.sessionId?.trim();
  const requestingUserId = input.requestingUserId?.trim();
  if (!sessionId) {
    throw new ValidationError('sessionId is required');
  }
  if (!requestingUserId) {
    throw new ValidationError('requestingUserId is required');
  }

  let policyOutput: PipelineCheckOutput;
  try {
    policyOutput = await runReplayPolicyChecks({
      sessionId,
      requestingUserId,
      requestingRole: input.requestingRole,
      // Availability never validates support-escalation reason â€” the
      // UI calls this to decide whether to show the player; the actual
      // mint will validate. Pass a placeholder so support-staff
      // availability doesn't 400 on the preflight.
      escalationReason: input.requestingRole === 'support_staff' ? 'preflight' : undefined,
    });
  } catch (err) {
    if (err instanceof MintReplayError) {
      return { available: false, reason: err.code };
    }
    throw err;
  }

  const artifact = await resolveAudioArtifact(sessionId);
  if (!artifact) {
    return { available: false, reason: 'artifact_not_found' };
  }

  const revoked = await isRevoked(sessionId, artifact.compositionSid);
  if (revoked) {
    return { available: false, reason: 'revoked' };
  }

  let metadata: Awaited<ReturnType<typeof fetchCompositionMetadata>>;
  try {
    metadata = await fetchCompositionMetadata(artifact.compositionSid);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return { available: false, reason: 'artifact_not_found' };
    }
    throw err;
  }
  if (metadata.status !== 'completed') {
    return { available: false, reason: 'artifact_not_ready' };
  }

  const result: ReplayAvailability = { available: true };
  if (input.requestingRole === 'patient' && policyOutput.selfServeWindowEndsAt) {
    result.selfServeExpiresAt = policyOutput.selfServeWindowEndsAt;
  }

  // Plan 08 · Task 44: surface `hasVideo` so the player can conditionally
  // render the "Show video" toggle. Best-effort; failure here never
  // degrades the audio-available signal (we just omit the flag and the
  // toggle doesn't render, same as a session that genuinely has no
  // video composition). The lookup lives here rather than in the audit-
  // writing mint path because `getReplayAvailability` is the mount-
  // time preflight and the toggle state is derived at first render.
  try {
    const { videoCompositions } = await getRecordingArtifactsForSession({ sessionId });
    result.hasVideo = videoCompositions.some((c) => c.status === 'completed');
  } catch (err) {
    logger.warn(
      { sessionId, error: err instanceof Error ? err.message : String(err) },
      'recording-access-service: video compositions lookup failed in availability preflight (treating as no video)',
    );
    result.hasVideo = false;
  }

  return result;
}

