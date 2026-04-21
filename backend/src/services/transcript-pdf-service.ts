/**
 * Transcript PDF service (Plan 07 · Task 32 · Decision 4 LOCKED + Decision
 * 10 LOCKED retention semantics).
 *
 * Generates, caches, and delivers a consultation transcript PDF —
 * audited the same way as Task 29's audio replay path, fanning out
 * mutual notifications via Task 30's helpers.
 *
 * **Pipeline** (order is security-critical; mirror of `mintReplayUrl`
 * with a session-ended gate layered on top):
 *
 *   0. Validate input.
 *   1. AuthZ + support-escalation + patient-self-serve-window
 *      (reuses `runReplayPolicyChecks` from recording-access-service —
 *      same three doors as the audio replay path).
 *   2. Session-ended gate (ALL roles). Audio replay allowed doctors to
 *      access unended sessions for playback; transcript export does
 *      NOT — a live or scheduled consult has no meaningful transcript
 *      to ship, and rendering one would leak an incomplete chat log
 *      as if it were the finished artifact. Denial code
 *      `session_not_ended`.
 *   3. Revocation check (reuses `isSessionOrCompositionRevoked`). We
 *      pass an empty `compositionSid` because a transcript isn't tied
 *      to a Twilio composition by URL — only the session-scoped
 *      prefix shapes in the blocklist apply.
 *   4. Cache check — Supabase Storage `consultation-transcripts/{sid}/transcript.pdf`.
 *      Hit when file exists AND `file.updated_at >= actual_ended_at`
 *      (a re-end of a session flips `actual_ended_at` forward, which
 *      is what invalidates the cache). See Decision 4 note #14 in the
 *      task doc.
 *   5. Compose on cache miss. Loads messages + transcripts + session
 *      context, streams via pdfkit through a PassThrough, uploads to
 *      the bucket using the service-role client, then mints.
 *   6. Mint a 15-min signed URL.
 *   7. Write granted audit row (artifact_kind='transcript').
 *   8. Fire mutual notification (fire-and-forget; errors logged, not
 *      thrown).
 *   9. Return `{ signedUrl, expiresAt, cacheHit }`.
 *
 * **Denials audit the same row shape as Task 29 denials** — the only
 * diff is `artifact_kind='transcript'`. Deny codes:
 *   - `not_a_participant`          (from runReplayPolicyChecks)
 *   - `session_not_ended`          (this service)
 *   - `beyond_self_serve_window`   (from runReplayPolicyChecks)
 *   - `revoked`                    (this service)
 *
 * Bad input (missing sessionId / unknown role / missing escalation
 * reason for support_staff) surfaces as `ValidationError` and is NOT
 * audited — per the recording-access doctrine that "bad input never
 * audits".
 *
 * **No Twilio calls.** Unlike the audio path, we don't depend on
 * provider readiness for the transcript. If the voice-transcription
 * worker hasn't finished (Plan 05 Task 25 is still `processing`), we
 * still render the chat portion of the PDF and display a
 * "Transcript not yet available" banner in the composer. Users can
 * re-download once the worker finishes.
 *
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-32-transcript-pdf-export.md
 * @see backend/src/services/transcript-pdf-composer.ts
 * @see backend/src/services/recording-access-service.ts (shared policy)
 */

import { PassThrough } from 'stream';

import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import { InternalError, ValidationError } from '../utils/errors';
import { getDoctorSettings } from './doctor-settings-service';
import {
  notifyDoctorOfPatientReplay,
  notifyPatientOfDoctorReplay,
} from './notification-service';
import {
  MintReplayError,
  runReplayPolicyChecks,
  isSessionOrCompositionRevoked,
  type ReplayCallerRole,
  type SessionContext,
} from './recording-access-service';
import {
  composeTranscriptPdfStream,
  type ChatMessageRow,
  type ComposeTranscriptContext,
  type VoiceTranscriptSegment,
} from './transcript-pdf-composer';

// ============================================================================
// Public types
// ============================================================================

export type TranscriptExportErrorCode =
  | 'not_a_participant'
  | 'session_not_ended'
  | 'beyond_self_serve_window'
  | 'revoked';

export class TranscriptExportError extends Error {
  constructor(
    public readonly code: TranscriptExportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TranscriptExportError';
  }
}

export interface RenderTranscriptInput {
  sessionId:         string;
  requestingUserId:  string;
  requestingRole:    ReplayCallerRole;
  /** Required when role='support_staff'; ≥10 chars. */
  escalationReason?: string;
  correlationId:     string;
}

export interface RenderTranscriptResult {
  signedUrl:  string;
  expiresAt:  Date;
  /** True when we served from the Storage cache (no fresh render). */
  cacheHit:   boolean;
  /** Convenience for callers that surface "download as …". */
  filename:   string;
}

// ============================================================================
// Constants
// ============================================================================

const BUCKET = 'consultation-transcripts';
const SIGNED_URL_TTL_SEC = 15 * 60;
const CONTENT_TYPE = 'application/pdf';

// ============================================================================
// Public: renderConsultTranscriptPdf
// ============================================================================

export async function renderConsultTranscriptPdf(
  input: RenderTranscriptInput,
): Promise<RenderTranscriptResult> {
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

  // Stages 1a/1b — AuthZ + support-escalation + patient self-serve
  // window. Bubbled MintReplayError is mapped to the transcript error
  // codes below. We catch-and-rethrow with an audit write on the codes
  // that map; `artifact_not_ready` from the audio path maps to
  // `session_not_ended` here (different wording, same root cause).
  let policy;
  try {
    policy = await runReplayPolicyChecks({
      sessionId,
      requestingUserId,
      requestingRole: input.requestingRole,
      escalationReason,
    });
  } catch (err) {
    if (err instanceof MintReplayError) {
      const mapped = mapReplayErrorToTranscriptError(err);
      await writeTranscriptDenialAudit({
        sessionId,
        accessedBy: requestingUserId,
        accessedByRole: input.requestingRole,
        denyReason: mapped.code,
        escalationReason,
        correlationId,
      });
      throw mapped;
    }
    throw err;
  }

  const session = policy.session;

  // Stage 2 — session-ended gate (ALL roles).
  if (!session.actualEndedAt) {
    await writeTranscriptDenialAudit({
      sessionId,
      accessedBy: requestingUserId,
      accessedByRole: input.requestingRole,
      denyReason: 'session_not_ended',
      escalationReason,
      correlationId,
    });
    throw new TranscriptExportError(
      'session_not_ended',
      'Consultation has not ended; a transcript is only available once the session is closed.',
    );
  }

  // Stage 3 — revocation.
  const revoked = await isSessionOrCompositionRevoked(sessionId, '');
  if (revoked) {
    await writeTranscriptDenialAudit({
      sessionId,
      accessedBy: requestingUserId,
      accessedByRole: input.requestingRole,
      denyReason: 'revoked',
      escalationReason,
      correlationId,
    });
    throw new TranscriptExportError(
      'revoked',
      'Transcript access for this consultation has been revoked.',
    );
  }

  const objectPath = `${sessionId}/transcript.pdf`;

  // Stage 4 — cache check.
  const cache = await lookupCachedPdf(objectPath, session.actualEndedAt, correlationId);
  let cacheHit = false;
  if (cache.valid) {
    cacheHit = true;
  } else {
    // Stage 5 — compose.
    await composeAndUploadPdf({
      sessionId,
      session,
      objectPath,
      correlationId,
    });
  }

  // Stage 6 — mint signed URL.
  const minted = await mintTranscriptSignedUrl(objectPath, correlationId);

  // Stage 7 — granted audit.
  const auditId = await writeTranscriptGrantedAudit({
    sessionId,
    artifactRef: objectPath,
    accessedBy:  requestingUserId,
    accessedByRole: input.requestingRole,
    escalationReason,
    policyId:   policy.policyId,
    selfServeWindowEndsAt: policy.selfServeWindowEndsAt,
    cacheHit,
    correlationId,
  });

  // Stage 8 — fire notification (fire-and-forget; never throws).
  //
  // The actionKind='downloaded' is the Task 30 extension that routes the
  // transcript download DM to `buildTranscriptDownloadedNotificationDm`
  // rather than the audio-replay DM. Calling it synchronously-with-void-
  // wrapper (same pattern as recording-access-service) keeps upload
  // latency off the critical path.
  void Promise.resolve().then(() =>
    fireTranscriptNotification({
      sessionId,
      callerRole:             input.requestingRole,
      callerUserId:           requestingUserId,
      recordingAccessAuditId: auditId,
      escalationReason,
      correlationId,
    }),
  );

  logger.info(
    {
      correlationId,
      sessionId,
      requestingRole: input.requestingRole,
      cacheHit,
    },
    'transcript-pdf-service: transcript URL minted',
  );

  return {
    signedUrl:  minted.signedUrl,
    expiresAt:  minted.expiresAt,
    cacheHit,
    filename:   `transcript-${shortId(sessionId)}.pdf`,
  };
}

// ============================================================================
// Internals — policy error mapping
// ============================================================================

function mapReplayErrorToTranscriptError(
  err: MintReplayError,
): TranscriptExportError {
  switch (err.code) {
    case 'not_a_participant':
      return new TranscriptExportError(
        'not_a_participant',
        'Caller is not a participant of this consultation.',
      );
    case 'beyond_self_serve_window':
      return new TranscriptExportError(
        'beyond_self_serve_window',
        'Patient self-serve transcript window has expired; contact support.',
      );
    case 'artifact_not_ready':
      // Audio-path "consult not ended yet" message; for transcripts
      // the semantics match our `session_not_ended` code.
      return new TranscriptExportError(
        'session_not_ended',
        'Consultation has not ended; a transcript is only available once the session is closed.',
      );
    case 'revoked':
      return new TranscriptExportError('revoked', err.message);
    case 'artifact_not_found':
      // Not a valid shape for the policy pipeline (the audio path only
      // throws this post-policy). Treat defensively as "not ended".
      return new TranscriptExportError(
        'session_not_ended',
        'Transcript artifact unavailable.',
      );
    case 'no_video_artifact':
      // Plan 08 Task 44 added this code for the mintReplayUrl video
      // branch. Transcript export never runs the video branch, so if
      // we ever see it here it's a policy-layer bug — map defensively
      // to `session_not_ended` so the caller still gets a recognised
      // TranscriptExportError shape (vs an unexhausted switch that
      // returns undefined and crashes the handler).
      return new TranscriptExportError(
        'session_not_ended',
        'Transcript artifact unavailable.',
      );
  }
}

// ============================================================================
// Internals — cache lookup
// ============================================================================

async function lookupCachedPdf(
  objectPath: string,
  sessionEndedAt: Date,
  correlationId: string,
): Promise<{ valid: boolean }> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError(
      'transcript-pdf-service: Supabase admin client unavailable',
    );
  }

  // `storage.list` returns an array of { name, updated_at, ... } for a
  // given prefix. We list by the sessionId "folder" and look for the
  // known filename.
  //
  // We use `list` rather than `download`+metadata because a cache-miss
  // is the common case for first-view; `list` is a cheap metadata-only
  // call.
  const parts = objectPath.split('/');
  const dir = parts.slice(0, -1).join('/');
  const filename = parts[parts.length - 1];

  try {
    const { data, error } = await admin.storage
      .from(BUCKET)
      .list(dir, { limit: 10 });
    if (error) {
      logger.warn(
        { correlationId, objectPath, error: error.message },
        'transcript-pdf-service: cache list failed — treating as miss',
      );
      return { valid: false };
    }
    const match = (data ?? []).find((f) => f.name === filename);
    if (!match) return { valid: false };
    const updatedAtIso =
      (match as unknown as { updated_at?: string | null }).updated_at ?? null;
    if (!updatedAtIso) {
      // Some drivers don't fill `updated_at` — be conservative and
      // rebuild rather than serve stale.
      return { valid: false };
    }
    const updatedAt = new Date(updatedAtIso);
    if (Number.isNaN(updatedAt.getTime())) return { valid: false };
    // Cache valid iff file was uploaded AFTER the session's latest
    // actual_ended_at. Re-ending a session flips that forward, which
    // is how we invalidate (no explicit bust).
    return { valid: updatedAt.getTime() >= sessionEndedAt.getTime() };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(
      { correlationId, objectPath, error: message },
      'transcript-pdf-service: cache lookup threw — treating as miss',
    );
    return { valid: false };
  }
}

// ============================================================================
// Internals — compose + upload
// ============================================================================

interface ComposeAndUploadInput {
  sessionId:     string;
  session:       SessionContext;
  objectPath:    string;
  correlationId: string;
}

async function composeAndUploadPdf(input: ComposeAndUploadInput): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError(
      'transcript-pdf-service: Supabase admin client unavailable',
    );
  }

  const [messages, voiceSegments, composeCtx] = await Promise.all([
    loadChatMessages(input.sessionId),
    loadVoiceTranscriptSegments(input.sessionId),
    loadComposeContext(input.session),
  ]);

  // Detect "voice transcription pending" so the composer can render
  // the warning banner when the modality was audio/video but no
  // segments exist yet (Plan 05 Task 25 worker still running).
  const pendingVoiceXcript =
    composeCtx.modality !== 'text' && voiceSegments.length === 0;

  const pdfStream = new PassThrough();

  // Drain the stream into a buffer. We upload a full buffer (rather
  // than streaming-upload to Storage) because supabase-js v2 does not
  // expose a streaming upload in Node — the `upload` method wants a
  // `File | Blob | ArrayBuffer | Buffer`. Transcripts are small
  // (<~500KB typical), so buffering in memory is fine; see the
  // composer's header note on size expectations.
  const uploadBufferPromise: Promise<Buffer> = new Promise(
    (resolve, reject) => {
      const chunks: Buffer[] = [];
      pdfStream.on('data', (c) =>
        chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)),
      );
      pdfStream.on('end',   () => resolve(Buffer.concat(chunks)));
      pdfStream.on('error', reject);
    },
  );

  await composeTranscriptPdfStream({
    context: {
      ...composeCtx,
      voiceTranscriptionPending: pendingVoiceXcript,
    },
    messages,
    voiceSegments,
    output: pdfStream,
  });

  const pdfBuffer = await uploadBufferPromise;

  const { error: uploadErr } = await admin.storage
    .from(BUCKET)
    .upload(input.objectPath, pdfBuffer, {
      contentType: CONTENT_TYPE,
      upsert:      true,
    });
  if (uploadErr) {
    throw new InternalError(
      `transcript-pdf-service: Storage upload failed (${uploadErr.message})`,
    );
  }

  logger.info(
    {
      correlationId: input.correlationId,
      sessionId:     input.sessionId,
      pdfBytes:      pdfBuffer.length,
      modality:      composeCtx.modality,
      voiceSegments: voiceSegments.length,
      chatMessages:  messages.length,
      voicePending:  pendingVoiceXcript,
    },
    'transcript-pdf-service: PDF composed + uploaded',
  );
}

// ============================================================================
// Internals — data loaders
// ============================================================================

async function loadChatMessages(sessionId: string): Promise<ChatMessageRow[]> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError(
      'transcript-pdf-service: Supabase admin client unavailable',
    );
  }
  const { data, error } = await admin
    .from('consultation_messages')
    .select(
      'kind, sender_role, body, attachment_url, attachment_mime_type, system_event, created_at',
    )
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new InternalError(
      `transcript-pdf-service: messages query failed (${error.message})`,
    );
  }

  const rows = (data ?? []) as Array<{
    kind:                 string;
    sender_role:          string;
    body:                 string | null;
    attachment_url:       string | null;
    attachment_mime_type: string | null;
    system_event:         string | null;
    created_at:           string;
  }>;

  return rows.map((r): ChatMessageRow => {
    if (r.kind === 'attachment') {
      return {
        kind:           'attachment',
        createdAtIso:   r.created_at,
        senderRole:     normalizeSenderRole(r.sender_role),
        body:           r.body,
        attachmentUrl:  r.attachment_url ?? '',
        attachmentMime: r.attachment_mime_type ?? 'application/octet-stream',
      };
    }
    if (r.kind === 'system') {
      return {
        kind:         'system',
        createdAtIso: r.created_at,
        senderRole:   'system',
        body:         r.body ?? (r.system_event ?? ''),
        ...(r.system_event ? { systemEvent: r.system_event } : {}),
      };
    }
    // default 'text'
    return {
      kind:         'text',
      createdAtIso: r.created_at,
      senderRole:   normalizeSenderRole(r.sender_role),
      body:         r.body ?? '',
    };
  });
}

function normalizeSenderRole(role: string): 'doctor' | 'patient' | 'system' {
  if (role === 'doctor' || role === 'patient' || role === 'system') return role;
  // Defensive default. Chat rows with unknown roles shouldn't happen
  // (CHECK constraint at the DB level) — fallback to 'patient' makes
  // the attribution lossless for rendering without crashing.
  return 'patient';
}

async function loadVoiceTranscriptSegments(
  sessionId: string,
): Promise<VoiceTranscriptSegment[]> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError(
      'transcript-pdf-service: Supabase admin client unavailable',
    );
  }
  const { data, error } = await admin
    .from('consultation_transcripts')
    .select('provider, transcript_json, transcript_text, status, created_at')
    .eq('consultation_session_id', sessionId)
    .neq('status', 'failed')
    .order('created_at', { ascending: true });

  if (error) {
    logger.warn(
      { sessionId, error: error.message },
      'transcript-pdf-service: transcripts query failed (non-fatal; rendering chat only)',
    );
    return [];
  }

  const rows = (data ?? []) as Array<{
    provider:         string;
    transcript_json:  Record<string, unknown> | null;
    transcript_text:  string | null;
    status:           string;
    created_at:       string;
  }>;

  const segments: VoiceTranscriptSegment[] = [];

  for (const row of rows) {
    // Skip rows that haven't finished — we treat 'queued' / 'processing'
    // as "not yet available" rather than rendering partial output.
    if (row.status !== 'completed') continue;

    const baseTimestamp = new Date(row.created_at);
    if (Number.isNaN(baseTimestamp.getTime())) continue;

    if (row.provider === 'openai_whisper') {
      // Whisper `verbose_json`: segments array with start/end in seconds.
      const json = row.transcript_json as {
        segments?: Array<{ text?: string; start?: number }>;
      } | null;
      const whisperSegments = Array.isArray(json?.segments) ? json!.segments : [];
      for (const seg of whisperSegments) {
        const startSec = typeof seg.start === 'number' ? seg.start : 0;
        const text = (seg.text ?? '').trim();
        if (!text) continue;
        segments.push({
          timestampIso: new Date(baseTimestamp.getTime() + startSec * 1000).toISOString(),
          // Diarization is not enabled in v1; we use a neutral label.
          // Task 32 note #4: a follow-up PR can thread
          // diarization-aware labels when Whisper adds speaker IDs.
          speakerLabel: 'Speaker',
          text,
        });
      }
    } else {
      // Deepgram (or any flat-transcript provider). One big segment
      // timestamped at the row's creation instant. A future PR can
      // slice this by word-level timestamps when Deepgram's
      // `utterances` field is wired in.
      const text = (row.transcript_text ?? '').trim();
      if (!text) continue;
      segments.push({
        timestampIso: baseTimestamp.toISOString(),
        speakerLabel: 'Speaker',
        text,
      });
    }
  }

  return segments;
}

async function loadComposeContext(
  session: SessionContext,
): Promise<ComposeTranscriptContext> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError(
      'transcript-pdf-service: Supabase admin client unavailable',
    );
  }

  // Modality lives on consultation_sessions; SessionContext doesn't
  // carry it. Fetch it directly (cheap).
  const { data: sessionRow } = await admin
    .from('consultation_sessions')
    .select('modality')
    .eq('id', session.id)
    .maybeSingle();
  const modality = (sessionRow as { modality?: string } | null)?.modality ?? 'text';

  let patientDisplayName = '';
  if (session.patientId) {
    const { data: patient } = await admin
      .from('patients')
      .select('name')
      .eq('id', session.patientId)
      .maybeSingle();
    patientDisplayName = ((patient as { name: string | null } | null)?.name ?? '').trim();
  }

  const ds = await getDoctorSettings(session.doctorId);
  const practiceName = ds?.practice_name?.trim() || '';
  const specialty    = ds?.specialty?.trim() || '';
  const timezone     = ds?.timezone?.trim() || 'Asia/Kolkata';

  // v1 uses `practice_name` as the doctor display — see header note
  // "No doctor.name column" in the service. A future PR can thread a
  // proper auth.users.raw_user_meta_data lookup.
  const doctorDisplayName = practiceName || 'Doctor';

  if (!session.actualEndedAt) {
    // We've already gated on this at the service boundary; narrow-by-
    // throw is a belt-and-braces assertion that the composer's strict
    // type contract is satisfied.
    throw new InternalError(
      'transcript-pdf-service: actualEndedAt missing during compose — should have been gated upstream',
    );
  }

  return {
    sessionId:           session.id,
    doctorDisplayName,
    ...(specialty ? { doctorSpecialty: specialty } : {}),
    ...(practiceName ? { practiceName } : {}),
    doctorTimezone:      timezone,
    patientDisplayName,
    consultEndedAtIso:   session.actualEndedAt.toISOString(),
    modality,
    voiceTranscriptionPending: false, // Overwritten at compose time.
  };
}

// ============================================================================
// Internals — signed URL mint
// ============================================================================

async function mintTranscriptSignedUrl(
  objectPath: string,
  correlationId: string,
): Promise<{ signedUrl: string; expiresAt: Date }> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError(
      'transcript-pdf-service: Supabase admin client unavailable',
    );
  }

  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(objectPath, SIGNED_URL_TTL_SEC, {
      download: `transcript-${shortId(objectPath.split('/')[0] ?? '')}.pdf`,
    });
  if (error || !data?.signedUrl) {
    throw new InternalError(
      `transcript-pdf-service: sign URL failed (${error?.message ?? 'no URL returned'})`,
    );
  }

  const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_SEC * 1000);
  logger.debug(
    { correlationId, objectPath, ttlSec: SIGNED_URL_TTL_SEC },
    'transcript-pdf-service: signed URL minted',
  );
  return { signedUrl: data.signedUrl, expiresAt };
}

// ============================================================================
// Internals — audit rows
// ============================================================================

interface GrantedAuditInput {
  sessionId:      string;
  artifactRef:    string;
  accessedBy:     string;
  accessedByRole: ReplayCallerRole;
  escalationReason?: string;
  policyId?:      string;
  selfServeWindowEndsAt?: Date;
  cacheHit:       boolean;
  correlationId:  string;
}

async function writeTranscriptGrantedAudit(
  input: GrantedAuditInput,
): Promise<string> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError(
      'transcript-pdf-service: Supabase admin client unavailable — cannot write audit',
    );
  }
  const metadata: Record<string, unknown> = {
    outcome:      'granted',
    ttl_seconds:  SIGNED_URL_TTL_SEC,
    cache_hit:    input.cacheHit,
    url_prefix:   `${BUCKET}/${input.artifactRef}`,
  };
  if (input.escalationReason) metadata.escalation_reason = input.escalationReason;
  if (input.policyId)         metadata.policy_id         = input.policyId;
  if (input.selfServeWindowEndsAt) {
    metadata.self_serve_window_ends_at = input.selfServeWindowEndsAt.toISOString();
  }

  const { data, error } = await admin
    .from('recording_access_audit')
    .insert({
      session_id:       input.sessionId,
      artifact_ref:     input.artifactRef,
      artifact_kind:    'transcript',
      accessed_by:      input.accessedBy,
      accessed_by_role: input.accessedByRole,
      metadata,
      correlation_id:   input.correlationId,
    } as unknown as Record<string, unknown>)
    .select('id')
    .single();
  if (error || !data) {
    throw new InternalError(
      `transcript-pdf-service: audit insert failed (${error?.message ?? 'no row returned'})`,
    );
  }
  return (data as { id: string }).id;
}

interface DenialAuditInput {
  sessionId:       string;
  accessedBy:      string;
  accessedByRole:  ReplayCallerRole;
  denyReason:      TranscriptExportErrorCode;
  escalationReason?: string;
  correlationId:   string;
}

async function writeTranscriptDenialAudit(
  input: DenialAuditInput,
): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    // Audit loss is bad, but masking the denial behind a cascading
    // failure is worse. Log loudly and bail — the caller still throws
    // the meaningful denial.
    logger.error(
      { correlationId: input.correlationId, sessionId: input.sessionId, denyReason: input.denyReason },
      'transcript-pdf-service: cannot write denial audit (no admin client)',
    );
    return;
  }
  try {
    const metadata: Record<string, unknown> = {
      outcome:     'denied',
      deny_reason: input.denyReason,
    };
    if (input.escalationReason) metadata.escalation_reason = input.escalationReason;

    const { error } = await admin
      .from('recording_access_audit')
      .insert({
        session_id:       input.sessionId,
        artifact_ref:     '',
        artifact_kind:    'transcript',
        accessed_by:      input.accessedBy,
        accessed_by_role: input.accessedByRole,
        metadata,
        correlation_id:   input.correlationId,
      } as unknown as Record<string, unknown>);
    if (error) {
      logger.error(
        {
          correlationId: input.correlationId,
          sessionId:     input.sessionId,
          denyReason:    input.denyReason,
          error:         error.message,
        },
        'transcript-pdf-service: denial audit write FAILED — denial still propagates',
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { correlationId: input.correlationId, sessionId: input.sessionId, error: message },
      'transcript-pdf-service: denial audit threw (ignored)',
    );
  }
}

// ============================================================================
// Internals — mutual notification fan-out (Task 30)
// ============================================================================

interface TranscriptNotificationInput {
  sessionId:              string;
  callerRole:             ReplayCallerRole;
  callerUserId:           string;
  recordingAccessAuditId: string;
  escalationReason?:      string;
  correlationId:          string;
}

/**
 * Route the notification based on caller role, mirroring
 * `recording-access-service.notifyReplayWatcher`:
 *
 *   - `doctor`        → notify the patient (IG-DM / SMS) using the
 *                       transcript-downloaded DM copy (Task 32 helper).
 *   - `patient`       → notify the doctor (dashboard event).
 *   - `support_staff` → notify the doctor (dashboard event).
 *
 * Patient is NOT notified for support_staff downloads (same Decision 4
 * doctrine as the audio path: support escalations are internal tooling,
 * surfacing them in patient inbox dilutes the trust model).
 *
 * Errors logged, never thrown — the audit row is written; a slow
 * Twilio / IG API must not delay the download response.
 */
async function fireTranscriptNotification(
  input: TranscriptNotificationInput,
): Promise<void> {
  try {
    if (input.callerRole === 'doctor') {
      const result = await notifyPatientOfDoctorReplay({
        sessionId:              input.sessionId,
        artifactType:           'transcript',
        actionKind:             'downloaded',
        recordingAccessAuditId: input.recordingAccessAuditId,
        correlationId:          input.correlationId,
      });
      logger.info(
        {
          correlationId: input.correlationId,
          sessionId: input.sessionId,
          callerRole: input.callerRole,
          result: 'skipped' in result
            ? { skipped: true, reason: result.reason }
            : { anySent: result.anySent },
        },
        'transcript-pdf-service: patient DM fan-out dispatched',
      );
      return;
    }
    if (input.callerRole === 'patient' || input.callerRole === 'support_staff') {
      const result = await notifyDoctorOfPatientReplay({
        sessionId:              input.sessionId,
        artifactType:           'transcript',
        actionKind:             'downloaded',
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
          result,
        },
        'transcript-pdf-service: doctor dashboard-event fan-out dispatched',
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { correlationId: input.correlationId, sessionId: input.sessionId, error: message },
      'transcript-pdf-service: notification threw (ignored — non-fatal)',
    );
  }
}

// ============================================================================
// Helpers
// ============================================================================

function shortId(s: string): string {
  const trimmed = (s ?? '').trim();
  return trimmed.length <= 8 ? trimmed : trimmed.slice(0, 8);
}
