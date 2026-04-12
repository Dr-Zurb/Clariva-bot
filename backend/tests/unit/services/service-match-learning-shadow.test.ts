/**
 * learn-03: shadow suggestion vote logic (mocked Supabase chain).
 */

import { describe, it, expect, jest } from '@jest/globals';
import { computeShadowSuggestion } from '../../../src/services/service-match-learning-shadow';

describe('service-match-learning-shadow', () => {
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
});
