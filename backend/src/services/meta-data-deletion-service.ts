/**
 * Meta data-deletion service (instagram-launch-readiness · ilr-02).
 *
 * Turns the Meta data-deletion callback from an ack-only stub into a real,
 * auditable erasure.
 *
 * Identity mapping (OQ-1):
 *   The signed_request `user_id` is the Facebook app-scoped user id of the
 *   person who authorized the app via Facebook Login. In Clariva that is ALWAYS
 *   the DOCTOR (they run the OAuth connect flow). Patients never authorize the
 *   app, so this callback does not fire for them and their IG-scoped PHI is out
 *   of scope here (handled by the separate account-deletion path). We therefore
 *   reverse-map user_id -> doctor via doctor_instagram.facebook_user_id.
 *
 * Deletion scope (documented per ilr-02 Scope Guard):
 *   We DELETE (not anonymize) the matched doctor's `doctor_instagram` row. That
 *   row is exactly the Meta-derived data we hold for that Facebook user: the
 *   page access token, page/user ids, and IG username. It carries no clinical
 *   record, so a hard delete is correct and leaves no orphaned Meta secret.
 *
 * Resilience:
 *   Meta REQUIRES a 200 with `{ url, confirmation_code }`. These functions
 *   therefore NEVER throw for lookup/delete/persist failures — they log, record
 *   a `failed`/`no_match` status, and always return a confirmation code so the
 *   route can answer Meta correctly. Never log the Meta user id (personal data).
 */

import { randomBytes } from 'crypto';
import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import { disconnectInstagram } from './instagram-connect-service';
import type { MetaDataDeletionStatus } from '../types/database';

export interface ProcessMetaDeletionResult {
  confirmationCode: string;
  status: MetaDataDeletionStatus;
}

function generateConfirmationCode(): string {
  return `del-${Date.now()}-${randomBytes(6).toString('hex')}`;
}

/**
 * Reverse-map a Facebook user id to a connected doctor.
 * @returns doctor_id, or null when no connection carries that user id.
 */
async function findDoctorByFacebookUserId(
  metaUserId: string,
  correlationId: string
): Promise<string | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('doctor_instagram')
    .select('doctor_id')
    .eq('facebook_user_id', metaUserId)
    .maybeSingle();

  if (error) {
    logger.error({ correlationId, code: error.code }, 'Meta deletion: doctor lookup failed');
    throw error;
  }
  const id = data?.doctor_id;
  return id != null && String(id).length > 0 ? String(id) : null;
}

/** Best-effort audit write. Logs and swallows failures — never blocks the Meta response. */
async function recordRequest(
  row: {
    confirmation_code: string;
    meta_user_id: string;
    status: MetaDataDeletionStatus;
    matched_doctor_id: string | null;
    detail: string | null;
    completed_at: string | null;
  },
  correlationId: string
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    logger.error(
      { correlationId, confirmationCode: row.confirmation_code },
      'Meta deletion: admin client unavailable; request not persisted'
    );
    return;
  }
  const { error } = await supabase.from('meta_data_deletion_requests').insert(row);
  if (error) {
    logger.error(
      { correlationId, confirmationCode: row.confirmation_code, code: error.code },
      'Meta deletion: failed to persist request record'
    );
  }
}

/**
 * Record a Meta data-deletion request and perform the erasure inline.
 *
 * The work (a single-row disconnect) is fast, so it runs synchronously within
 * the callback; re-delivery is naturally idempotent (a second delete simply
 * finds nothing and records `no_match`). Always resolves with a confirmation
 * code — see the module header on why this must not throw.
 */
export async function recordAndProcessMetaDeletion(
  metaUserId: string,
  correlationId: string
): Promise<ProcessMetaDeletionResult> {
  const confirmationCode = generateConfirmationCode();

  let status: MetaDataDeletionStatus;
  let matchedDoctorId: string | null = null;
  let detail: string;

  try {
    matchedDoctorId = await findDoctorByFacebookUserId(metaUserId, correlationId);
    if (matchedDoctorId) {
      await disconnectInstagram(matchedDoctorId, correlationId);
      status = 'completed';
      detail = 'disconnected doctor_instagram';
    } else {
      status = 'no_match';
      detail = 'no connection for user_id';
    }
  } catch {
    status = 'failed';
    detail = 'processing error';
  }

  await recordRequest(
    {
      confirmation_code: confirmationCode,
      meta_user_id: metaUserId,
      status,
      matched_doctor_id: matchedDoctorId,
      detail,
      completed_at: status === 'completed' ? new Date().toISOString() : null,
    },
    correlationId
  );

  logger.info(
    { correlationId, confirmationCode, status, matched: Boolean(matchedDoctorId) },
    'Meta deletion request processed'
  );

  return { confirmationCode, status };
}

/**
 * Look up the status for a confirmation code (drives the public status page).
 * Returns 'unknown' when the code is not found or lookup fails — never throws,
 * never leaks whether a Meta user id exists.
 */
export async function getMetaDeletionStatus(
  confirmationCode: string,
  correlationId: string
): Promise<MetaDataDeletionStatus | 'unknown'> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return 'unknown';

  try {
    const { data, error } = await supabase
      .from('meta_data_deletion_requests')
      .select('status')
      .eq('confirmation_code', confirmationCode)
      .maybeSingle();
    if (error) throw error;
    const status = data?.status;
    return (status as MetaDataDeletionStatus) ?? 'unknown';
  } catch {
    logger.warn({ correlationId }, 'Meta deletion: status lookup failed');
    return 'unknown';
  }
}
