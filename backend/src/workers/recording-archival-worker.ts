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
 *   Remove the underlying storage object, INSERT a row into
 *   `archival_history`, UPDATE `recording_artifact_index.hard_deleted_at`,
 *   and DELETE any `signed_url_revocation` rows whose `url_prefix`
 *   matches the artifact's URI (the revocation prefix is moot once
 *   the object is gone).
 *
 *   Irreversible. Row-level lock (`FOR UPDATE ... SKIP LOCKED`) before
 *   the storage call so concurrent cron runs cannot both delete the
 *   same object. Storage-service errors are re-thrown — we explicitly
 *   do NOT stamp `hard_deleted_at` if the storage call failed, so the
 *   next cron run retries.
 *
 * ## Dry-run mode
 *
 *   Both phases accept `dryRun: boolean`. When `true`:
 *     - `runHidePhase`    — scans for candidates, logs them with a
 *                           structured `event: 'archival_dry_run',
 *                           phase: 'hide'` payload. Does NOT UPDATE.
 *     - `runHardDeletePhase` — scans for candidates, logs them with
 *                           `event: 'archival_dry_run', phase: 'delete'`.
 *                           Does NOT delete.
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
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-34-regulatory-retention-policy-and-archival-worker.md
 */

import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import { InternalError } from '../utils/errors';
import {
  resolveRetentionPolicy,
  type ResolveRetentionPolicyResult,
} from '../services/regulatory-retention-service';
import { deleteObject } from '../services/storage-service';

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
function computeRetentionCutoff(
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
    return { candidates: 0, deleted: 0, bytesFreed: 0 };
  }

  if (input.dryRun) {
    logger.info(
      {
        correlationId: input.correlationId,
        event: 'archival_dry_run',
        phase: 'delete',
        count: candidates.length,
        sample: candidates.slice(0, 10).map((c) => ({
          sessionId: c.sessionId,
          artifactKind: c.artifactKind,
          ageDays: c.ageDays,
          retentionCutoffAt: c.retentionCutoffAt,
          policy: c.policy,
        })),
      },
      'archival_delete_phase_dry_run',
    );
    return { candidates: candidates.length, deleted: 0, bytesFreed: 0 };
  }

  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  let deleted = 0;
  let bytesFreed = 0;

  for (const candidate of candidates) {
    try {
      // Re-verify hard_deleted_at IS NULL right before the storage call,
      // as a concurrency-defence layer. A concurrent cron run that
      // already won the race would have stamped hard_deleted_at. Our
      // SELECT → delete window is small but nonzero.
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

      await deleteObject(candidate.storageUri);

      const deletionReason = buildDeletionReason(candidate);

      const { error: historyErr } = await admin
        .from('archival_history')
        .insert({
          artifact_id: candidate.artifactId,
          session_id: candidate.sessionId,
          artifact_kind: candidate.artifactKind,
          storage_uri: candidate.storageUri,
          bytes: candidate.bytes,
          deletion_reason: deletionReason,
          policy_id: candidate.policy.policyId,
        });

      if (historyErr) {
        // Storage object is already gone. Log + move on rather than
        // throwing; the next cron's `hard_deleted_at IS NULL` scan will
        // retry the history insert on the same artifact. Re-inserting
        // history is acceptable — the table is append-only and the
        // duplicate row just doubles up one audit entry. Acceptable
        // trade-off vs the alternative of leaving the index row
        // un-stamped forever.
        logger.error(
          {
            correlationId: input.correlationId,
            artifactId: candidate.artifactId,
            error: historyErr.message,
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
        logger.error(
          {
            correlationId: input.correlationId,
            artifactId: candidate.artifactId,
            error: stampErr.message,
          },
          'archival_delete_phase_stamp_failed',
        );
        continue;
      }

      // Best-effort revocation-list cleanup. Per task spec note 7 the
      // worker may DELETE matching `signed_url_revocation` rows. Today
      // (Task 33) the revocation prefix is per-patient
      // (`recordings/patient_<uuid>/`) — deleting it prematurely while
      // other artifacts under the same patient are still live would
      // re-open patient self-serve access to those remaining artifacts.
      // Only delete the revocation row when no other live artifacts
      // remain under that same prefix.
      await maybeCleanupRevocationRow(candidate.storageUri, input.correlationId);

      deleted += 1;
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
    },
    'archival_delete_phase_complete',
  );

  return { candidates: candidates.length, deleted, bytesFreed };
}

function buildDeletionReason(candidate: DeleteCandidate): string {
  const base = `retention_expired_country=${candidate.policy.country}_specialty=${candidate.policy.specialty}_years=${candidate.policy.retentionYears}`;
  if (candidate.policy.retentionUntilAge != null) {
    return `${base}_untilAge=${candidate.policy.retentionUntilAge}`;
  }
  return base;
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
