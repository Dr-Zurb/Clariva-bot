/**
 * Recording Archival Worker (Plan 02 · Task 34 · Decision 4 LOCKED)
 * ------------------------------------------------------------------
 *
 * Two phases, one module. Both phases read `recording_artifact_index`
 * joined to `consultation_sessions` (for `actual_ended_at` +
 * `doctor_id` + `patient_id`), look up each artifact's effective
 * retention policy via `regulatory-retention-service`, and decide
 * whether to act.
 *
 * ## Phase 1 — Hide from patient self-serve (at +90 days)
 *
 *   Flip `patient_self_serve_visible` FALSE once
 *   `now - actual_ended_at >= policy.patientSelfServeDays`. Reversible:
 *   support staff can flip it back via a manual UPDATE or a future
 *   admin endpoint. Plan 07's replay player reads this flag and 404s
 *   patient-side requests when FALSE. Doctor-side access is unaffected.
 *
 *   Safe to re-run: the UPDATE is idempotent (we filter by
 *   `patient_self_serve_visible = TRUE`). Safe under concurrent cron
 *   runs for the same reason.
 *
 * ## Phase 2 — Hard-delete (at retention-years end)
 *
 *   Remove the underlying media (Twilio Composition DELETE for
 *   `twilio-composition:<CJ…>` URIs — REC1-D1; Supabase Storage
 *   `deleteObject` for `<bucket>/<path>` URIs), INSERT a row into
 *   `archival_history`, UPDATE `recording_artifact_index.hard_deleted_at`,
 *   and DELETE any `signed_url_revocation` rows whose `url_prefix`
 *   matches the artifact's URI (the revocation prefix is moot once
 *   the object is gone).
 *
 *   Irreversible. There is no `FOR UPDATE … SKIP LOCKED`. PostgREST
 *   cannot express that lock, and adding an RPC would be a migration
 *   (REC5-D1 forbids one). The concurrency defence is a re-verify
 *   SELECT (`hard_deleted_at IS NULL`) immediately before the
 *   provider/storage call, plus a conditional stamp
 *   (`UPDATE … WHERE hard_deleted_at IS NULL`).
 *
 *   Residual race: two cron ticks can both pass re-verify and both
 *   issue a delete. Double provider-delete is possible. It is made
 *   harmless by treating Twilio 404 (composition already gone) as
 *   success — the same end-state rule storage-service uses for
 *   Supabase not-found. At most one run stamps; both may INSERT
 *   `archival_history` (append-only duplicates are the existing
 *   trade-off vs leaving the index un-stamped).
 *
 *   Provider/storage errors are not swallowed into a success audit
 *   row. We explicitly do NOT stamp `hard_deleted_at` if the destroy
 *   call failed, so the next cron run retries (REC5-D6).
 *
 * ## Dry-run mode
 *
 *   Both phases accept `dryRun: boolean`. When `true`:
 *     - `runHidePhase`    — scans for candidates, logs them with a
 *                           structured `event: 'archival_dry_run',
 *                           phase: 'hide'` payload. Does NOT UPDATE.
 *     - `runHardDeletePhase` — scans for candidates, logs them with
 *                           `event: 'archival_dry_run', phase: 'delete'`
 *                           including a provider split (Twilio /
 *                           Supabase / unclassifiable). Does NOT
 *                           delete — not at Twilio, not in Storage.
 *
 *   The admin-preview API (`GET /api/v1/admin/archival-preview`)
 *   re-uses the `scan*Candidates` helpers exported here to render the
 *   ops-dashboard "next 7 days of pending hide / delete actions" surface.
 *
 * ## Pediatric retention (retention_until_age)
 *
 *   When a policy row has `retention_until_age` set (e.g. India
 *   pediatrics = 21), the worker picks the later of:
 *     * `actual_ended_at + retention_years`
 *     * `patient.date_of_birth + retention_until_age`
 *   If the patient's DOB is unknown, the retention-years branch wins
 *   (conservative — we never under-retain a pediatric record because
 *   DOB is missing).
 *
 * @see backend/migrations/055_regulatory_retention_policy.sql
 * @see backend/migrations/056_recording_artifact_index.sql
 * @see backend/migrations/057_archival_history.sql
 * @see docs/Work/Daily-plans/April 2026/19-04-2026/Tasks/task-34-regulatory-retention-policy-and-archival-worker.md
 */

import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import { InternalError, NotFoundError } from '../utils/errors';
import {
  resolveRetentionPolicy,
  type ResolveRetentionPolicyResult,
} from '../services/regulatory-retention-service';
import { deleteObject, parseStorageUri } from '../services/storage-service';
import { deleteComposition } from '../services/twilio-compositions';
import { deleteRecording } from '../services/twilio-recordings';

/**
 * Locked REC1-D1 (`recording-artifact-service.ts`). Duplicated here so
 * this worker does not import the registry writer.
 */
const TWILIO_COMPOSITION_STORAGE_URI_PREFIX = 'twilio-composition:';
const COMPOSITION_SID_RE = /^CJ[a-zA-Z0-9]{10,}$/;
const TWILIO_RECORDING_STORAGE_URI_PREFIX = 'twilio-recording:';
const RECORDING_SID_RE = /^RT[a-zA-Z0-9]{10,}$/;

export type ArchivalStorageHost =
  | 'twilio_composition'
  | 'twilio_recording'
  | 'supabase_storage'
  | 'unclassifiable';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
// 365.25 captures leap-year drift over multi-year retention; for 3-21
// year windows this is ~6 days of drift at the edges, which is well
// within ops tolerance. Using exact year arithmetic via Date.setFullYear
// would be more correct but adds complexity without changing behaviour
// at any interesting boundary.
const MS_PER_YEAR = 365.25 * MS_PER_DAY;

export interface RunPhaseInput {
  dryRun: boolean;
  correlationId: string;
  /** Defaults to `new Date()`. Exposed so the admin-preview API can ask "what would trigger N days from now?". */
  asOf?: Date;
}

export interface RunHidePhaseResult {
  candidates: number;
  hidden: number;
}

export interface RunHardDeletePhaseResult {
  candidates: number;
  deleted: number;
  bytesFreed: number;
  deletedTwilio: number;
  deletedSupabase: number;
  failedUnclassifiable: number;
}

// ----------------------------------------------------------------------------
// Shared candidate shape (used by the admin-preview API + dry-run logs)
// ----------------------------------------------------------------------------

export interface HideCandidate {
  artifactId: string;
  sessionId: string;
  artifactKind: string;
  storageUri: string;
  sessionEndedAt: string;
  ageDays: number;
  policy: {
    country: string;
    specialty: string;
    patientSelfServeDays: number;
    matchedTier: 'exact' | 'country' | 'global';
  };
}

export interface DeleteCandidate {
  artifactId: string;
  sessionId: string;
  artifactKind: string;
  storageUri: string;
  /** Classified from `storage_uri` via REC1-D1 / parseStorageUri. */
  storageHost: ArchivalStorageHost;
  bytes: number | null;
  sessionEndedAt: string;
  ageDays: number;
  retentionCutoffAt: string;
  policy: {
    country: string;
    specialty: string;
    retentionYears: number;
    retentionUntilAge: number | null;
    source: string;
    policyId: string;
    matchedTier: 'exact' | 'country' | 'global';
  };
}

// ----------------------------------------------------------------------------
// Internal types for the raw JOIN shape Supabase returns
// ----------------------------------------------------------------------------

interface ArtifactRow {
  id: string;
  session_id: string;
  artifact_kind: string;
  storage_uri: string;
  bytes: number | null;
  patient_self_serve_visible: boolean;
  hard_deleted_at: string | null;
  consultation_sessions: {
    id: string;
    actual_ended_at: string | null;
    doctor_id: string;
    patient_id: string | null;
  } | null;
}

interface DoctorContext {
  country: string | null;
  specialty: string | null;
}

interface PatientContext {
  dateOfBirth: string | null;
}

// ----------------------------------------------------------------------------
// Per-run cache (doctor_settings + patient DOB) so a cron tick doing N
// artifacts does O(doctors + patients) reads, not O(N) reads.
// ----------------------------------------------------------------------------

class RunCache {
  private doctors = new Map<string, DoctorContext>();
  private patients = new Map<string, PatientContext>();
  private policies = new Map<string, ResolveRetentionPolicyResult>();

  async getDoctor(doctorId: string): Promise<DoctorContext> {
    const cached = this.doctors.get(doctorId);
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
        `recording-archival-worker: doctor_settings lookup failed for doctor ${doctorId}: ${error.message}`,
      );
    }

    const ctx: DoctorContext = {
      country: (data?.country as string | null) ?? null,
      specialty: (data?.specialty as string | null) ?? null,
    };
    this.doctors.set(doctorId, ctx);
    return ctx;
  }

  async getPatient(patientId: string): Promise<PatientContext> {
    const cached = this.patients.get(patientId);
    if (cached) return cached;

    const admin = getSupabaseAdminClient();
    if (!admin) throw new InternalError('Service role client not available');

    const { data, error } = await admin
      .from('patients')
      .select('date_of_birth')
      .eq('id', patientId)
      .maybeSingle();

    if (error) {
      throw new InternalError(
        `recording-archival-worker: patient DOB lookup failed for patient ${patientId}: ${error.message}`,
      );
    }

    const ctx: PatientContext = {
      dateOfBirth: (data?.date_of_birth as string | null) ?? null,
    };
    this.patients.set(patientId, ctx);
    return ctx;
  }

  async getPolicy(
    country: string | null,
    specialty: string | null,
    asOf: Date,
  ): Promise<ResolveRetentionPolicyResult> {
    const key = `${country ?? ''}|${specialty ?? ''}`;
    const cached = this.policies.get(key);
    if (cached) return cached;

    const policy = await resolveRetentionPolicy({
      countryCode: country,
      specialty,
      asOf,
    });
    this.policies.set(key, policy);
    return policy;
  }
}

// ----------------------------------------------------------------------------
// Scan helpers — exported so admin-preview API can reuse them.
// ----------------------------------------------------------------------------

async function selectLiveArtifactRows(): Promise<ArtifactRow[]> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  // `inner` join on consultation_sessions so sessions without a row are
  // filtered out. `actual_ended_at IS NOT NULL` keeps in-flight consults
  // (the session has started but not ended) out of the TTL scan — they
  // can't be "past 90 days" yet.
  const { data, error } = await admin
    .from('recording_artifact_index')
    .select(
      'id, session_id, artifact_kind, storage_uri, bytes, patient_self_serve_visible, hard_deleted_at, consultation_sessions!inner(id, actual_ended_at, doctor_id, patient_id)',
    )
    .is('hard_deleted_at', null);

  if (error) {
    throw new InternalError(
      `recording-archival-worker: artifact scan failed: ${error.message}`,
    );
  }

  // Supabase's typed-select sometimes returns the joined row as an
  // array-of-one when the relationship inference is ambiguous; normalise
  // here so the rest of the worker doesn't care.
  const rows = (data ?? []).map((row) => {
    const session = Array.isArray(row.consultation_sessions)
      ? row.consultation_sessions[0] ?? null
      : row.consultation_sessions ?? null;
    return {
      ...row,
      consultation_sessions: session,
    } as ArtifactRow;
  });

  return rows.filter((r) => r.consultation_sessions?.actual_ended_at != null);
}

function ageDays(endedAt: string, asOf: Date): number {
  const end = new Date(endedAt).getTime();
  if (Number.isNaN(end)) return 0;
  return Math.floor((asOf.getTime() - end) / MS_PER_DAY);
}

/**
 * Compute the retention cutoff for a given session + policy. When the
 * policy carries a `retention_until_age` override AND the patient's
 * date-of-birth is known, returns the LATER of:
 *   - sessionEnd + retentionYears * 365.25d
 *   - dob + retention_until_age * 365.25d
 * Otherwise, returns sessionEnd + retentionYears.
 *
 * Returning a Date so the caller can stamp `retentionCutoffAt` in the
 * admin-preview response without recomputing.
 */
export function computeRetentionCutoff(
  sessionEndedAt: string,
  policy: ResolveRetentionPolicyResult,
  patientDob: string | null,
): Date {
  const endMs = new Date(sessionEndedAt).getTime();
  const baseline = endMs + policy.retentionYears * MS_PER_YEAR;

  if (policy.retentionUntilAge == null || !patientDob) {
    return new Date(baseline);
  }
  const dobMs = new Date(patientDob).getTime();
  if (Number.isNaN(dobMs)) {
    return new Date(baseline);
  }
  const dobBranch = dobMs + policy.retentionUntilAge * MS_PER_YEAR;
  return new Date(Math.max(baseline, dobBranch));
}

/**
 * Scan for artifacts whose self-serve TTL has elapsed and who are still
 * patient-visible. Returns the full candidate list so both the worker
 * (to mutate) and the admin-preview API (to render) can reuse it.
 */
export async function scanHideCandidates(
  asOf: Date = new Date(),
): Promise<HideCandidate[]> {
  const rows = await selectLiveArtifactRows();
  const cache = new RunCache();
  const candidates: HideCandidate[] = [];

  for (const row of rows) {
    if (!row.patient_self_serve_visible) continue;
    const sess = row.consultation_sessions;
    if (!sess?.actual_ended_at) continue;

    const doctor = await cache.getDoctor(sess.doctor_id);
    const policy = await cache.getPolicy(doctor.country, doctor.specialty, asOf);

    const endMs = new Date(sess.actual_ended_at).getTime();
    const selfServeThreshold = endMs + policy.patientSelfServeDays * MS_PER_DAY;
    if (selfServeThreshold > asOf.getTime()) continue;

    candidates.push({
      artifactId: row.id,
      sessionId: row.session_id,
      artifactKind: row.artifact_kind,
      storageUri: row.storage_uri,
      sessionEndedAt: sess.actual_ended_at,
      ageDays: ageDays(sess.actual_ended_at, asOf),
      policy: {
        country: policy.matchedCountry,
        specialty: policy.matchedSpecialty,
        patientSelfServeDays: policy.patientSelfServeDays,
        matchedTier: policy.matchedTier,
      },
    });
  }

  return candidates;
}

/**
 * Scan for artifacts whose hard-delete cutoff has elapsed. Returns the
 * full candidate list.
 */
export async function scanDeleteCandidates(
  asOf: Date = new Date(),
): Promise<DeleteCandidate[]> {
  const rows = await selectLiveArtifactRows();
  const cache = new RunCache();
  const candidates: DeleteCandidate[] = [];

  for (const row of rows) {
    const sess = row.consultation_sessions;
    if (!sess?.actual_ended_at) continue;

    const doctor = await cache.getDoctor(sess.doctor_id);
    const policy = await cache.getPolicy(doctor.country, doctor.specialty, asOf);

    const patientDob = sess.patient_id
      ? (await cache.getPatient(sess.patient_id)).dateOfBirth
      : null;
    const cutoff = computeRetentionCutoff(sess.actual_ended_at, policy, patientDob);
    if (cutoff.getTime() > asOf.getTime()) continue;

    candidates.push({
      artifactId: row.id,
      sessionId: row.session_id,
      artifactKind: row.artifact_kind,
      storageUri: row.storage_uri,
      storageHost: classifyStorageUri(row.storage_uri).host,
      bytes: row.bytes,
      sessionEndedAt: sess.actual_ended_at,
      ageDays: ageDays(sess.actual_ended_at, asOf),
      retentionCutoffAt: cutoff.toISOString(),
      policy: {
        country: policy.matchedCountry,
        specialty: policy.matchedSpecialty,
        retentionYears: policy.retentionYears,
        retentionUntilAge: policy.retentionUntilAge,
        source: policy.source,
        policyId: policy.policyId,
        matchedTier: policy.matchedTier,
      },
    });
  }

  return candidates;
}

// ----------------------------------------------------------------------------
// Phase 1 — Hide
// ----------------------------------------------------------------------------

export async function runHidePhase(
  input: RunPhaseInput,
): Promise<RunHidePhaseResult> {
  const asOf = input.asOf ?? new Date();
  const candidates = await scanHideCandidates(asOf);

  if (candidates.length === 0) {
    logger.info(
      { correlationId: input.correlationId, dryRun: input.dryRun },
      'archival_hide_phase_no_candidates',
    );
    return { candidates: 0, hidden: 0 };
  }

  if (input.dryRun) {
    logger.info(
      {
        correlationId: input.correlationId,
        event: 'archival_dry_run',
        phase: 'hide',
        count: candidates.length,
        sample: candidates.slice(0, 10).map((c) => ({
          sessionId: c.sessionId,
          artifactKind: c.artifactKind,
          ageDays: c.ageDays,
          policy: c.policy,
        })),
      },
      'archival_hide_phase_dry_run',
    );
    return { candidates: candidates.length, hidden: 0 };
  }

  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  let hidden = 0;
  for (const candidate of candidates) {
    // Conditional update: only flip if still visible. Catches the rare
    // concurrent-cron or support-staff-intervention race where another
    // caller already set the flag.
    const { data, error } = await admin
      .from('recording_artifact_index')
      .update({
        patient_self_serve_visible: false,
        patient_self_serve_hidden_at: new Date().toISOString(),
      })
      .eq('id', candidate.artifactId)
      .eq('patient_self_serve_visible', true)
      .select('id');

    if (error) {
      logger.error(
        {
          correlationId: input.correlationId,
          artifactId: candidate.artifactId,
          error: error.message,
        },
        'archival_hide_phase_row_failed',
      );
      continue;
    }
    if (data && data.length > 0) hidden += 1;
  }

  logger.info(
    {
      correlationId: input.correlationId,
      candidates: candidates.length,
      hidden,
    },
    'archival_hide_phase_complete',
  );

  return { candidates: candidates.length, hidden };
}

// ----------------------------------------------------------------------------
// Phase 2 — Hard-delete
// ----------------------------------------------------------------------------

export async function runHardDeletePhase(
  input: RunPhaseInput,
): Promise<RunHardDeletePhaseResult> {
  const asOf = input.asOf ?? new Date();
  const candidates = await scanDeleteCandidates(asOf);

  if (candidates.length === 0) {
    logger.info(
      { correlationId: input.correlationId, dryRun: input.dryRun },
      'archival_delete_phase_no_candidates',
    );
    return emptyDeleteResult();
  }

  const providerSplit = countProviderSplit(candidates);

  if (input.dryRun) {
    logger.info(
      {
        correlationId: input.correlationId,
        event: 'archival_dry_run',
        phase: 'delete',
        count: candidates.length,
        providerSplit,
        sample: candidates.slice(0, 10).map((c) => ({
          sessionId: c.sessionId,
          artifactKind: c.artifactKind,
          storageHost: c.storageHost,
          ageDays: c.ageDays,
          retentionCutoffAt: c.retentionCutoffAt,
          policy: c.policy,
        })),
      },
      'archival_delete_phase_dry_run',
    );
    return {
      candidates: candidates.length,
      deleted: 0,
      bytesFreed: 0,
      deletedTwilio: 0,
      deletedSupabase: 0,
      failedUnclassifiable: 0,
    };
  }

  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  let deleted = 0;
  let bytesFreed = 0;
  let deletedTwilio = 0;
  let deletedSupabase = 0;
  let failedUnclassifiable = 0;

  for (const candidate of candidates) {
    try {
      // Re-verify hard_deleted_at IS NULL right before the destroy call.
      // Not a row-level lock (see file header). Two ticks can still race;
      // Twilio 404 / Supabase not-found is what makes a double-delete
      // harmless.
      const { data: live, error: liveErr } = await admin
        .from('recording_artifact_index')
        .select('id, hard_deleted_at, storage_uri, bytes')
        .eq('id', candidate.artifactId)
        .is('hard_deleted_at', null)
        .maybeSingle();

      if (liveErr) {
        logger.error(
          {
            correlationId: input.correlationId,
            artifactId: candidate.artifactId,
            error: liveErr.message,
          },
          'archival_delete_phase_reverify_failed',
        );
        continue;
      }
      if (!live) {
        // Already deleted by another run. Not an error.
        continue;
      }

      const storageUri =
        typeof live.storage_uri === 'string' && live.storage_uri.length > 0
          ? live.storage_uri
          : candidate.storageUri;
      const classified = classifyStorageUri(storageUri);

      if (classified.host === 'unclassifiable') {
        failedUnclassifiable += 1;
        logger.error(
          {
            correlationId: input.correlationId,
            artifactId: candidate.artifactId,
            sessionId: candidate.sessionId,
            storageUri,
            storageHost: classified.host,
          },
          'archival_delete_phase_unclassifiable_uri',
        );
        continue;
      }

      const providerOutcome = await destroyArtifactMedia(classified, storageUri);

      const deletionReason = buildDeletionReason(candidate, classified.host);

      const { error: historyErr } = await admin
        .from('archival_history')
        .insert({
          artifact_id: candidate.artifactId,
          session_id: candidate.sessionId,
          artifact_kind: candidate.artifactKind,
          storage_uri: storageUri,
          bytes: candidate.bytes,
          deletion_reason: deletionReason,
          policy_id: candidate.policy.policyId,
        });

      // Destroy succeeded. History insert failing does not block the
      // stamp — leaving hard_deleted_at NULL would retry the provider
      // delete forever. Duplicate archival_history on a later retry is
      // the existing append-only trade-off (see header).
      if (historyErr) {
        logger.error(
          {
            correlationId: input.correlationId,
            artifactId: candidate.artifactId,
            error: historyErr.message,
            storageHost: classified.host,
            providerOutcome,
          },
          'archival_delete_phase_history_insert_failed',
        );
      }

      const { error: stampErr } = await admin
        .from('recording_artifact_index')
        .update({ hard_deleted_at: new Date().toISOString() })
        .eq('id', candidate.artifactId)
        .is('hard_deleted_at', null);

      if (stampErr) {
        // Media is gone; index is not stamped. Next tick retries.
        // Twilio 404 is treated as success so the retry is harmless.
        logger.error(
          {
            correlationId: input.correlationId,
            artifactId: candidate.artifactId,
            error: stampErr.message,
            storageHost: classified.host,
            providerOutcome,
            historyWritten: !historyErr,
            stamped: false,
          },
          'archival_delete_phase_stamp_failed',
        );
        continue;
      }

      logger.info(
        {
          correlationId: input.correlationId,
          artifactId: candidate.artifactId,
          sessionId: candidate.sessionId,
          storageHost: classified.host,
          compositionSid:
            classified.host === 'twilio_composition'
              ? classified.compositionSid
              : undefined,
          recordingSid:
            classified.host === 'twilio_recording'
              ? classified.recordingSid
              : undefined,
          providerOutcome,
          historyWritten: !historyErr,
          stamped: true,
        },
        'archival_delete_phase_provider_recorded',
      );

      await maybeCleanupRevocationRow(storageUri, input.correlationId);

      deleted += 1;
      if (
        classified.host === 'twilio_composition' ||
        classified.host === 'twilio_recording'
      ) {
        deletedTwilio += 1;
      } else {
        deletedSupabase += 1;
      }
      if (typeof candidate.bytes === 'number') bytesFreed += candidate.bytes;
    } catch (err) {
      logger.error(
        {
          correlationId: input.correlationId,
          artifactId: candidate.artifactId,
          error: err instanceof Error ? err.message : String(err),
        },
        'archival_delete_phase_row_failed',
      );
    }
  }

  logger.info(
    {
      correlationId: input.correlationId,
      candidates: candidates.length,
      deleted,
      bytesFreed,
      deletedTwilio,
      deletedSupabase,
      failedUnclassifiable,
      providerSplit,
    },
    'archival_delete_phase_complete',
  );

  return {
    candidates: candidates.length,
    deleted,
    bytesFreed,
    deletedTwilio,
    deletedSupabase,
    failedUnclassifiable,
  };
}

function emptyDeleteResult(): RunHardDeletePhaseResult {
  return {
    candidates: 0,
    deleted: 0,
    bytesFreed: 0,
    deletedTwilio: 0,
    deletedSupabase: 0,
    failedUnclassifiable: 0,
  };
}

function countProviderSplit(candidates: DeleteCandidate[]): {
  twilio_composition: number;
  twilio_recording: number;
  supabase_storage: number;
  unclassifiable: number;
} {
  const split = {
    twilio_composition: 0,
    twilio_recording: 0,
    supabase_storage: 0,
    unclassifiable: 0,
  };
  for (const c of candidates) {
    split[c.storageHost] += 1;
  }
  return split;
}

export type ClassifiedStorageUri =
  | { host: 'twilio_composition'; compositionSid: string }
  | { host: 'twilio_recording'; recordingSid: string }
  | { host: 'supabase_storage' }
  | { host: 'unclassifiable' };

/**
 * Route a `storage_uri` using p1's recorded convention (REC1-D1), not
 * a `CJ` hunt. Twilio-hosted rows are `twilio-composition:<CJ…>` or
 * `twilio-recording:<RT…>`, both slash-free. Supabase-hosted rows parse
 * as `<bucket>/<path>`. Anything else is an index-population bug — loud
 * failure, no stamp.
 *
 * The two Twilio hosts are distinct resources: deleting a Composition
 * leaves its source Recordings intact and vice versa, so each artifact
 * row has to reach its own DELETE endpoint.
 */
export function classifyStorageUri(storageUri: string): ClassifiedStorageUri {
  const trimmed = typeof storageUri === 'string' ? storageUri.trim() : '';
  if (!trimmed) return { host: 'unclassifiable' };

  if (trimmed.startsWith(TWILIO_COMPOSITION_STORAGE_URI_PREFIX)) {
    const sid = trimmed.slice(TWILIO_COMPOSITION_STORAGE_URI_PREFIX.length);
    if (COMPOSITION_SID_RE.test(sid) && !sid.includes('/')) {
      return { host: 'twilio_composition', compositionSid: sid };
    }
    return { host: 'unclassifiable' };
  }

  if (trimmed.startsWith(TWILIO_RECORDING_STORAGE_URI_PREFIX)) {
    const sid = trimmed.slice(TWILIO_RECORDING_STORAGE_URI_PREFIX.length);
    if (RECORDING_SID_RE.test(sid) && !sid.includes('/')) {
      return { host: 'twilio_recording', recordingSid: sid };
    }
    return { host: 'unclassifiable' };
  }

  // Scheme-prefixed URIs (Twilio Media URLs, s3://, …) are neither
  // REC1-D1 nor the bare `<bucket>/<path>` convention. parseStorageUri
  // would accept `https://…` as bucket `https:` — that is the REC1-D7
  // lie this routing exists to prevent.
  if (/^(https?|s3):\/\//i.test(trimmed)) {
    return { host: 'unclassifiable' };
  }

  try {
    parseStorageUri(trimmed);
    return { host: 'supabase_storage' };
  } catch {
    return { host: 'unclassifiable' };
  }
}

/**
 * Destroy media at the classified provider. Twilio 404 (already gone)
 * is success so a stamp-failed retry / concurrent double-delete is
 * harmless. Other provider errors throw — caller must not stamp.
 */
async function destroyArtifactMedia(
  classified: Exclude<ClassifiedStorageUri, { host: 'unclassifiable' }>,
  storageUri: string,
): Promise<'deleted' | 'already_absent'> {
  if (classified.host === 'twilio_composition') {
    try {
      await deleteComposition(classified.compositionSid);
      return 'deleted';
    } catch (err) {
      if (err instanceof NotFoundError) {
        return 'already_absent';
      }
      throw err;
    }
  }
  if (classified.host === 'twilio_recording') {
    try {
      await deleteRecording(classified.recordingSid);
      return 'deleted';
    } catch (err) {
      if (err instanceof NotFoundError) {
        return 'already_absent';
      }
      throw err;
    }
  }
  await deleteObject(storageUri);
  return 'deleted';
}

function buildDeletionReason(
  candidate: DeleteCandidate,
  host: Exclude<ArchivalStorageHost, 'unclassifiable'>,
): string {
  const base = `retention_expired_country=${candidate.policy.country}_specialty=${candidate.policy.specialty}_years=${candidate.policy.retentionYears}`;
  const withAge =
    candidate.policy.retentionUntilAge != null
      ? `${base}_untilAge=${candidate.policy.retentionUntilAge}`
      : base;
  if (host === 'twilio_composition') {
    return `${withAge}_provider=twilio_composition_source_recordings=intact`;
  }
  if (host === 'twilio_recording') {
    return `${withAge}_provider=twilio_recording_derived_compositions=intact`;
  }
  return `${withAge}_provider=supabase_storage`;
}

/**
 * Delete the revocation row whose `url_prefix` is a leading substring
 * of `storageUri`, BUT only when the artifact just deleted was the
 * last live artifact under that prefix. The "last one" check protects
 * against prematurely restoring self-serve visibility to other
 * artifacts still in storage under the same patient prefix.
 *
 * Failures are logged and swallowed — a leftover revocation row is
 * harmless (it just continues to block a path that no longer exists).
 */
async function maybeCleanupRevocationRow(
  storageUri: string,
  correlationId: string,
): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) return;

  // Find any revocation rows whose url_prefix matches the artifact's
  // path. We scan a capped set (single patient = one or two prefixes)
  // and compare prefixes in application code rather than emit a
  // cross-column SQL `startswith` predicate that PostgREST would not
  // accept on a TEXT column without a functional index.
  const { data: revocations, error: revErr } = await admin
    .from('signed_url_revocation')
    .select('url_prefix');

  if (revErr) {
    logger.warn(
      { correlationId, storageUri, error: revErr.message },
      'archival_delete_phase_revocation_read_failed',
    );
    return;
  }
  const matching = (revocations ?? [])
    .map((r) => r.url_prefix as string)
    .filter((prefix) => storageUri.startsWith(prefix));

  for (const prefix of matching) {
    // Count live (not-yet-hard-deleted) artifacts under this prefix.
    // `ilike` with trailing wildcard matches any URI under the prefix.
    const { count, error: countErr } = await admin
      .from('recording_artifact_index')
      .select('id', { count: 'exact', head: true })
      .is('hard_deleted_at', null)
      .like('storage_uri', `${prefix}%`);

    if (countErr) {
      logger.warn(
        {
          correlationId,
          storageUri,
          prefix,
          error: countErr.message,
        },
        'archival_delete_phase_revocation_count_failed',
      );
      continue;
    }
    if ((count ?? 0) > 0) continue;

    const { error: delErr } = await admin
      .from('signed_url_revocation')
      .delete()
      .eq('url_prefix', prefix);

    if (delErr) {
      logger.warn(
        {
          correlationId,
          storageUri,
          prefix,
          error: delErr.message,
        },
        'archival_delete_phase_revocation_delete_failed',
      );
      continue;
    }

    logger.info(
      { correlationId, storageUri, prefix },
      'archival_delete_phase_revocation_cleaned',
    );
  }
}
