/**
 * Drug Interactions Service (EHR Sub-batch C / Task C.2 / T4.19)
 *
 * Single exported function: checkInteractions(ids)
 *
 * Given a list of drug_master UUIDs (up to 20), returns all matching
 * drug_interactions rows for every unordered pair formed from that list.
 *
 * Pair normalisation
 * ------------------
 * The `drug_interactions` table enforces a canonical ordering via:
 *   CHECK (drug_a_id < drug_b_id)
 *   UNIQUE (drug_a_id, drug_b_id)
 * So for a pair (u1, u2) we always query with:
 *   drug_a_id = LEAST(u1, u2)  AND  drug_b_id = GREATEST(u1, u2)
 * We replicate this in TypeScript with a simple string comparison.
 *
 * Query strategy
 * --------------
 * For N drugs the maximum pair count is C(20,2) = 190.  We build an OR
 * filter using PostgREST's `.or()` syntax:
 *   "and(drug_a_id.eq.A,drug_b_id.eq.B),and(...)"
 * This is more expressive than a compound IN clause and avoids a custom
 * RPC for the V1 path.
 *
 * Unknown drug ids silently produce no results (no FK match → no row).
 * Response p95 target: < 30ms for 5 ids (small lookup table).
 */

import { getSupabaseAdminClient } from '../config/database';
import { handleSupabaseError } from '../utils/db-helpers';
import { InternalError } from '../utils/errors';
import { InteractionRow } from '../types/drug-interactions';

/** Hard ceiling matching the controller's validation. */
const MAX_IDS = 20;

/**
 * Returns all drug_interactions rows for the unordered pairs formed from
 * the supplied list of drug_master ids.
 *
 * Empty list or single-element list → [] (no pairs possible).
 * Ids beyond MAX_IDS are silently truncated (controller enforces the hard
 * ceiling before reaching here; this is a defence-in-depth guard).
 */
export async function checkInteractions(ids: string[]): Promise<InteractionRow[]> {
  const safeIds = ids.slice(0, MAX_IDS);
  if (safeIds.length < 2) return [];

  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }

  // Build all unordered pairs with canonical ordering (smaller UUID first).
  const pairs: [string, string][] = [];
  for (let i = 0; i < safeIds.length; i++) {
    for (let j = i + 1; j < safeIds.length; j++) {
      const a = safeIds[i] < safeIds[j] ? safeIds[i] : safeIds[j];
      const b = safeIds[i] < safeIds[j] ? safeIds[j] : safeIds[i];
      pairs.push([a, b]);
    }
  }

  // PostgREST OR filter: each clause matches one canonical pair exactly.
  const orFilter = pairs
    .map(([a, b]) => `and(drug_a_id.eq.${a},drug_b_id.eq.${b})`)
    .join(',');

  const { data, error } = await admin
    .from('drug_interactions')
    .select(
      'id, drug_a_id, drug_b_id, severity, description, recommendation, source, source_url'
    )
    .or(orFilter);

  if (error) handleSupabaseError(error, 'checkInteractions');

  return (data ?? []) as InteractionRow[];
}
