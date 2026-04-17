/**
 * learn-05: Non-blocking assist hints for staff inbox (aggregates from prior resolutions).
 */

import { createHash } from 'crypto';
import { getSupabaseAdminClient } from '../config/database';
import { handleSupabaseError } from '../utils/db-helpers';
import { InternalError } from '../utils/errors';
import {
  buildPatternKeyFromInputs,
  extractCandidateServiceKeysFromLabels,
  normalizeMatchReasonCodes,
} from './service-match-learning-pattern';
import type { ServiceStaffReviewRequestRow } from './service-staff-review-service';
import { isLearningActiveForDoctor, logSingleFeeSkip } from '../utils/catalog-mode-guard';

export type ServiceMatchAssistResolutionHint = {
  final_catalog_service_key: string;
  count: number;
  label: string | null;
};

export type ServiceMatchAssistHint = {
  pattern_key: string;
  feature_snapshot_hash: string;
  total_resolutions: number;
  top_resolutions: ServiceMatchAssistResolutionHint[];
};

const HINT_EXAMPLE_LIMIT = 500;

function countResolutions(
  finals: Array<{ final_catalog_service_key: string }>
): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of finals) {
    const k = String(r.final_catalog_service_key).trim().toLowerCase();
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

/**
 * Aggregates prior learning examples with the same structured pattern + proposed key as this review row.
 */
export async function fetchAssistHintForReviewRow(params: {
  row: Pick<
    ServiceStaffReviewRequestRow,
    'match_reason_codes' | 'candidate_labels' | 'proposed_catalog_service_key'
  >;
  doctorId: string;
  correlationId: string;
  /** Catalog labels keyed by service_key (lowercase). */
  catalogLabelByKey: Map<string, string>;
}): Promise<ServiceMatchAssistHint | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  // Task 10 (Plan 03): single-fee doctors have no review rows and no historical learning examples
  // to aggregate. Short-circuit before issuing the examples query for safety + observability.
  if (!(await isLearningActiveForDoctor(params.doctorId, params.correlationId, admin))) {
    logSingleFeeSkip('learning.assist', {
      doctorId: params.doctorId,
      correlationId: params.correlationId,
    });
    return null;
  }

  const proposed = params.row.proposed_catalog_service_key?.trim().toLowerCase();
  if (!proposed) return null;

  const { patternKey, canonical } = buildPatternKeyFromInputs({
    matchReasonCodes: normalizeMatchReasonCodes(params.row.match_reason_codes),
    candidateServiceKeys: extractCandidateServiceKeysFromLabels(params.row.candidate_labels),
    proposedCatalogServiceKey: proposed,
  });
  const feature_snapshot_hash = createHash('sha256').update(canonical, 'utf8').digest('hex');

  const { data, error } = await admin
    .from('service_match_learning_examples')
    .select('final_catalog_service_key')
    .eq('doctor_id', params.doctorId)
    .eq('pattern_key', patternKey)
    .eq('proposed_catalog_service_key', proposed)
    .order('created_at', { ascending: false })
    .limit(HINT_EXAMPLE_LIMIT);

  if (error) handleSupabaseError(error, params.correlationId);

  const rows = (data ?? []) as Array<{ final_catalog_service_key: string }>;
  if (rows.length === 0) return null;

  const counts = countResolutions(rows);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const top: ServiceMatchAssistResolutionHint[] = sorted.map(([final_catalog_service_key, count]) => ({
    final_catalog_service_key,
    count,
    label: params.catalogLabelByKey.get(final_catalog_service_key) ?? null,
  }));

  const total_resolutions = rows.length;

  return {
    pattern_key: patternKey,
    feature_snapshot_hash,
    total_resolutions,
    top_resolutions: top,
  };
}
