/**
 * learn-03: Shadow evaluation when a pending staff review is created — no behavior change.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { getSupabaseAdminClient } from '../config/database';
import { env } from '../config/env';
import { logger } from '../config/logger';
import type { ConversationState } from '../types/conversation';
import {
  buildPatternKeyFromInputs,
  extractCandidateServiceKeysFromLabels,
  normalizeMatchReasonCodes,
} from './service-match-learning-pattern';

const SHADOW_EXAMPLE_LIMIT = 50;

export type ShadowSuggestionResult = {
  wouldSuggestServiceKey: string | null;
  /** Winning vote share among pattern-matched examples (0–1); 0 if no examples. */
  similarityScore: number;
  sourceExampleIds: string[];
};

/**
 * Majority vote on final_catalog_service_key among recent examples with the same pattern_key.
 */
export async function computeShadowSuggestion(params: {
  admin: SupabaseClient;
  doctorId: string;
  patternKey: string;
}): Promise<ShadowSuggestionResult> {
  const { admin, doctorId, patternKey } = params;

  const { data, error } = await admin
    .from('service_match_learning_examples')
    .select('id, final_catalog_service_key')
    .eq('doctor_id', doctorId)
    .eq('pattern_key', patternKey)
    .order('created_at', { ascending: false })
    .limit(SHADOW_EXAMPLE_LIMIT);

  if (error) {
    logger.warn({ err: error.message, doctorId }, 'service_match_shadow_query_failed');
    return { wouldSuggestServiceKey: null, similarityScore: 0, sourceExampleIds: [] };
  }

  const rows = (data ?? []) as Array<{ id: string; final_catalog_service_key: string }>;
  if (rows.length === 0) {
    return { wouldSuggestServiceKey: null, similarityScore: 0, sourceExampleIds: [] };
  }

  const voteCounts = new Map<string, number>();
  for (const r of rows) {
    const k = String(r.final_catalog_service_key).trim().toLowerCase();
    if (!k) continue;
    voteCounts.set(k, (voteCounts.get(k) ?? 0) + 1);
  }

  let maxC = 0;
  for (const c of voteCounts.values()) {
    if (c > maxC) maxC = c;
  }
  if (maxC === 0) {
    return { wouldSuggestServiceKey: null, similarityScore: 0, sourceExampleIds: [] };
  }

  /** Tie-break: rows are newest-first; first row whose key has max votes wins (recency bias). */
  let winner: string | null = null;
  for (const r of rows) {
    const k = String(r.final_catalog_service_key).trim().toLowerCase();
    if (!k) continue;
    if ((voteCounts.get(k) ?? 0) === maxC) {
      winner = k;
      break;
    }
  }

  const similarityScore = maxC / rows.length;
  const sourceExampleIds: string[] = [];
  if (winner) {
    for (const r of rows) {
      const k = String(r.final_catalog_service_key).trim().toLowerCase();
      if (k === winner && sourceExampleIds.length < 10) sourceExampleIds.push(r.id);
    }
  }

  return {
    wouldSuggestServiceKey: winner,
    similarityScore,
    sourceExampleIds,
  };
}

export async function recordShadowEvaluationForNewPendingReview(params: {
  doctorId: string;
  conversationId: string;
  reviewRequestId: string;
  state: ConversationState;
  candidateLabels?: Array<{ service_key: string; label: string }>;
  correlationId: string;
}): Promise<void> {
  if (!env.SHADOW_LEARNING_ENABLED) {
    return;
  }

  const proposed = params.state.matcherProposedCatalogServiceKey?.trim();
  if (!proposed) {
    return;
  }

  const { patternKey } = buildPatternKeyFromInputs({
    matchReasonCodes: normalizeMatchReasonCodes(params.state.serviceCatalogMatchReasonCodes),
    candidateServiceKeys: extractCandidateServiceKeysFromLabels(params.candidateLabels ?? []),
    proposedCatalogServiceKey: proposed,
  });

  const admin = getSupabaseAdminClient();
  if (!admin) {
    logger.warn({ correlationId: params.correlationId }, 'service_match_shadow_no_admin');
    return;
  }

  const suggestion = await computeShadowSuggestion({
    admin,
    doctorId: params.doctorId,
    patternKey,
  });

  const { error } = await admin.from('service_match_shadow_evaluations').insert({
    doctor_id: params.doctorId,
    conversation_id: params.conversationId,
    review_request_id: params.reviewRequestId,
    pattern_key: patternKey,
    matcher_proposed_catalog_service_key: proposed.toLowerCase(),
    would_suggest_service_key: suggestion.wouldSuggestServiceKey,
    similarity_score: suggestion.similarityScore,
    source_example_ids: suggestion.sourceExampleIds,
    correlation_id: params.correlationId,
  });

  if (error) {
    const code = (error as { code?: string }).code;
    if (code === '23505') {
      logger.info(
        { correlationId: params.correlationId, reviewRequestId: params.reviewRequestId },
        'service_match_shadow_duplicate_skipped'
      );
      return;
    }
    logger.warn(
      { correlationId: params.correlationId, reviewRequestId: params.reviewRequestId, err: error.message },
      'service_match_shadow_insert_failed'
    );
    return;
  }

  logger.info(
    {
      correlationId: params.correlationId,
      reviewRequestId: params.reviewRequestId,
      wouldSuggest: suggestion.wouldSuggestServiceKey,
      similarityScore: suggestion.similarityScore,
    },
    'service_match_shadow_recorded'
  );
}
