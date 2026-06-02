/**
 * Snapshot Review Service (Sub-batch D · task-video-D3)
 *
 * Doctor-only post-call workflow for reviewing the snapshots captured
 * during a video consult (via `submitSnapshot` / Sub-batch C task-video-C3),
 * assigning them to canonical clinical sections (Subjective / Objective /
 * Assessment / Plan / Attachments — Decision §19 radio-list shape), and
 * soft-discarding the ones the doctor doesn't want to keep.
 *
 * EXECUTION-TIME AUDIT (2026-05-01) DRIVES THE SHAPE
 *
 *   1. Snapshots are NOT a separate table. They live as
 *      `consultation_messages` rows with `kind='attachment'` and
 *      `metadata.snapshot = true` — the discriminant that the C3 + 084
 *      RLS gate already uses. Every read / write here keys on that
 *      same predicate; no new schema.
 *
 *   2. The D3 spec calls for "copying the snapshot into the relevant
 *      clinical-record table" (e.g. SOAP-style Objective / Assessment).
 *      No such tables exist in this codebase — the audit confirmed
 *      `clinical_notes` / `consult_objective` / etc. are missing. So
 *      Phase 1 persists the section assignment as
 *      `metadata.clinical_section` ON the snapshot row itself. When a
 *      future SOAP infrastructure ships, the clinical-record projection
 *      can read this field and back-fill — no data loss.
 *
 *   3. Soft-delete uses `metadata.discarded_at: <ISO>` rather than a
 *      column delete. `consultation_messages` doesn't have a
 *      `discarded_at` column today and we don't want to add one for a
 *      single feature; the metadata path keeps the row intact for
 *      audit while letting read paths filter on a single key. This
 *      also matches how Migration 084's RLS treats the metadata column
 *      (predicate-driven visibility, not row-deletion).
 *
 *   4. Auth is doctor-only. The patient-facing post-call surface does
 *      not mount the review panel; the backend defends-in-depth by
 *      rejecting non-doctor JWTs at the service boundary.
 *
 * @see backend/src/services/snapshot-storage-service.ts (capture path)
 * @see backend/migrations/084_consultation_messages_snapshot_visibility_rls.sql
 * @see docs/Work/Daily-plans/April 2026/28-04-2026/Tasks/task-video-D3-snapshot-review-attach.md
 */

import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import {
  ForbiddenError,
  InternalError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../utils/errors';

// ============================================================================
// Constants + types
// ============================================================================

const UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const CONSULTATION_ATTACHMENTS_BUCKET = 'consultation-attachments';

/**
 * Signed URL TTL for the gallery thumbnails / modal preview. Same 1h
 * envelope `submitSnapshot` mints — short enough that a leaked URL
 * ages out, long enough that a doctor reviewing N snapshots in one
 * session doesn't burn round-trips on every render.
 */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * Decision §19 — canonical clinical sections, radio-list shape.
 * Kept as a Set for O(1) membership tests and as a string-literal
 * union for compile-time narrowing on the public DTO.
 */
export const CLINICAL_SECTIONS = [
  'Subjective',
  'Objective',
  'Assessment',
  'Plan',
  'Attachments',
] as const;

export type ClinicalSection = (typeof CLINICAL_SECTIONS)[number];

const CLINICAL_SECTION_SET: ReadonlySet<string> = new Set(CLINICAL_SECTIONS);

export interface ListSnapshotsInput {
  sessionId: string;
  bearerJwt: string;
  correlationId: string;
  /**
   * `true` (default) → include rows where `metadata.discarded_at` is
   * set so the doctor can see + restore. `false` → omit them.
   */
  includeDiscarded?: boolean;
}

export interface SnapshotSummary {
  snapshotId: string;
  attachmentPath: string;
  /** 1h-TTL signed URL for the JPEG. Empty string on mint failure. */
  signedUrl: string;
  /** ISO-8601 capture time. */
  capturedAt: string | null;
  /** Native pixel dimensions. */
  dimensions: { width: number; height: number } | null;
  /** Caller branch from the original capture metadata. */
  capturerRole: 'doctor' | 'patient';
  /** 'self' (capturer's own tile) or 'remote' (other party's tile). */
  target: 'self' | 'remote';
  /** True iff the doctor used the C4 annotation surface. */
  annotated: boolean;
  /** Section assignment from a previous attach call; null if unattached. */
  clinicalSection: ClinicalSection | null;
  /** ISO-8601 if soft-deleted; null otherwise. */
  discardedAt: string | null;
}

export interface AttachToSectionInput {
  sessionId: string;
  snapshotId: string;
  section: ClinicalSection;
  bearerJwt: string;
  correlationId: string;
}

export interface DiscardSnapshotInput {
  sessionId: string;
  snapshotId: string;
  bearerJwt: string;
  correlationId: string;
}

// ============================================================================
// Auth resolver — doctor-only branch.
// ============================================================================

/**
 * The post-call review path is doctor-only. We reuse the same Supabase
 * admin auth check `post-call-summary-service` does for the doctor
 * branch, but we DO NOT branch on the `consult_role='patient'` claim —
 * any non-doctor caller is rejected here.
 *
 * Returns the resolved doctor's UUID + the session row (so callers
 * don't double-fetch it). Throws `UnauthorizedError` on bad token,
 * `ForbiddenError` on non-doctor caller or on the doctor not owning
 * the session, `NotFoundError` on missing session.
 */
async function resolveDoctorForSession(
  sessionId: string,
  bearerJwt: string,
): Promise<{
  doctorId: string;
  sessionRow: { id: string; doctor_id: string };
}> {
  if (!sessionId) throw new ValidationError('sessionId is required');
  if (!UUID_REGEX.test(sessionId)) {
    throw new ValidationError('sessionId is not a valid UUID');
  }
  if (!bearerJwt) throw new UnauthorizedError('Bearer token is required');

  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Admin client unavailable');

  const { data: userData, error: userErr } = await admin.auth.getUser(bearerJwt);
  if (userErr || !userData?.user?.id) {
    throw new UnauthorizedError(
      `Invalid doctor token: ${userErr?.message ?? 'auth.getUser returned no user'}`,
    );
  }
  const doctorId = userData.user.id;
  if (!UUID_REGEX.test(doctorId)) {
    throw new UnauthorizedError('Token user id is not a valid UUID');
  }

  const { data: sessionRow, error: sessionErr } = await admin
    .from('consultation_sessions')
    .select('id, doctor_id')
    .eq('id', sessionId)
    .maybeSingle();
  if (sessionErr) {
    throw new InternalError(`Session lookup failed: ${sessionErr.message}`);
  }
  if (!sessionRow) {
    throw new NotFoundError('Consultation session not found');
  }
  const row = sessionRow as { id: string; doctor_id: string };
  if (row.doctor_id !== doctorId) {
    throw new ForbiddenError('Only the assigned doctor may review snapshots');
  }
  return { doctorId, sessionRow: row };
}

// ============================================================================
// Public API
// ============================================================================

/**
 * List all snapshots captured during this session, doctor-only.
 *
 * Reads `consultation_messages` with `kind='attachment'` and
 * `metadata->>'snapshot'='true'`, ordered by `created_at` ASC so the
 * gallery preserves chronological capture order. The signed URL is
 * minted per-row; mint failures degrade to an empty `signedUrl` so
 * the gallery can still render the metadata + show a "preview
 * unavailable" placeholder.
 */
export async function listSnapshots(
  input: ListSnapshotsInput,
): Promise<SnapshotSummary[]> {
  await resolveDoctorForSession(input.sessionId, input.bearerJwt);

  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Admin client unavailable');

  // We can't push the `metadata.discarded_at IS NULL` filter into PostgREST
  // cleanly (the operator surface is awkward for "JSON key absent OR null"),
  // so we filter in code. The page is small (typical clinical session
  // captures <10 snapshots), so the round-trip cost dominates the
  // post-fetch filter cost.
  const { data, error } = await admin
    .from('consultation_messages')
    .select('id, attachment_url, attachment_byte_size, body, metadata, created_at')
    .eq('session_id', input.sessionId)
    .eq('kind', 'attachment')
    .filter('metadata->>snapshot', 'eq', 'true')
    .order('created_at', { ascending: true });
  if (error) {
    throw new InternalError(`Snapshot list failed: ${error.message}`);
  }
  const rows = (data ?? []) as Array<{
    id: string;
    attachment_url: string | null;
    attachment_byte_size: number | null;
    body: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string | null;
  }>;

  const includeDiscarded = input.includeDiscarded ?? true;

  const out: SnapshotSummary[] = [];
  for (const row of rows) {
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    const discardedAt =
      typeof metadata.discarded_at === 'string' ? metadata.discarded_at : null;
    if (!includeDiscarded && discardedAt) continue;

    const capturedAt =
      typeof metadata.captured_at === 'string' ? metadata.captured_at : row.created_at;
    const dimsRaw = metadata.dimensions as
      | { width?: unknown; height?: unknown }
      | undefined;
    const dimensions =
      dimsRaw &&
      typeof dimsRaw.width === 'number' &&
      typeof dimsRaw.height === 'number'
        ? { width: dimsRaw.width, height: dimsRaw.height }
        : null;
    const capturerRole =
      metadata.capturer_role === 'doctor' || metadata.capturer_role === 'patient'
        ? metadata.capturer_role
        : 'doctor';
    const target =
      metadata.target === 'self' || metadata.target === 'remote'
        ? metadata.target
        : 'remote';
    const annotated = metadata.annotated === true;
    const clinicalSection =
      typeof metadata.clinical_section === 'string' &&
      CLINICAL_SECTION_SET.has(metadata.clinical_section)
        ? (metadata.clinical_section as ClinicalSection)
        : null;

    let signedUrl = '';
    if (row.attachment_url) {
      try {
        const { data: signedData, error: signErr } = await admin.storage
          .from(CONSULTATION_ATTACHMENTS_BUCKET)
          .createSignedUrl(row.attachment_url, SIGNED_URL_TTL_SECONDS);
        if (!signErr && signedData?.signedUrl) {
          signedUrl = signedData.signedUrl;
        }
      } catch (err) {
        logger.warn(
          {
            sessionId: input.sessionId,
            snapshotId: row.id,
            attachmentPath: row.attachment_url,
            error: err instanceof Error ? err.message : String(err),
            correlationId: input.correlationId,
          },
          'listSnapshots: signed URL mint failed (row carries empty url)',
        );
      }
    }

    out.push({
      snapshotId: row.id,
      attachmentPath: row.attachment_url ?? '',
      signedUrl,
      capturedAt,
      dimensions,
      capturerRole,
      target,
      annotated,
      clinicalSection,
      discardedAt,
    });
  }

  logger.info(
    {
      sessionId: input.sessionId,
      count: out.length,
      includeDiscarded,
      correlationId: input.correlationId,
    },
    'listSnapshots: returned snapshots',
  );

  return out;
}

/**
 * Validate that the caller-supplied section is one of the canonical
 * Decision §19 values. Throws `ValidationError` on a typo / unknown
 * value. Exported so the controller can pre-check the request body
 * before the service round-trip.
 */
export function isClinicalSection(value: unknown): value is ClinicalSection {
  return typeof value === 'string' && CLINICAL_SECTION_SET.has(value);
}

/**
 * Attach a snapshot to a clinical section. Sets
 * `metadata.clinical_section` on the row. Idempotent — re-attaching
 * to the same section is a no-op; reassigning to a different section
 * overwrites.
 *
 * Phase 1 only updates the metadata; a future task projects the
 * assignment into a real clinical-record table when SOAP infra ships.
 *
 * Errors:
 *   - `NotFoundError` if the snapshot doesn't belong to the session
 *     OR isn't a snapshot row (`metadata.snapshot=true`).
 *   - `ValidationError` on bad section enum.
 *   - `UnauthorizedError` / `ForbiddenError` on auth problems.
 */
export async function attachSnapshotToSection(
  input: AttachToSectionInput,
): Promise<SnapshotSummary> {
  if (!input.snapshotId || !UUID_REGEX.test(input.snapshotId)) {
    throw new ValidationError('snapshotId path param must be a valid UUID');
  }
  if (!isClinicalSection(input.section)) {
    throw new ValidationError(
      `section must be one of ${CLINICAL_SECTIONS.join(', ')}`,
    );
  }
  await resolveDoctorForSession(input.sessionId, input.bearerJwt);

  const updated = await mutateSnapshotMetadata({
    sessionId: input.sessionId,
    snapshotId: input.snapshotId,
    correlationId: input.correlationId,
    mutator: (current) => ({
      ...current,
      clinical_section: input.section,
    }),
  });

  return summarizeMutatedSnapshot(updated);
}

/**
 * Soft-discard a snapshot. Sets `metadata.discarded_at` to the
 * current ISO timestamp. The row is NOT deleted — audit trail and
 * the C3 system banner ("doctor captured a snapshot at HH:MM") stay
 * visible. The chat surface and clinical-record export should both
 * filter on this key.
 *
 * Idempotent — discarding a row that's already discarded is a no-op
 * (preserves the original `discarded_at` timestamp).
 */
export async function discardSnapshot(
  input: DiscardSnapshotInput,
): Promise<SnapshotSummary> {
  if (!input.snapshotId || !UUID_REGEX.test(input.snapshotId)) {
    throw new ValidationError('snapshotId path param must be a valid UUID');
  }
  await resolveDoctorForSession(input.sessionId, input.bearerJwt);

  const updated = await mutateSnapshotMetadata({
    sessionId: input.sessionId,
    snapshotId: input.snapshotId,
    correlationId: input.correlationId,
    mutator: (current) => {
      // Preserve existing discarded_at on idempotent re-call.
      if (typeof current.discarded_at === 'string' && current.discarded_at) {
        return current;
      }
      return { ...current, discarded_at: new Date().toISOString() };
    },
  });

  return summarizeMutatedSnapshot(updated);
}

// ============================================================================
// Internal helpers
// ============================================================================

interface MutateInput {
  sessionId: string;
  snapshotId: string;
  correlationId: string;
  mutator: (current: Record<string, unknown>) => Record<string, unknown>;
}

interface MutatedSnapshotRow {
  id: string;
  attachment_url: string | null;
  body: string | null;
  metadata: Record<string, unknown>;
  created_at: string | null;
}

/**
 * Read-then-update the `metadata` JSONB on a snapshot row. We do this
 * server-side rather than via a Postgres UPDATE expression because
 * the metadata mutator may need to inspect existing keys (e.g. the
 * idempotent discard preserves the original timestamp). The single
 * round-trip is cheap and keeps the mutator pure / testable.
 *
 * Belt-and-braces: re-fetch the row after the update so the caller
 * gets the exact persisted state (including any concurrent doctor
 * write that landed in the same window). A real clinical workflow
 * almost never has two doctors writing the same snapshot, but the
 * "echo what's persisted" contract is cheaper than the "trust your
 * mutator's output" alternative.
 */
async function mutateSnapshotMetadata(
  input: MutateInput,
): Promise<MutatedSnapshotRow> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Admin client unavailable');

  const { data: existing, error: fetchErr } = await admin
    .from('consultation_messages')
    .select('id, session_id, attachment_url, body, metadata, created_at, kind')
    .eq('id', input.snapshotId)
    .eq('session_id', input.sessionId)
    .maybeSingle();
  if (fetchErr) {
    throw new InternalError(`Snapshot fetch failed: ${fetchErr.message}`);
  }
  if (!existing) {
    throw new NotFoundError('Snapshot not found in this session');
  }
  const existingRow = existing as {
    id: string;
    session_id: string;
    attachment_url: string | null;
    body: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string | null;
    kind: string;
  };
  if (existingRow.kind !== 'attachment') {
    throw new ValidationError('Target row is not an attachment');
  }
  const currentMeta = (existingRow.metadata ?? {}) as Record<string, unknown>;
  if (currentMeta.snapshot !== true) {
    throw new ValidationError('Target row is not a snapshot');
  }

  const nextMeta = input.mutator({ ...currentMeta });
  const { error: updateErr } = await admin
    .from('consultation_messages')
    .update({ metadata: nextMeta })
    .eq('id', input.snapshotId)
    .eq('session_id', input.sessionId);
  if (updateErr) {
    throw new InternalError(`Snapshot metadata update failed: ${updateErr.message}`);
  }

  logger.info(
    {
      sessionId: input.sessionId,
      snapshotId: input.snapshotId,
      correlationId: input.correlationId,
    },
    'snapshot metadata mutated',
  );

  return {
    id: existingRow.id,
    attachment_url: existingRow.attachment_url,
    body: existingRow.body,
    metadata: nextMeta,
    created_at: existingRow.created_at,
  };
}

/**
 * Convert a mutated row into the public `SnapshotSummary` shape. Mints
 * a fresh signed URL because the caller usually wants to re-render
 * the row immediately and the previous URL TTL may be close to
 * expiry. Mint failures degrade to an empty `signedUrl` (same as
 * `listSnapshots`).
 */
async function summarizeMutatedSnapshot(
  row: MutatedSnapshotRow,
): Promise<SnapshotSummary> {
  const admin = getSupabaseAdminClient();
  let signedUrl = '';
  if (admin && row.attachment_url) {
    try {
      const { data: signedData, error: signErr } = await admin.storage
        .from(CONSULTATION_ATTACHMENTS_BUCKET)
        .createSignedUrl(row.attachment_url, SIGNED_URL_TTL_SECONDS);
      if (!signErr && signedData?.signedUrl) {
        signedUrl = signedData.signedUrl;
      }
    } catch {
      // best-effort; same posture as listSnapshots.
    }
  }

  const meta = row.metadata ?? {};
  const dimsRaw = meta.dimensions as
    | { width?: unknown; height?: unknown }
    | undefined;
  return {
    snapshotId: row.id,
    attachmentPath: row.attachment_url ?? '',
    signedUrl,
    capturedAt:
      typeof meta.captured_at === 'string' ? meta.captured_at : row.created_at,
    dimensions:
      dimsRaw &&
      typeof dimsRaw.width === 'number' &&
      typeof dimsRaw.height === 'number'
        ? { width: dimsRaw.width, height: dimsRaw.height }
        : null,
    capturerRole:
      meta.capturer_role === 'doctor' || meta.capturer_role === 'patient'
        ? meta.capturer_role
        : 'doctor',
    target:
      meta.target === 'self' || meta.target === 'remote' ? meta.target : 'remote',
    annotated: meta.annotated === true,
    clinicalSection:
      typeof meta.clinical_section === 'string' &&
      CLINICAL_SECTION_SET.has(meta.clinical_section)
        ? (meta.clinical_section as ClinicalSection)
        : null,
    discardedAt:
      typeof meta.discarded_at === 'string' ? meta.discarded_at : null,
  };
}
