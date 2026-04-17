/**
 * learn-02: feature snapshot shape + idempotent ingest (mocked Supabase).
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  buildServiceMatchLearningFeatureSnapshot,
  pickMatcherFieldsFromConversationState,
  ingestServiceMatchLearningExample,
} from '../../../src/services/service-match-learning-ingest';
import type { ConversationState } from '../../../src/types/conversation';
import * as database from '../../../src/config/database';

jest.mock('../../../src/config/database');

const mockedDb = database as jest.Mocked<typeof database>;

describe('service-match-learning-ingest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('buildServiceMatchLearningFeatureSnapshot separates review row vs state', () => {
    const row = {
      id: 'rr-1',
      doctor_id: 'd-1',
      correlation_id: 'c-1',
      proposed_catalog_service_key: 'general',
      proposed_catalog_service_id: 'sid-1',
      proposed_consultation_modality: 'video' as const,
      match_confidence: 'low' as const,
      match_reason_codes: ['ambiguous_complaint'],
      candidate_labels: [{ service_key: 'general', label: 'General' }],
      final_catalog_service_key: 'acute',
      final_catalog_service_id: 'sid-2',
      final_consultation_modality: 'video' as const,
      resolved_at: '2026-03-31T12:00:00.000Z',
    };
    const state: ConversationState = {
      serviceCatalogMatchReasonCodes: ['ambiguous_complaint', 'staff_reassigned_service'],
      catalogServiceKey: 'acute',
      reasonForVisit: 'SHOULD NOT APPEAR IN SNAPSHOT',
    };
    const snap = buildServiceMatchLearningFeatureSnapshot({
      row,
      conversationStateAfterResolution: state,
    });
    expect(snap.review_row_at_resolution).toMatchObject({
      proposed_catalog_service_key: 'general',
      final_catalog_service_key: 'acute',
      match_reason_codes: ['ambiguous_complaint'],
    });
    expect(snap.conversation_state_after_resolution).toEqual(
      pickMatcherFieldsFromConversationState(state)
    );
    expect(JSON.stringify(snap)).not.toContain('SHOULD NOT');
  });

  it('ingestServiceMatchLearningExample skips duplicate (23505)', async () => {
    const from = jest.fn().mockReturnValue({
      insert: jest.fn().mockResolvedValue({
        error: { code: '23505', message: 'duplicate' },
      } as never),
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);

    await ingestServiceMatchLearningExample({
      row: {
        id: 'rr-1',
        doctor_id: 'd-1',
        correlation_id: 'c-1',
        proposed_catalog_service_key: 'a',
        proposed_catalog_service_id: null,
        proposed_consultation_modality: null,
        match_confidence: 'medium',
        match_reason_codes: [],
        candidate_labels: [],
        final_catalog_service_key: 'a',
        final_catalog_service_id: null,
        final_consultation_modality: null,
        resolved_at: '2026-03-31T12:00:00.000Z',
      },
      conversationStateAfterResolution: {},
      action: 'confirmed',
      correlationId: 'corr',
    });

    expect(from).toHaveBeenCalledWith('service_match_learning_examples');
  });

  it('ingestServiceMatchLearningExample inserts once when no error', async () => {
    const insert = jest.fn().mockResolvedValue({ error: null } as never);
    const from = jest.fn().mockReturnValue({ insert });
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);

    await ingestServiceMatchLearningExample({
      row: {
        id: 'rr-2',
        doctor_id: 'd-1',
        correlation_id: null,
        proposed_catalog_service_key: 'x',
        proposed_catalog_service_id: null,
        proposed_consultation_modality: null,
        match_confidence: 'high',
        match_reason_codes: [],
        candidate_labels: [],
        final_catalog_service_key: 'y',
        final_catalog_service_id: null,
        final_consultation_modality: null,
        resolved_at: '2026-03-31T12:00:00.000Z',
      },
      conversationStateAfterResolution: { serviceCatalogMatchConfidence: 'high' },
      action: 'reassigned',
      correlationId: 'corr2',
    });

    expect(insert).toHaveBeenCalledTimes(1);
    const payload = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.action).toBe('reassigned');
    expect(payload.proposed_catalog_service_key).toBe('x');
    expect(payload.final_catalog_service_key).toBe('y');
    expect(payload.feature_snapshot).toBeDefined();
    expect(typeof payload.pattern_key).toBe('string');
    expect((payload.pattern_key as string).length).toBe(64);
  });

  // Task 10 (Plan 03): ingest is gated by `isLearningActiveForDoctor` which reads
  // `doctor_settings.catalog_mode`. For single-fee doctors we must NOT insert a learning example,
  // even if an (orphan) review row somehow made it through.
  it('Task 10: skips insert when doctor_settings.catalog_mode === "single_fee"', async () => {
    const insert = jest.fn().mockResolvedValue({ error: null } as never);
    const from = jest.fn().mockImplementation((table) => {
      if (table === 'doctor_settings') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest
            .fn()
            .mockResolvedValue({ data: { catalog_mode: 'single_fee' }, error: null } as never),
        };
      }
      return { insert };
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);

    await ingestServiceMatchLearningExample({
      row: {
        id: 'rr-3',
        doctor_id: 'd-single-fee',
        correlation_id: null,
        proposed_catalog_service_key: 'consultation',
        proposed_catalog_service_id: null,
        proposed_consultation_modality: null,
        match_confidence: 'high',
        match_reason_codes: [],
        candidate_labels: [],
        final_catalog_service_key: 'consultation',
        final_catalog_service_id: null,
        final_consultation_modality: null,
        resolved_at: '2026-04-16T12:00:00.000Z',
      },
      conversationStateAfterResolution: {},
      action: 'confirmed',
      correlationId: 'corr-t10-ingest-skip',
    });

    expect(insert).not.toHaveBeenCalled();
  });
});
