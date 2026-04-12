/**
 * learn-02: Persist structured learning examples when staff confirms or reassigns
 * a service catalog review (ARM-06). No LLM; no PHI in snapshot (DC-ALLOW / DC-DENY).
 *
 * feature_snapshot provenance:
 * - review_row_at_resolution: columns from service_staff_review_requests after resolution (DB).
 * - conversation_state_after_resolution: allowlisted matcher keys from ConversationState
 *   after applyFinalCatalogServiceSelection + updateConversationState (in-memory state).
 */

import { getSupabaseAdminClient } from '../config/database';
import { env } from '../config/env';
import { logger } from '../config/logger';
import type { ConversationState, ServiceCatalogMatchConfidence } from '../types/conversation';
import { handleSupabaseError } from '../utils/db-helpers';
import { InternalError } from '../utils/errors';
import {
  buildPatternKeyFromInputs,
  extractCandidateServiceKeysFromLabels,
  normalizeMatchReasonCodes,
} from './service-match-learning-pattern';

/** Subset of review row fields used for learning (avoids circular imports). */
export type ServiceStaffReviewRowForLearning = {
  id: string;
  doctor_id: string;
  correlation_id: string | null;
  proposed_catalog_service_key: string;
  proposed_catalog_service_id: string | null;
  proposed_consultation_modality: 'text' | 'voice' | 'video' | null;
  match_confidence: ServiceCatalogMatchConfidence;
  match_reason_codes: unknown;
  candidate_labels: unknown;
  final_catalog_service_key: string | null;
  final_catalog_service_id: string | null;
  final_consultation_modality: 'text' | 'voice' | 'video' | null;
  resolved_at: string | null;
};

const STATE_KEYS_FOR_LEARNING: (keyof ConversationState)[] = [
  'serviceCatalogMatchReasonCodes',
  'serviceCatalogMatchConfidence',
  'matcherProposedCatalogServiceKey',
  'matcherProposedCatalogServiceId',
  'matcherProposedConsultationModality',
  'matcherCandidateLabels',
  'serviceSelectionFinalized',
  'catalogServiceKey',
  'catalogServiceId',
  'consultationModality',
  'pendingStaffServiceReview',
  'staffServiceReviewRequestId',
];

export function pickMatcherFieldsFromConversationState(
  state: ConversationState
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of STATE_KEYS_FOR_LEARNING) {
    const v = state[k];
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export function buildServiceMatchLearningFeatureSnapshot(params: {
  row: ServiceStaffReviewRowForLearning;
  conversationStateAfterResolution: ConversationState;
}): Record<string, unknown> {
  const { row, conversationStateAfterResolution } = params;
  return {
    schema_version: 1,
    review_row_at_resolution: {
      proposed_catalog_service_key: row.proposed_catalog_service_key,
      proposed_catalog_service_id: row.proposed_catalog_service_id,
      proposed_consultation_modality: row.proposed_consultation_modality,
      match_confidence: row.match_confidence,
      /** Reason codes captured when the pending review row was created (pre-staff). */
      match_reason_codes: Array.isArray(row.match_reason_codes)
        ? row.match_reason_codes
        : [],
      candidate_labels: Array.isArray(row.candidate_labels) ? row.candidate_labels : [],
      final_catalog_service_key: row.final_catalog_service_key,
      final_catalog_service_id: row.final_catalog_service_id,
      final_consultation_modality: row.final_consultation_modality,
      resolved_at: row.resolved_at,
    },
    conversation_state_after_resolution: pickMatcherFieldsFromConversationState(
      conversationStateAfterResolution
    ),
  };
}

export async function ingestServiceMatchLearningExample(params: {
  row: ServiceStaffReviewRowForLearning;
  conversationStateAfterResolution: ConversationState;
  action: 'confirmed' | 'reassigned';
  correlationId: string;
}): Promise<void> {
  if (!env.SERVICE_MATCH_LEARNING_INGEST_ENABLED) {
    return;
  }

  const fk = params.row.final_catalog_service_key?.trim();
  const pk = params.row.proposed_catalog_service_key?.trim();
  if (!fk || !pk) {
    logger.warn(
      { correlationId: params.correlationId, reviewRequestId: params.row.id },
      'service_match_learning_ingest_skip_missing_keys'
    );
    return;
  }

  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  const feature_snapshot = buildServiceMatchLearningFeatureSnapshot({
    row: params.row,
    conversationStateAfterResolution: params.conversationStateAfterResolution,
  });

  const { patternKey } = buildPatternKeyFromInputs({
    matchReasonCodes: normalizeMatchReasonCodes(params.row.match_reason_codes),
    candidateServiceKeys: extractCandidateServiceKeysFromLabels(params.row.candidate_labels),
    proposedCatalogServiceKey: pk,
  });

  const { error } = await admin.from('service_match_learning_examples').insert({
    doctor_id: params.row.doctor_id,
    review_request_id: params.row.id,
    action: params.action,
    proposed_catalog_service_key: pk,
    final_catalog_service_key: fk,
    feature_snapshot,
    pattern_key: patternKey,
    correlation_id: params.row.correlation_id,
  });

  if (error) {
    const code = (error as { code?: string }).code;
    if (code === '23505') {
      logger.info(
        { correlationId: params.correlationId, reviewRequestId: params.row.id },
        'service_match_learning_ingest_duplicate_skipped'
      );
      return;
    }
    handleSupabaseError(error, params.correlationId);
  }
}
