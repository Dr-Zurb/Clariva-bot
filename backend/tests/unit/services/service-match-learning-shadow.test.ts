/**
 * learn-03: shadow suggestion vote logic (mocked Supabase chain).
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  computeShadowSuggestion,
  recordShadowEvaluationForNewPendingReview,
} from '../../../src/services/service-match-learning-shadow';
import * as database from '../../../src/config/database';

jest.mock('../../../src/config/database');

const mockedDb = database as jest.Mocked<typeof database>;

describe('service-match-learning-shadow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('computeShadowSuggestion picks majority final key (newest-first tie)', async () => {
    const rows = [
      { id: 'e1', final_catalog_service_key: 'a' },
      { id: 'e2', final_catalog_service_key: 'b' },
      { id: 'e3', final_catalog_service_key: 'b' },
    ];
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: rows, error: null } as never),
    };
    const from = jest.fn().mockReturnValue(chain);

    const out = await computeShadowSuggestion({
      admin: { from } as never,
      doctorId: 'd1',
      patternKey: 'pk1',
    });

    expect(out.wouldSuggestServiceKey).toBe('b');
    expect(out.similarityScore).toBeCloseTo(2 / 3);
    expect(out.sourceExampleIds).toEqual(['e2', 'e3']);
    expect(from).toHaveBeenCalledWith('service_match_learning_examples');
  });

  it('computeShadowSuggestion returns null when no examples', async () => {
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: [], error: null } as never),
    };
    const from = jest.fn().mockReturnValue(chain);
    const out = await computeShadowSuggestion({
      admin: { from } as never,
      doctorId: 'd1',
      patternKey: 'empty',
    });
    expect(out.wouldSuggestServiceKey).toBeNull();
    expect(out.similarityScore).toBe(0);
    expect(out.sourceExampleIds).toEqual([]);
  });

  // Task 10 (Plan 03): shadow evaluations for single-fee doctors would be orphaned (no review
  // row FK). Skip them at the entry point with a breadcrumb log.
  it('Task 10: recordShadowEvaluationForNewPendingReview skips when catalog_mode === "single_fee"', async () => {
    const insert = jest.fn();
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

    await recordShadowEvaluationForNewPendingReview({
      doctorId: 'd-single-fee',
      conversationId: 'conv-1',
      reviewRequestId: 'rr-1',
      state: {
        matcherProposedCatalogServiceKey: 'consultation',
        serviceCatalogMatchReasonCodes: [],
      },
      candidateLabels: [],
      correlationId: 'corr-t10-shadow',
    });

    expect(insert).not.toHaveBeenCalled();
  });
});
