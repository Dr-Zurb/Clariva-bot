/**
 * Doctor drug usage service (rx-polish-favorites · rxf-03 / rxf-05)
 *
 * Tracks per-doctor prescribing frequency for DrugAutocomplete personal
 * ranking. Incremented on Send Rx only — never on draft save. Free-text
 * medicines (no drug_master_id) are excluded by callers.
 */

import { getSupabaseAdminClient } from '../config/database';
import { handleSupabaseError } from '../utils/db-helpers';
import { logDataAccess } from '../utils/audit-logger';
import { InternalError } from '../utils/errors';

/** Max rows returned for autocomplete ranking (rxf-05). */
export const DRUG_USAGE_LIST_CAP = 500;

/**
 * Batch-increment usage counters for the given drug-master IDs.
 * No-op when the array is empty after filtering nulls upstream.
 */
export async function incrementDoctorDrugUsageOnSend(
  doctorId: string,
  drugMasterIds: string[],
  correlationId: string,
): Promise<void> {
  const uniqueIds = [...new Set(drugMasterIds)];
  if (uniqueIds.length === 0) {
    return;
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { error } = await admin.rpc('increment_doctor_drug_usage_batch', {
    p_doctor_id: doctorId,
    p_drug_master_ids: uniqueIds,
  });

  if (error) {
    handleSupabaseError(error, correlationId);
  }
}

/**
 * Top-N usage map for the calling doctor. Powers DrugAutocomplete personal
 * ranking (client-side re-sort). Capped at 500 rows — tail beyond that has
 * no ranking signal for autocomplete anyway.
 */
export async function listMyDrugUsage(
  correlationId: string,
  doctorId: string,
): Promise<Record<string, number>> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  const { data, error } = await admin
    .from('doctor_drug_usage')
    .select('drug_master_id, usage_count')
    .eq('doctor_id', doctorId)
    .order('usage_count', { ascending: false })
    .limit(DRUG_USAGE_LIST_CAP);

  if (error) {
    handleSupabaseError(error, correlationId);
  }

  await logDataAccess(correlationId, doctorId, 'doctor_drug_usage', undefined);

  const scores: Record<string, number> = {};
  for (const row of data ?? []) {
    const id = (row as { drug_master_id: string }).drug_master_id;
    const count = (row as { usage_count: number }).usage_count;
    scores[id] = count;
  }
  return scores;
}
