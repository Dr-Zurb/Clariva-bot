/**
 * Patient-initiated recording erasure (recording-governance-v2 · rec-32).
 *
 * Consumes rec-31's provider-delete wrapper and `deletion_reason`
 * convention. Does not schedule anything — held-back artifacts stay
 * ordinary archival-worker candidates.
 *
 * Carve-out (REC5-D7, not a legal conclusion): retention outranks
 * erasure. Boundary comes from `resolveRetentionPolicy` +
 * `computeRetentionCutoff` (including the pediatric unknown-DOB
 * conservative branch). Per-artifact, never per-patient.
 *
 * Media destroy is gated by the caller (`mediaDeleteEnabled`). The
 * default flag (`ARCHIVAL_HARD_DELETE_ENABLED`) stays false until
 * rec-33 + founder confirmation of this carve-out.
 */

import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import { InternalError, NotFoundError } from '../utils/errors';
import {
  resolveRetentionPolicy,
  type ResolveRetentionPolicyResult,
} from './regulatory-retention-service';
import { deleteObject } from './storage-service';
import {
  deleteComposition,
  fetchCompositionMetadata,
} from './twilio-compositions';
import {
  deleteRecording,
  fetchRecordingMetadata,
} from './twilio-recordings';
import {
  classifyStorageUri,
  computeRetentionCutoff,
  type ClassifiedStorageUri,
} from '../workers/recording-archival-worker';

const TWILIO_COMPOSITION_STORAGE_URI_PREFIX = 'twilio-composition:';
const TWILIO_RECORDING_STORAGE_URI_PREFIX = 'twilio-recording:';

export type ErasureHoldReason =
  | 'retention_carve_out'
  | 'session_not_ended';

export type ErasureDmOutcome =
  | 'none'
  | 'deleted'
  | 'deferred'
  | 'mixed'
  | 'severed_only';

export interface HeldErasureArtifact {
  artifactId: string;
  sessionId: string;
  policyId: string | null;
  cutoffAt: string | null;
  reason: ErasureHoldReason;
}

export interface PatientErasurePlan {
  enumerated: number;
  eligibleNow: number;
  heldBack: number;
  twilioRevocationPrefixes: string[];
  held: HeldErasureArtifact[];
  eligible: Array<{
    artifactId: string;
    sessionId: string;
    artifactKind: string;
    storageUri: string;
    bytes: number | null;
    policyId: string;
    country: string;
    specialty: string;
    retentionYears: number;
    retentionUntilAge: number | null;
    classified: Exclude<ClassifiedStorageUri, { host: 'unclassifiable' }>;
  }>;
  latestHeldUntil: string | null;
}

export interface ApplyPatientErasureResult {
  deleted: number;
  deletedArtifactIds: string[];
}

export interface PlanAndMaybeEraseResult {
  enumerated: number;
  deleted: number;
  heldBack: number;
  mediaDeleteEnabled: boolean;
  twilioRevocationPrefixes: string[];
  held: HeldErasureArtifact[];
  deletedArtifactIds: string[];
  latestHeldUntil: string | null;
  outcome: ErasureDmOutcome;
}

interface ArtifactSession {
  id: string;
  actual_ended_at: string | null;
  doctor_id: string;
  patient_id: string | null;
}

interface LiveArtifactRow {
  id: string;
  session_id: string;
  artifact_kind: string;
  storage_uri: string;
  bytes: number | null;
  session: ArtifactSession;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((v) => v.length > 0))];
}

function maxIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

export function deriveErasureDmOutcome(input: {
  mediaDeleteEnabled: boolean;
  enumerated: number;
  deleted: number;
  heldBack: number;
  eligibleNow: number;
}): ErasureDmOutcome {
  if (input.enumerated === 0) return 'none';
  if (!input.mediaDeleteEnabled) return 'severed_only';
  if (input.deleted > 0 && input.heldBack === 0) return 'deleted';
  if (input.deleted === 0 && input.heldBack > 0) return 'deferred';
  if (input.deleted > 0 && input.heldBack > 0) return 'mixed';
  if (input.eligibleNow > 0 && input.deleted === 0) return 'severed_only';
  return 'severed_only';
}

/**
 * Read-only plan. Never deletes. Throws on an unclassifiable
 * `storage_uri` — that is an index bug, not "nothing to erase".
 */
export async function buildPatientErasurePlan(input: {
  patientId: string;
  correlationId: string;
  asOf?: Date;
}): Promise<PatientErasurePlan> {
  const asOf = input.asOf ?? new Date();
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  const { data: sessions, error: sessErr } = await admin
    .from('consultation_sessions')
    .select('id, actual_ended_at, doctor_id, patient_id')
    .eq('patient_id', input.patientId);

  if (sessErr) {
    throw new InternalError(
      `recording-erasure: session scan failed: ${sessErr.message}`,
    );
  }

  const sessionRows = (sessions ?? []) as ArtifactSession[];
  if (sessionRows.length === 0) {
    return emptyPlan();
  }

  const sessionById = new Map(sessionRows.map((s) => [s.id, s]));
  const sessionIds = sessionRows.map((s) => s.id);

  const { data: artifacts, error: artErr } = await admin
    .from('recording_artifact_index')
    .select('id, session_id, artifact_kind, storage_uri, bytes')
    .in('session_id', sessionIds)
    .is('hard_deleted_at', null);

  if (artErr) {
    throw new InternalError(
      `recording-erasure: artifact scan failed: ${artErr.message}`,
    );
  }

  const live: LiveArtifactRow[] = [];
  for (const row of artifacts ?? []) {
    const session = sessionById.get(row.session_id as string);
    if (!session) continue;
    live.push({
      id: row.id as string,
      session_id: row.session_id as string,
      artifact_kind: row.artifact_kind as string,
      storage_uri: row.storage_uri as string,
      bytes: (row.bytes as number | null) ?? null,
      session,
    });
  }

  if (live.length === 0) return emptyPlan();

  const { data: patientRow, error: patErr } = await admin
    .from('patients')
    .select('date_of_birth')
    .eq('id', input.patientId)
    .maybeSingle();

  if (patErr) {
    throw new InternalError(
      `recording-erasure: patient lookup failed: ${patErr.message}`,
    );
  }

  const patientDob = (patientRow?.date_of_birth as string | null) ?? null;
  const doctorCache = new Map<
    string,
    { country: string | null; specialty: string | null }
  >();
  const policyCache = new Map<string, ResolveRetentionPolicyResult>();

  const plan: PatientErasurePlan = {
    enumerated: live.length,
    eligibleNow: 0,
    heldBack: 0,
    twilioRevocationPrefixes: [],
    held: [],
    eligible: [],
    latestHeldUntil: null,
  };

  for (const row of live) {
    const classified = classifyStorageUri(row.storage_uri);
    if (classified.host === 'unclassifiable') {
      logger.error(
        {
          correlationId: input.correlationId,
          artifactId: row.id,
          sessionId: row.session_id,
          storageUri: row.storage_uri,
        },
        'recording_erasure_unclassifiable_uri',
      );
      throw new InternalError(
        `recording-erasure: unclassifiable storage_uri for artifact ${row.id}`,
      );
    }

    if (classified.host === 'twilio_composition') {
      plan.twilioRevocationPrefixes.push(
        `${TWILIO_COMPOSITION_STORAGE_URI_PREFIX}${classified.compositionSid}`,
      );
    }

    if (classified.host === 'twilio_recording') {
      plan.twilioRevocationPrefixes.push(
        `${TWILIO_RECORDING_STORAGE_URI_PREFIX}${classified.recordingSid}`,
      );
    }

    if (!row.session.actual_ended_at) {
      plan.heldBack += 1;
      plan.held.push({
        artifactId: row.id,
        sessionId: row.session_id,
        policyId: null,
        cutoffAt: null,
        reason: 'session_not_ended',
      });
      continue;
    }

    const doctor = await loadDoctor(
      row.session.doctor_id,
      doctorCache,
    );
    const policyKey = `${doctor.country ?? ''}|${doctor.specialty ?? ''}`;
    let policy = policyCache.get(policyKey);
    if (!policy) {
      policy = await resolveRetentionPolicy({
        countryCode: doctor.country,
        specialty: doctor.specialty,
        asOf,
      });
      policyCache.set(policyKey, policy);
    }

    const cutoff = computeRetentionCutoff(
      row.session.actual_ended_at,
      policy,
      patientDob,
    );

    if (cutoff.getTime() > asOf.getTime()) {
      plan.heldBack += 1;
      plan.held.push({
        artifactId: row.id,
        sessionId: row.session_id,
        policyId: policy.policyId,
        cutoffAt: cutoff.toISOString(),
        reason: 'retention_carve_out',
      });
      plan.latestHeldUntil = maxIso(plan.latestHeldUntil, cutoff.toISOString());
      continue;
    }

    plan.eligibleNow += 1;
    plan.eligible.push({
      artifactId: row.id,
      sessionId: row.session_id,
      artifactKind: row.artifact_kind,
      storageUri: row.storage_uri,
      bytes: row.bytes,
      policyId: policy.policyId,
      country: policy.matchedCountry,
      specialty: policy.matchedSpecialty,
      retentionYears: policy.retentionYears,
      retentionUntilAge: policy.retentionUntilAge,
      classified,
    });
  }

  plan.twilioRevocationPrefixes = unique(plan.twilioRevocationPrefixes);
  return plan;
}

export async function applyPatientErasurePlan(input: {
  plan: PatientErasurePlan;
  correlationId: string;
}): Promise<ApplyPatientErasureResult> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  const deletedArtifactIds: string[] = [];

  for (const artifact of input.plan.eligible) {
    await destroyErasureMedia(artifact.classified, artifact.storageUri);

    const deletionReason = buildPatientErasureReason(artifact);
    const { error: historyErr } = await admin.from('archival_history').insert({
      artifact_id: artifact.artifactId,
      session_id: artifact.sessionId,
      artifact_kind: artifact.artifactKind,
      storage_uri: artifact.storageUri,
      bytes: artifact.bytes,
      deletion_reason: deletionReason,
      policy_id: artifact.policyId,
    });

    if (historyErr) {
      logger.error(
        {
          correlationId: input.correlationId,
          artifactId: artifact.artifactId,
          error: historyErr.message,
        },
        'recording_erasure_history_insert_failed',
      );
      throw new InternalError(
        `recording-erasure: archival_history insert failed for ${artifact.artifactId}`,
      );
    }

    const { error: stampErr } = await admin
      .from('recording_artifact_index')
      .update({ hard_deleted_at: new Date().toISOString() })
      .eq('id', artifact.artifactId)
      .is('hard_deleted_at', null);

    if (stampErr) {
      logger.error(
        {
          correlationId: input.correlationId,
          artifactId: artifact.artifactId,
          error: stampErr.message,
        },
        'recording_erasure_stamp_failed',
      );
      throw new InternalError(
        `recording-erasure: hard_deleted_at stamp failed for ${artifact.artifactId}`,
      );
    }

    logger.info(
      {
        correlationId: input.correlationId,
        artifactId: artifact.artifactId,
        sessionId: artifact.sessionId,
        storageHost: artifact.classified.host,
        compositionSid:
          artifact.classified.host === 'twilio_composition'
            ? artifact.classified.compositionSid
            : undefined,
        historyWritten: true,
        stamped: true,
      },
      'recording_erasure_provider_recorded',
    );

    deletedArtifactIds.push(artifact.artifactId);
  }

  return { deleted: deletedArtifactIds.length, deletedArtifactIds };
}

export async function planAndMaybeErasePatientRecordings(input: {
  patientId: string;
  correlationId: string;
  mediaDeleteEnabled: boolean;
  asOf?: Date;
}): Promise<PlanAndMaybeEraseResult> {
  const plan = await buildPatientErasurePlan({
    patientId: input.patientId,
    correlationId: input.correlationId,
    asOf: input.asOf,
  });

  let deleted = 0;
  let deletedArtifactIds: string[] = [];

  if (input.mediaDeleteEnabled && plan.eligibleNow > 0) {
    const applied = await applyPatientErasurePlan({
      plan,
      correlationId: input.correlationId,
    });
    deleted = applied.deleted;
    deletedArtifactIds = applied.deletedArtifactIds;
  }

  const outcome = deriveErasureDmOutcome({
    mediaDeleteEnabled: input.mediaDeleteEnabled,
    enumerated: plan.enumerated,
    deleted,
    heldBack: plan.heldBack,
    eligibleNow: plan.eligibleNow,
  });

  logger.info(
    {
      correlationId: input.correlationId,
      patientId: input.patientId,
      enumerated: plan.enumerated,
      deleted,
      heldBack: plan.heldBack,
      eligibleNow: plan.eligibleNow,
      mediaDeleteEnabled: input.mediaDeleteEnabled,
      outcome,
    },
    'recording_erasure_plan_complete',
  );

  return {
    enumerated: plan.enumerated,
    deleted,
    heldBack: plan.heldBack,
    mediaDeleteEnabled: input.mediaDeleteEnabled,
    twilioRevocationPrefixes: plan.twilioRevocationPrefixes,
    held: plan.held,
    deletedArtifactIds,
    latestHeldUntil: plan.latestHeldUntil,
    outcome,
  };
}

export function serializeErasureAuditNotes(result: PlanAndMaybeEraseResult): string {
  return JSON.stringify({
    erasure: {
      enumerated: result.enumerated,
      deleted: result.deleted,
      held_back: result.heldBack,
      media_delete_enabled: result.mediaDeleteEnabled,
      outcome: result.outcome,
      latest_held_until: result.latestHeldUntil,
      held: result.held.map((h) => ({
        artifact_id: h.artifactId,
        session_id: h.sessionId,
        policy_id: h.policyId,
        cutoff: h.cutoffAt,
        reason: h.reason,
      })),
      deleted_ids: result.deletedArtifactIds,
    },
  });
}

function emptyPlan(): PatientErasurePlan {
  return {
    enumerated: 0,
    eligibleNow: 0,
    heldBack: 0,
    twilioRevocationPrefixes: [],
    held: [],
    eligible: [],
    latestHeldUntil: null,
  };
}

async function loadDoctor(
  doctorId: string,
  cache: Map<string, { country: string | null; specialty: string | null }>,
): Promise<{ country: string | null; specialty: string | null }> {
  const cached = cache.get(doctorId);
  if (cached) return cached;

  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  const { data, error } = await admin
    .from('doctor_settings')
    .select('country, specialty')
    .eq('doctor_id', doctorId)
    .maybeSingle();

  if (error) {
    throw new InternalError(
      `recording-erasure: doctor_settings lookup failed: ${error.message}`,
    );
  }

  const ctx = {
    country: (data?.country as string | null) ?? null,
    specialty: (data?.specialty as string | null) ?? null,
  };
  cache.set(doctorId, ctx);
  return ctx;
}

async function destroyErasureMedia(
  classified: Exclude<ClassifiedStorageUri, { host: 'unclassifiable' }>,
  storageUri: string,
): Promise<void> {
  if (classified.host === 'twilio_composition') {
    try {
      await deleteComposition(classified.compositionSid);
    } catch (err) {
      if (!(err instanceof NotFoundError)) throw err;
    }
    try {
      await fetchCompositionMetadata(classified.compositionSid);
      throw new InternalError(
        `recording-erasure: composition ${classified.compositionSid} still present after delete`,
      );
    } catch (err) {
      if (err instanceof NotFoundError) return;
      throw err;
    }
  }

  if (classified.host === 'twilio_recording') {
    try {
      await deleteRecording(classified.recordingSid);
    } catch (err) {
      if (!(err instanceof NotFoundError)) throw err;
    }
    // Twilio retains Recording metadata with `status=deleted` for 30
    // days, so a post-delete fetch can legitimately succeed. Only a
    // live status means the media survived.
    try {
      const metadata = await fetchRecordingMetadata(classified.recordingSid);
      if (metadata.status === 'deleted') return;
      throw new InternalError(
        `recording-erasure: recording ${classified.recordingSid} still ${metadata.status} after delete`,
      );
    } catch (err) {
      if (err instanceof NotFoundError) return;
      throw err;
    }
  }

  await deleteObject(storageUri);
}

function buildPatientErasureReason(artifact: {
  country: string;
  specialty: string;
  retentionYears: number;
  retentionUntilAge: number | null;
  classified: Exclude<ClassifiedStorageUri, { host: 'unclassifiable' }>;
}): string {
  const base = `patient_erasure_country=${artifact.country}_specialty=${artifact.specialty}_years=${artifact.retentionYears}`;
  const withAge =
    artifact.retentionUntilAge != null
      ? `${base}_untilAge=${artifact.retentionUntilAge}`
      : base;
  if (artifact.classified.host === 'twilio_composition') {
    return `${withAge}_provider=twilio_composition_source_recordings=intact`;
  }
  if (artifact.classified.host === 'twilio_recording') {
    return `${withAge}_provider=twilio_recording_derived_compositions=intact`;
  }
  return `${withAge}_provider=supabase_storage`;
}
