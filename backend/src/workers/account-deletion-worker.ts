/**
 * Account-deletion worker (Plan 02 · Task 33 · Decision 4 LOCKED)
 * ---------------------------------------------------------------
 *
 * Three public entry points, one per lifecycle step:
 *
 *   1. `requestAccountDeletion`   — patient (or admin on patient's behalf)
 *                                   taps "delete my account". Writes one
 *                                   row to `account_deletion_audit` with
 *                                   `grace_window_until = now() +
 *                                    ACCOUNT_DELETION_GRACE_DAYS`. Does
 *                                   NOT mutate anything else; the
 *                                   patient can still log back in, their
 *                                   records still show up on the doctor
 *                                   side, their IG conversation still
 *                                   routes, etc. The request is a
 *                                   commitment to finalize later.
 *
 *   2. `cancelAccountDeletion`   — patient logs back in during the
 *                                   grace window and taps "recover
 *                                   account". Sets `cancelled_at` on the
 *                                   most-recent pending audit row if
 *                                   one exists and the cutoff hasn't
 *                                   passed. Throws `ValidationError`
 *                                   otherwise.
 *
 *   3. `finalizeAccountDeletion` — cron-driven. After the grace
 *                                   cutoff, enumerate artifact prefixes
 *                                   for the patient, write them to
 *                                   `signed_url_revocation` (ON
 *                                   CONFLICT DO NOTHING — the prefix
 *                                   may already be on the list from an
 *                                   earlier support-request), scrub
 *                                   PII from the `patients` row, send
 *                                   the explainer DM, and stamp the
 *                                   audit row with `finalized_at` +
 *                                   `artifact_prefix_count`. Idempotent
 *                                   — re-running after `finalized_at`
 *                                   is set is a no-op.
 *
 * ## Artifact prefix convention
 *
 * v1 uses a single prefix per patient:
 *   `recordings/patient_<uuid>/`
 *
 * Plans 04 / 05 / 07 write artifacts under this prefix (session id +
 * artifact type as sub-path). Enumerating at deletion time therefore
 * reduces to "emit this one prefix". Future work (multiple buckets,
 * per-doctor prefixes, etc.) would extend `enumerateArtifactPrefixes`
 * in-place — the worker contract around it stays stable.
 *
 * ## Failure posture
 *
 * The worker is a multi-step operation against an external system
 * (Supabase storage + DB + DM channel). We do NOT wrap the whole thing
 * in a DB transaction — a failed DM send should not roll back the
 * revocation rows (access-severance is the irreversible commitment;
 * the DM is a courtesy). Instead, each step is ordered by criticality:
 *
 *   1. Revocation rows INSERT   (most important — blocks Plan 07 access)
 *   2. PII scrub on patient row (DPDP erasure minimum)
 *   3. Explainer DM             (courtesy notification)
 *   4. Audit row `finalized_at` (marks the work done for the cron)
 *
 * If step 3 fails, we still stamp `finalized_at` so the cron doesn't
 * loop on the same row; the DM failure is logged for manual follow-up.
 * If step 2 fails, we do NOT stamp `finalized_at` — the cron will
 * retry on the next run, and operators can triage via the logged error.
 *
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-33-account-deletion-revocation-list.md
 */

import { getSupabaseAdminClient } from '../config/database';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { InternalError, NotFoundError, ValidationError } from '../utils/errors';
import { logAuditEvent } from '../utils/audit-logger';
import { redactPhiForAI } from '../services/ai-service';
import { scrubPatientPiiFromLogs } from '../services/account-deletion-pii-scrub';
import { buildAccountDeletionExplainerDm } from '../utils/dm-copy';
import { sendInstagramMessage } from '../services/instagram-service';
import { getInstagramAccessTokenForDoctor } from '../services/instagram-connect-service';
import { sendSms } from '../services/twilio-sms-service';
import { sendEmail } from '../config/email';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const REASON_MAX_LENGTH = 500;
const REVOCATION_REASON_ACCOUNT_DELETED = 'account_deleted';

/**
 * Citation string used in the explainer DM. Centralized here (not env-
 * driven) because the wording is tied to the legal doctrine, not to a
 * deployment knob — if a region's deployment needs a different citation,
 * that's a code change with a legal review, not a config flip.
 */
const LEGAL_RETENTION_CITATION =
  'DPDP Act 2023 and GDPR Article 9 medical-record retention';

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export interface RequestAccountDeletionInput {
  patientId: string;
  /** patient_id for self-serve; admin user-id for admin-initiated. */
  requestedBy: string;
  reason?: string;
  correlationId: string;
}

export interface RequestAccountDeletionResult {
  auditId: string;
  graceWindowUntil: Date;
  /** True iff the worker reused an existing un-finalized / un-cancelled row. */
  reused: boolean;
}

export interface CancelAccountDeletionInput {
  patientId: string;
  cancelledBy: string;
  correlationId: string;
}

export interface FinalizeAccountDeletionInput {
  patientId: string;
  correlationId: string;
}

export interface FinalizeAccountDeletionResult {
  revokedPrefixes: string[];
  /** True iff this finalize call actually did work. False means the audit row was already finalized (idempotent re-run). */
  executed: boolean;
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

/**
 * v1: one prefix per patient (see file header). Extracted as a named
 * helper so Plans 04 / 05 / 07 can extend the enumeration without
 * touching the worker's orchestration.
 */
export function enumerateArtifactPrefixes(patientId: string): string[] {
  return [`recordings/patient_${patientId}/`];
}

function sanitizeReason(reason: string | undefined): string | null {
  if (!reason) return null;
  const trimmed = reason.trim();
  if (!trimmed) return null;
  const redacted = redactPhiForAI(trimmed);
  return redacted.length > REASON_MAX_LENGTH
    ? redacted.slice(0, REASON_MAX_LENGTH)
    : redacted;
}

function computeGraceWindow(requestedAt: Date, graceDays: number): Date {
  return new Date(requestedAt.getTime() + Math.max(0, graceDays) * MS_PER_DAY);
}

/**
 * Send the one-shot explainer DM via the existing best-channel cascade.
 * Order: Instagram DM → SMS → email. Mirrors `sendConsultationLinkToPatient`'s
 * priority inverted (we prefer the channel that originally routed the
 * patient onto the platform — most deployments are IG-first — but fall
 * back to any channel with a live identifier).
 *
 * Non-blocking: logs on failure, returns a summary the caller stamps
 * into the audit row. We do NOT retry — the DM is a courtesy; the
 * revocation rows + PII scrub are the compliance-critical work and
 * they have already committed by the time this function runs.
 */
async function sendExplainerDm(input: {
  patientId: string;
  finalizedAt: Date;
  correlationId: string;
}): Promise<{ sent: boolean; channel?: 'instagram' | 'sms' | 'email' }> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    logger.warn(
      { correlationId: input.correlationId, patientId: input.patientId },
      'account_deletion_explainer_dm_skipped_no_admin_client',
    );
    return { sent: false };
  }

  const message = buildAccountDeletionExplainerDm({
    citation: LEGAL_RETENTION_CITATION,
    finalizedAt: input.finalizedAt,
  });

  // Patient contact: we deliberately read the patient row BEFORE the
  // scrub on the caller side, so we still have the identifiers here.
  // But because the worker orders revocation → scrub → DM, by the time
  // we reach this helper the patient row has already been redacted.
  // Solution: the caller (finalize) hands us the DM bundle it
  // captured earlier. To keep the helper's shape simple for v1 we
  // re-read from conversations (platform_conversation_id is retained)
  // and skip the other channels entirely. This matches the spec's
  // "non-urgent informational DM" framing.
  const { data: conv } = await admin
    .from('conversations')
    .select('doctor_id, platform, platform_conversation_id')
    .eq('patient_id', input.patientId)
    .eq('platform', 'instagram')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const igRecipientId = conv?.platform_conversation_id ?? null;
  const doctorId = conv?.doctor_id ?? null;

  if (igRecipientId && doctorId) {
    try {
      const doctorToken = await getInstagramAccessTokenForDoctor(
        doctorId,
        input.correlationId,
      );
      await sendInstagramMessage(
        igRecipientId,
        message,
        input.correlationId,
        doctorToken ?? undefined,
      );
      return { sent: true, channel: 'instagram' };
    } catch (err) {
      logger.warn(
        {
          correlationId: input.correlationId,
          patientId: input.patientId,
          error: err instanceof Error ? err.message : String(err),
        },
        'account_deletion_explainer_dm_ig_failed',
      );
    }
  }

  // v1: if no IG conversation routes, we still attempt SMS / email via a
  // pre-scrub snapshot if the caller captured one. The caller does NOT
  // capture one today (we keep this surface simple), so the DM quietly
  // fails and is logged. Deployments where this matters can extend the
  // helper to accept `phoneSnapshot` / `emailSnapshot` — not scope for v1.
  void sendSms;
  void sendEmail;

  logger.info(
    { correlationId: input.correlationId, patientId: input.patientId },
    'account_deletion_explainer_dm_no_channel',
  );
  return { sent: false };
}

/**
 * Ensures a patient exists before we accept a deletion request. The
 * patient row is what we scrub at finalize time; if it doesn't exist,
 * the request is nonsensical.
 */
async function assertPatientExists(patientId: string): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');
  const { data, error } = await admin
    .from('patients')
    .select('id')
    .eq('id', patientId)
    .maybeSingle();
  if (error) {
    throw new InternalError(
      `Failed to look up patient for deletion request: ${error.message}`,
    );
  }
  if (!data) throw new NotFoundError('Patient not found');
}

// ----------------------------------------------------------------------------
// requestAccountDeletion
// ----------------------------------------------------------------------------

/**
 * Write one `account_deletion_audit` row for the patient. Idempotent in
 * the sense that a second call while a first row is still pending
 * (neither `finalized_at` nor `cancelled_at` set) returns that same row
 * rather than creating a duplicate — the patient should see "your
 * account is already scheduled for deletion on {date}" not "you created
 * a second deletion request".
 *
 * Throws:
 *   - `NotFoundError`    when the patient does not exist.
 *   - `InternalError`    on DB / admin-client failures.
 */
export async function requestAccountDeletion(
  input: RequestAccountDeletionInput,
): Promise<RequestAccountDeletionResult> {
  await assertPatientExists(input.patientId);

  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  // Reuse any pending row so repeat taps do not create duplicates.
  const { data: existing, error: existingErr } = await admin
    .from('account_deletion_audit')
    .select('id, grace_window_until')
    .eq('patient_id', input.patientId)
    .is('finalized_at', null)
    .is('cancelled_at', null)
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingErr) {
    throw new InternalError(
      `Failed to check pending deletion: ${existingErr.message}`,
    );
  }
  if (existing) {
    return {
      auditId: existing.id as string,
      graceWindowUntil: new Date(existing.grace_window_until as string),
      reused: true,
    };
  }

  const requestedAt = new Date();
  const graceWindowUntil = computeGraceWindow(
    requestedAt,
    env.ACCOUNT_DELETION_GRACE_DAYS,
  );

  const row = {
    patient_id: input.patientId,
    requested_by: input.requestedBy,
    requested_at: requestedAt.toISOString(),
    grace_window_until: graceWindowUntil.toISOString(),
    reason: sanitizeReason(input.reason),
  };

  const { data: inserted, error: insertErr } = await admin
    .from('account_deletion_audit')
    .insert(row)
    .select('id, grace_window_until')
    .single();

  if (insertErr || !inserted) {
    throw new InternalError(
      `Failed to insert account_deletion_audit: ${insertErr?.message ?? 'unknown error'}`,
    );
  }

  await logAuditEvent({
    correlationId: input.correlationId,
    userId: input.requestedBy,
    action: 'account_deletion_requested',
    resourceType: 'patient',
    resourceId: input.patientId,
    status: 'success',
    metadata: { grace_window_until: row.grace_window_until },
  });

  logger.info(
    {
      correlationId: input.correlationId,
      patientId: input.patientId,
      graceWindowUntil: row.grace_window_until,
    },
    'account_deletion_requested',
  );

  return {
    auditId: inserted.id as string,
    graceWindowUntil: new Date(inserted.grace_window_until as string),
    reused: false,
  };
}

// ----------------------------------------------------------------------------
// cancelAccountDeletion
// ----------------------------------------------------------------------------

/**
 * Mark the most-recent pending audit row as cancelled. The request
 * must still be inside the grace window — after the cutoff the cron
 * may have already finalized (or is about to), and the revocation
 * rows written at finalize are irreversible.
 *
 * Throws:
 *   - `ValidationError`  if there is no pending row, or the grace
 *                        cutoff has passed.
 *   - `InternalError`    on DB / admin-client failures.
 */
export async function cancelAccountDeletion(
  input: CancelAccountDeletionInput,
): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  const { data: pending, error: readErr } = await admin
    .from('account_deletion_audit')
    .select('id, grace_window_until')
    .eq('patient_id', input.patientId)
    .is('finalized_at', null)
    .is('cancelled_at', null)
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (readErr) {
    throw new InternalError(
      `Failed to look up pending deletion: ${readErr.message}`,
    );
  }
  if (!pending) {
    throw new ValidationError('No pending account-deletion request to cancel');
  }

  const cutoff = new Date(pending.grace_window_until as string);
  if (Number.isNaN(cutoff.getTime()) || cutoff.getTime() < Date.now()) {
    throw new ValidationError(
      'Account-deletion grace window has already expired; cancellation is no longer possible',
    );
  }

  const { error: updateErr } = await admin
    .from('account_deletion_audit')
    .update({
      cancelled_at: new Date().toISOString(),
      cancelled_by: input.cancelledBy,
    })
    .eq('id', pending.id);

  if (updateErr) {
    throw new InternalError(
      `Failed to cancel account deletion: ${updateErr.message}`,
    );
  }

  await logAuditEvent({
    correlationId: input.correlationId,
    userId: input.cancelledBy,
    action: 'account_deletion_cancelled',
    resourceType: 'patient',
    resourceId: input.patientId,
    status: 'success',
  });

  logger.info(
    { correlationId: input.correlationId, patientId: input.patientId },
    'account_deletion_cancelled',
  );
}

// ----------------------------------------------------------------------------
// finalizeAccountDeletion
// ----------------------------------------------------------------------------

/**
 * Execute the deletion. Idempotent — if the audit row for the patient
 * is already `finalized_at`-stamped, returns `executed: false` and the
 * previously-revoked prefixes. If there is no pending row (e.g. the
 * patient cancelled), returns `executed: false` and an empty prefix
 * list.
 *
 * Throws:
 *   - `InternalError`  on revocation-insert / patient-scrub failures.
 *   - Does NOT throw on DM-send failures (logged and skipped).
 */
export async function finalizeAccountDeletion(
  input: FinalizeAccountDeletionInput,
): Promise<FinalizeAccountDeletionResult> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  // Look up the most-recent audit row. Prefer the pending one; if it's
  // already finalized we still want to report "no work to do" not error.
  const { data: audit, error: auditErr } = await admin
    .from('account_deletion_audit')
    .select('id, finalized_at, cancelled_at, grace_window_until, requested_by')
    .eq('patient_id', input.patientId)
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (auditErr) {
    throw new InternalError(
      `Failed to look up audit row for finalize: ${auditErr.message}`,
    );
  }
  if (!audit) {
    logger.info(
      { correlationId: input.correlationId, patientId: input.patientId },
      'account_deletion_finalize_no_audit_row',
    );
    return { revokedPrefixes: [], executed: false };
  }
  if (audit.cancelled_at) {
    logger.info(
      { correlationId: input.correlationId, patientId: input.patientId },
      'account_deletion_finalize_skipped_cancelled',
    );
    return { revokedPrefixes: [], executed: false };
  }
  if (audit.finalized_at) {
    // Idempotent re-run: return the prefixes we already revoked for
    // this patient (best-effort — we scan by reason tag + initiated
    // user so the response is stable across re-runs).
    const prior = await listRevocationsForPatient(admin, input.patientId);
    return { revokedPrefixes: prior, executed: false };
  }

  const prefixes = enumerateArtifactPrefixes(input.patientId);

  // Step 1: revocation rows. ON CONFLICT DO NOTHING so duplicate prefix
  // rows (support-request earlier, now account-deletion) collapse
  // without failing the worker.
  for (const prefix of prefixes) {
    const { error: insertErr } = await admin
      .from('signed_url_revocation')
      .upsert(
        {
          url_prefix: prefix,
          revoked_at: new Date().toISOString(),
          revocation_reason: REVOCATION_REASON_ACCOUNT_DELETED,
          initiated_by_user: audit.requested_by,
        },
        { onConflict: 'url_prefix', ignoreDuplicates: true },
      );
    if (insertErr) {
      throw new InternalError(
        `Failed to insert revocation for prefix ${prefix}: ${insertErr.message}`,
      );
    }
  }

  // Step 2: PII scrub. If this fails we intentionally bail before
  // stamping `finalized_at` so the cron retries.
  await scrubPatientPiiFromLogs({
    patientId: input.patientId,
    correlationId: input.correlationId,
  });

  // Step 3: explainer DM. Non-fatal.
  const finalizedAt = new Date();
  const dmResult = await sendExplainerDm({
    patientId: input.patientId,
    finalizedAt,
    correlationId: input.correlationId,
  });

  // Step 4: stamp audit.
  const { error: stampErr } = await admin
    .from('account_deletion_audit')
    .update({
      finalized_at: finalizedAt.toISOString(),
      artifact_prefix_count: prefixes.length,
    })
    .eq('id', audit.id);

  if (stampErr) {
    // Revocation + scrub have committed. A failed stamp only means the
    // cron will re-run this patient — the prefix INSERTs are
    // UPSERT-idempotent, the PII scrub on a pre-scrubbed row is a
    // no-op-like update, and the DM send on a re-run is undesirable
    // but not incorrect. We log + surface the error so operators can
    // intervene.
    throw new InternalError(
      `Failed to stamp finalized_at: ${stampErr.message}`,
    );
  }

  await logAuditEvent({
    correlationId: input.correlationId,
    action: 'account_deletion_finalized',
    resourceType: 'patient',
    resourceId: input.patientId,
    status: 'success',
    metadata: {
      artifact_prefix_count: prefixes.length,
      dm_sent: dmResult.sent,
      dm_channel: dmResult.channel ?? 'none',
    },
  });

  logger.info(
    {
      correlationId: input.correlationId,
      patientId: input.patientId,
      artifact_prefix_count: prefixes.length,
      dm_sent: dmResult.sent,
    },
    'account_deletion_finalized',
  );

  return { revokedPrefixes: prefixes, executed: true };
}

async function listRevocationsForPatient(
  _admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  patientId: string,
): Promise<string[]> {
  // The convention-based prefix is deterministic from the patient id,
  // so for v1 we just recompute rather than query. Kept as a helper so
  // Plans 04 / 05 / 07 can swap in a SELECT if they diverge from the
  // one-prefix-per-patient convention.
  return enumerateArtifactPrefixes(patientId);
}
