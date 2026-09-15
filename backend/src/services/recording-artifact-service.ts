/**
 * Recording-artifact-service — the `recording_artifact_index` writer
 * (recording-governance-v2 · rec-02 · REC-D19 / REC1-D1 / REC1-D2).
 *
 * Migration 056 created the registry in April 2026. Nothing in
 * `backend/src/` has ever INSERTed into it. This module is the single
 * writer: webhook (rec-01) and backfill (rec-05) both call
 * `registerFinalisedComposition`. Replay reads the rows via
 * `resolveAudioArtifact` Path A (`recording-access-service.ts`).
 *
 * ## `storage_uri` convention (REC1-D1 — locked here)
 *
 *   twilio-composition:<CompositionSid>
 *   twilio-recording:<RecordingSid>
 *
 *   e.g. `twilio-composition:CJaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`
 *        `twilio-recording:RTaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`
 *
 * The recording form arrives with cost-cut step 7, which stops paying
 * Twilio to compose every consult. Compositions and Recordings are
 * independent resources at Twilio — deleting one never removes the
 * other — so each gets its own prefix, writer, and DELETE route.
 *
 * Deterministic per SID (same SID → byte-identical URI), which is what
 * makes the existing `UNIQUE (session_id, artifact_kind, storage_uri)`
 * constraint (056 L89) the idempotency mechanism (REC1-D2).
 *
 * `extractCompositionSid` (`recording-access-service.ts:378-385`)
 * recovers the SID via its `/(CJ[a-zA-Z0-9]{10,})/` regex without
 * modification.
 *
 * ## Why this shape, not a Twilio Media URL or a `<bucket>/<path>`
 *
 * `parseStorageUri` (`storage-service.ts:46-74`) requires a slash and
 * would accept `https://video.twilio.com/v1/Compositions/<sid>/Media`
 * as bucket=`https:` / path=`/video.twilio.com/…`. If
 * `ARCHIVAL_HARD_DELETE_ENABLED` were ever flipped, `deleteObject`
 * would then treat a Supabase "not found" on that fake bucket as
 * success and the archival worker would stamp `hard_deleted_at` +
 * write `archival_history` for media that still lives on Twilio — a
 * deletion record that is a lie (REC1-D7 / REC-D22).
 *
 * A slash-free URI makes `parseStorageUri` throw `ValidationError`.
 * The worker's per-row `catch` logs and continues *without* stamping,
 * so the index stays honest until p5 teaches the worker to call
 * Twilio's Composition DELETE.
 *
 * Distinguishable from the real Supabase convention
 * `recordings/patient_<uuid>/…` by the `twilio-composition:` prefix
 * and the absence of a slash.
 *
 * @see backend/migrations/056_recording_artifact_index.sql
 * @see docs/Work/Daily-plans/August 2026/17-08-2026/recording-governance-v2/p1-artifact-registry/Tasks/task-rec-02-artifact-registry-writer.md
 */

import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import { InternalError, NotFoundError, ValidationError } from '../utils/errors';
import { findSessionById } from './consultation-session-service';
import { fetchCompositionMetadata } from './twilio-compositions';
import { fetchRecordingMetadata } from './twilio-recordings';

// ============================================================================
// Public types
// ============================================================================

export const REGISTERABLE_ARTIFACT_KINDS = [
  'audio_composition',
  'video_composition',
] as const;

export type RegisterableArtifactKind = (typeof REGISTERABLE_ARTIFACT_KINDS)[number];

/**
 * Raw per-track kinds (cost-cut step 7). Deliberately a separate set
 * from the composition kinds so `registerFinalisedComposition` keeps
 * rejecting a track kind and vice versa — the two writers reach
 * different Twilio DELETE endpoints and must not be interchangeable.
 */
export const REGISTERABLE_TRACK_ARTIFACT_KINDS = [
  'audio_track',
  'video_track',
] as const;

export type RegisterableTrackArtifactKind =
  (typeof REGISTERABLE_TRACK_ARTIFACT_KINDS)[number];

export const TWILIO_COMPOSITION_STORAGE_URI_PREFIX = 'twilio-composition:';
export const TWILIO_RECORDING_STORAGE_URI_PREFIX = 'twilio-recording:';

const COMPOSITION_SID_RE = /^CJ[a-zA-Z0-9]{10,}$/;
const RECORDING_SID_RE = /^RT[a-zA-Z0-9]{10,}$/;

export interface RegisterFinalisedCompositionInput {
  sessionId:      string;
  compositionSid: string;
  artifactKind:   string;
  correlationId:  string;
}

export interface RegisterFinalisedCompositionResult {
  /** `true` when this call inserted the row; `false` on UNIQUE collapse. */
  created:     boolean;
  artifactId:  string;
  storageUri:  string;
  bytes:       number | null;
}

export interface RegisterFinalisedRecordingInput {
  sessionId:     string;
  recordingSid:  string;
  correlationId: string;
}

export interface RegisterFinalisedRecordingResult {
  created:      boolean;
  artifactId:   string;
  storageUri:   string;
  bytes:        number | null;
  artifactKind: RegisterableTrackArtifactKind;
}

// ============================================================================
// Convention helper (exported so rec-01 / rec-05 / tests share one builder)
// ============================================================================

/**
 * Build the locked REC1-D1 `storage_uri` for a Twilio Composition.
 * Pure. The same SID always yields a byte-identical string.
 */
export function buildTwilioCompositionStorageUri(compositionSid: string): string {
  const trimmed = compositionSid.trim();
  if (!COMPOSITION_SID_RE.test(trimmed)) {
    throw new ValidationError(
      'compositionSid must be a Twilio Composition SID (starts with CJ)',
    );
  }
  return `${TWILIO_COMPOSITION_STORAGE_URI_PREFIX}${trimmed}`;
}

/**
 * Build the `storage_uri` for a raw Twilio track Recording. Pure, and
 * slash-free for the same REC1-D7 reason as the composition builder:
 * `parseStorageUri` must reject it so the archival worker can never
 * mistake Twilio-hosted media for a Supabase object.
 */
export function buildTwilioRecordingStorageUri(recordingSid: string): string {
  const trimmed = recordingSid.trim();
  if (!RECORDING_SID_RE.test(trimmed)) {
    throw new ValidationError(
      'recordingSid must be a Twilio Recording SID (starts with RT)',
    );
  }
  return `${TWILIO_RECORDING_STORAGE_URI_PREFIX}${trimmed}`;
}

function isRegisterableKind(kind: string): kind is RegisterableArtifactKind {
  return (REGISTERABLE_ARTIFACT_KINDS as readonly string[]).includes(kind);
}

function isUniqueViolation(error: { code?: string; message?: string }): boolean {
  if (error.code === '23505') return true;
  return /duplicate key|unique constraint/i.test(error.message ?? '');
}

// ============================================================================
// Public: registerFinalisedComposition
// ============================================================================

/**
 * Register a finalised Twilio Composition as a `recording_artifact_index`
 * row. Safe to call twice with the same SID — the UNIQUE constraint
 * collapses the second insert and the return value reports
 * `created: false`.
 *
 * @throws ValidationError on missing/invalid input, unknown kind, or a
 *         composition that is not Twilio-`completed`.
 * @throws NotFoundError when `sessionId` does not resolve.
 * @throws InternalError on Twilio / DB failures other than UNIQUE.
 */
export async function registerFinalisedComposition(
  input: RegisterFinalisedCompositionInput,
): Promise<RegisterFinalisedCompositionResult> {
  const sessionId = input.sessionId?.trim();
  const compositionSid = input.compositionSid?.trim();
  const artifactKind = input.artifactKind?.trim();
  const correlationId = input.correlationId?.trim();

  if (!sessionId) throw new ValidationError('sessionId is required');
  if (!compositionSid) throw new ValidationError('compositionSid is required');
  if (!COMPOSITION_SID_RE.test(compositionSid)) {
    throw new ValidationError(
      'compositionSid must be a Twilio Composition SID (starts with CJ)',
    );
  }
  if (!artifactKind) throw new ValidationError('artifactKind is required');
  if (!isRegisterableKind(artifactKind)) {
    throw new ValidationError(
      `artifactKind '${artifactKind}' is not registerable (expected audio_composition | video_composition)`,
    );
  }
  if (!correlationId) throw new ValidationError('correlationId is required');

  const session = await findSessionById(sessionId);
  if (!session) {
    throw new NotFoundError('Consultation session not found');
  }

  const metadata = await fetchCompositionMetadata(compositionSid);
  if (metadata.status !== 'completed') {
    logger.info(
      {
        correlationId,
        sessionId,
        compositionSid,
        artifactKind,
        status: metadata.status,
      },
      'recording-artifact-service: composition not completed — not registered',
    );
    throw new ValidationError(
      `Composition ${compositionSid} is ${metadata.status}; only completed compositions can be registered`,
    );
  }

  const storageUri = buildTwilioCompositionStorageUri(compositionSid);
  const bytes =
    typeof metadata.sizeBytes === 'number' ? metadata.sizeBytes : null;

  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError(
      'recording-artifact-service: Supabase admin client unavailable',
    );
  }

  const { data: inserted, error: insertErr } = await admin
    .from('recording_artifact_index')
    .insert({
      session_id:                 sessionId,
      artifact_kind:              artifactKind,
      storage_uri:                storageUri,
      bytes,
      patient_self_serve_visible: true,
    })
    .select('id')
    .maybeSingle();

  if (insertErr) {
    if (isUniqueViolation(insertErr)) {
      const existing = await fetchExistingRow({
        sessionId,
        artifactKind,
        storageUri,
      });
      logger.info(
        {
          correlationId,
          sessionId,
          compositionSid,
          artifactKind,
          artifactId: existing.id,
        },
        'recording-artifact-service: register collapsed to existing row (idempotent)',
      );
      return {
        created:    false,
        artifactId: existing.id,
        storageUri,
        bytes:      existing.bytes,
      };
    }
    throw new InternalError(
      `recording-artifact-service: insert failed (${insertErr.message})`,
    );
  }

  const artifactId = (inserted as { id?: string } | null)?.id?.trim();
  if (!artifactId) {
    throw new InternalError(
      'recording-artifact-service: insert succeeded but returned no id',
    );
  }

  logger.info(
    {
      correlationId,
      sessionId,
      compositionSid,
      artifactKind,
      artifactId,
      bytes,
    },
    'recording-artifact-service: composition registered',
  );

  return { created: true, artifactId, storageUri, bytes };
}

/**
 * Register a completed raw Twilio track Recording as a
 * `recording_artifact_index` row. Idempotent through the same UNIQUE
 * constraint as the composition writer.
 *
 * The artifact kind is derived from Twilio's own `type` rather than
 * accepted from the caller: Twilio is authoritative about whether a
 * track carries audio or video, and a caller-supplied mismatch would
 * put a video track behind the audio replay gate. `data` tracks carry
 * no transcodable media and are rejected.
 *
 * @throws ValidationError on missing/invalid input, a `data` track, or
 *         a recording that is not Twilio-`completed`.
 * @throws NotFoundError when `sessionId` does not resolve.
 * @throws InternalError on Twilio / DB failures other than UNIQUE.
 */
export async function registerFinalisedRecording(
  input: RegisterFinalisedRecordingInput,
): Promise<RegisterFinalisedRecordingResult> {
  const sessionId = input.sessionId?.trim();
  const recordingSid = input.recordingSid?.trim();
  const correlationId = input.correlationId?.trim();

  if (!sessionId) throw new ValidationError('sessionId is required');
  if (!recordingSid) throw new ValidationError('recordingSid is required');
  if (!RECORDING_SID_RE.test(recordingSid)) {
    throw new ValidationError(
      'recordingSid must be a Twilio Recording SID (starts with RT)',
    );
  }
  if (!correlationId) throw new ValidationError('correlationId is required');

  const session = await findSessionById(sessionId);
  if (!session) {
    throw new NotFoundError('Consultation session not found');
  }

  const metadata = await fetchRecordingMetadata(recordingSid);

  if (metadata.type === 'data') {
    throw new ValidationError(
      `Recording ${recordingSid} is a data track and carries no media`,
    );
  }

  if (metadata.status !== 'completed') {
    logger.info(
      {
        correlationId,
        sessionId,
        recordingSid,
        status: metadata.status,
      },
      'recording-artifact-service: recording not completed — not registered',
    );
    throw new ValidationError(
      `Recording ${recordingSid} is ${metadata.status}; only completed recordings can be registered`,
    );
  }

  const artifactKind: RegisterableTrackArtifactKind =
    metadata.type === 'video' ? 'video_track' : 'audio_track';
  const storageUri = buildTwilioRecordingStorageUri(recordingSid);
  const bytes =
    typeof metadata.sizeBytes === 'number' ? metadata.sizeBytes : null;

  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError(
      'recording-artifact-service: Supabase admin client unavailable',
    );
  }

  const { data: inserted, error: insertErr } = await admin
    .from('recording_artifact_index')
    .insert({
      session_id:                 sessionId,
      artifact_kind:              artifactKind,
      storage_uri:                storageUri,
      bytes,
      patient_self_serve_visible: true,
    })
    .select('id')
    .maybeSingle();

  if (insertErr) {
    if (isUniqueViolation(insertErr)) {
      const existing = await fetchExistingRow({
        sessionId,
        artifactKind,
        storageUri,
      });
      logger.info(
        {
          correlationId,
          sessionId,
          recordingSid,
          artifactKind,
          artifactId: existing.id,
        },
        'recording-artifact-service: recording register collapsed to existing row (idempotent)',
      );
      return {
        created:    false,
        artifactId: existing.id,
        storageUri,
        bytes:      existing.bytes,
        artifactKind,
      };
    }
    throw new InternalError(
      `recording-artifact-service: recording insert failed (${insertErr.message})`,
    );
  }

  const artifactId = (inserted as { id?: string } | null)?.id?.trim();
  if (!artifactId) {
    throw new InternalError(
      'recording-artifact-service: recording insert succeeded but returned no id',
    );
  }

  logger.info(
    {
      correlationId,
      sessionId,
      recordingSid,
      artifactKind,
      artifactId,
      bytes,
      containerFormat: metadata.containerFormat,
      codec:           metadata.codec,
    },
    'recording-artifact-service: recording registered',
  );

  return { created: true, artifactId, storageUri, bytes, artifactKind };
}

async function fetchExistingRow(input: {
  sessionId:     string;
  artifactKind:  RegisterableArtifactKind | RegisterableTrackArtifactKind;
  storageUri:    string;
}): Promise<{ id: string; bytes: number | null }> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError(
      'recording-artifact-service: Supabase admin client unavailable',
    );
  }
  const { data, error } = await admin
    .from('recording_artifact_index')
    .select('id, bytes')
    .eq('session_id', input.sessionId)
    .eq('artifact_kind', input.artifactKind)
    .eq('storage_uri', input.storageUri)
    .maybeSingle();
  if (error) {
    throw new InternalError(
      `recording-artifact-service: unique-collapse lookup failed (${error.message})`,
    );
  }
  const row = data as { id?: string; bytes?: number | null } | null;
  const id = row?.id?.trim();
  if (!id) {
    throw new InternalError(
      'recording-artifact-service: unique violation but no existing row',
    );
  }
  return { id, bytes: typeof row?.bytes === 'number' ? row.bytes : null };
}
