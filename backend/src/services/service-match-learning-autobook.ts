/**
 * learn-05: Opt-in autobook when enabled policy matches current structured case (same pattern contract as learn-03).
 * Pure resolution + DM text; caller persists state and sends the single outbound DM.
 */

import { createHash } from 'crypto';
import { getSupabaseAdminClient } from '../config/database';
import { env } from '../config/env';
import { logger } from '../config/logger';
import {
  applyFinalCatalogServiceSelection,
  ConversationState,
  SERVICE_CATALOG_MATCH_REASON_CODES,
} from '../types/conversation';
import { handleSupabaseError } from '../utils/db-helpers';
import { InternalError } from '../utils/errors';
import { logAuditEvent } from '../utils/audit-logger';
import { formatStaffReviewResolvedContinueBookingDm } from '../utils/staff-service-review-dm';
import { findServiceOfferingByKey, getActiveServiceCatalog } from '../utils/service-catalog-helpers';
import { buildBookingPageUrl } from './slot-selection-service';
import { getDoctorSettings } from './doctor-settings-service';
import { isLearningActiveForDoctor, logSingleFeeSkip } from '../utils/catalog-mode-guard';
import {
  buildPatternKeyFromInputs,
  extractCandidateServiceKeysFromLabels,
  normalizeMatchReasonCodes,
} from './service-match-learning-pattern';
import type { AutobookPolicyRow } from './service-match-learning-policy-service';

function mergeSlotStepAfterStaffResolution(state: ConversationState): ConversationState {
  if (state.step === 'awaiting_staff_service_confirmation') {
    return { ...state, step: 'awaiting_slot_selection' };
  }
  return state;
}

async function fetchActiveAutobookPolicy(params: {
  doctorId: string;
  patternKey: string;
  proposedKey: string;
  correlationId: string;
}): Promise<AutobookPolicyRow | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  const { data, error } = await admin
    .from('service_match_autobook_policies')
    .select('*')
    .eq('doctor_id', params.doctorId)
    .eq('pattern_key', params.patternKey)
    .eq('proposed_catalog_service_key', params.proposedKey)
    .is('disabled_at', null)
    .eq('enabled', true)
    .maybeSingle();

  if (error) handleSupabaseError(error, params.correlationId);
  return data ? (data as AutobookPolicyRow) : null;
}

export type LearningPolicyAutobookDmResult = {
  applied: true;
  nextState: ConversationState;
  replyText: string;
  policyId: string;
  featureSnapshotHash: string;
  patternKey: string;
  finalCatalogServiceKey: string;
};

export type LearningPolicyAutobookDmNone = { applied: false };

/**
 * If an enabled policy matches (pattern + proposed), build final state and booking DM (no DB writes).
 */
export async function tryApplyLearningPolicyAutobook(params: {
  doctorId: string;
  conversationId: string;
  state: ConversationState;
  candidateLabels: Array<{ service_key: string; label: string }>;
  correlationId: string;
}): Promise<LearningPolicyAutobookDmResult | LearningPolicyAutobookDmNone> {
  if (!env.LEARNING_AUTOBOOK_ENABLED) {
    return { applied: false };
  }

  // Task 10 (Plan 03): single-fee doctors have one service and no pending staff review is ever
  // enqueued. Short-circuit defensively before any DB work + policy lookups.
  if (!(await isLearningActiveForDoctor(params.doctorId, params.correlationId))) {
    logSingleFeeSkip('learning.autobook', {
      doctorId: params.doctorId,
      correlationId: params.correlationId,
      conversationId: params.conversationId,
    });
    return { applied: false };
  }

  if (
    params.state.step !== 'awaiting_staff_service_confirmation' ||
    params.state.pendingStaffServiceReview !== true ||
    !params.state.matcherProposedCatalogServiceKey?.trim()
  ) {
    return { applied: false };
  }

  const proposed = params.state.matcherProposedCatalogServiceKey.trim().toLowerCase();
  const { patternKey, canonical } = buildPatternKeyFromInputs({
    matchReasonCodes: normalizeMatchReasonCodes(params.state.serviceCatalogMatchReasonCodes),
    candidateServiceKeys: extractCandidateServiceKeysFromLabels(params.candidateLabels),
    proposedCatalogServiceKey: proposed,
  });
  const featureSnapshotHash = createHash('sha256').update(canonical, 'utf8').digest('hex');

  const policy = await fetchActiveAutobookPolicy({
    doctorId: params.doctorId,
    patternKey,
    proposedKey: proposed,
    correlationId: params.correlationId,
  });

  if (!policy) {
    return { applied: false };
  }

  const finalKey = policy.final_catalog_service_key.trim().toLowerCase();
  if (!finalKey) {
    return { applied: false };
  }

  const settings = await getDoctorSettings(params.doctorId);
  const catalog = settings ? getActiveServiceCatalog(settings) : null;
  if (!catalog) {
    logger.info(
      { correlationId: params.correlationId, doctorId: params.doctorId },
      'learning_autobook_skip_no_catalog'
    );
    return { applied: false };
  }

  const offering = findServiceOfferingByKey(catalog, finalKey);
  if (!offering) {
    logger.info(
      { correlationId: params.correlationId, doctorId: params.doctorId, finalKey },
      'learning_autobook_skip_final_not_in_catalog'
    );
    return { applied: false };
  }

  let nextState = applyFinalCatalogServiceSelection(params.state, {
    catalogServiceKey: offering.service_key,
    catalogServiceId: offering.service_id,
    consultationModality: params.state.matcherProposedConsultationModality ?? undefined,
    clearProposal: true,
    reasonCodesAppend: [SERVICE_CATALOG_MATCH_REASON_CODES.LEARNING_POLICY_AUTOBOOK],
  });
  nextState = mergeSlotStepAfterStaffResolution(nextState);

  const bookingUrl = buildBookingPageUrl(params.conversationId, params.doctorId);
  const visitLabel = offering.label?.trim() || offering.service_key;
  const replyText = formatStaffReviewResolvedContinueBookingDm(
    settings,
    visitLabel,
    bookingUrl,
    'learning_policy_autobook'
  );

  await logAuditEvent({
    correlationId: params.correlationId,
    action: 'learning_policy_autobook_applied',
    resourceType: 'service_match_autobook_policy',
    resourceId: policy.id,
    status: 'success',
    metadata: {
      policy_id: policy.id,
      pattern_key: patternKey,
      feature_snapshot_hash: featureSnapshotHash,
      proposed_catalog_service_key: proposed,
      final_catalog_service_key: finalKey,
    },
  });

  logger.info(
    {
      correlationId: params.correlationId,
      doctorId: params.doctorId,
      conversationId: params.conversationId,
      policyId: policy.id,
      patternKeyPrefix: patternKey.slice(0, 12),
    },
    'learning_policy_autobook_applied'
  );

  return {
    applied: true,
    nextState,
    replyText,
    policyId: policy.id,
    featureSnapshotHash,
    patternKey,
    finalCatalogServiceKey: finalKey,
  };
}
