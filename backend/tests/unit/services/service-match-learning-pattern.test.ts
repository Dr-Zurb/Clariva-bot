import { describe, it, expect } from '@jest/globals';
import {
  buildPatternKeyFromInputs,
  extractCandidateServiceKeysFromLabels,
  normalizeMatchReasonCodes,
} from '../../../src/services/service-match-learning-pattern';

describe('service-match-learning-pattern', () => {
  it('same inputs produce same patternKey', () => {
    const a = buildPatternKeyFromInputs({
      matchReasonCodes: ['b', 'a'],
      candidateServiceKeys: ['z', 'y'],
      proposedCatalogServiceKey: 'General',
    });
    const b = buildPatternKeyFromInputs({
      matchReasonCodes: ['a', 'b'],
      candidateServiceKeys: ['y', 'z'],
      proposedCatalogServiceKey: 'general',
    });
    expect(a.patternKey).toBe(b.patternKey);
    expect(a.patternKey).toHaveLength(64);
  });

  it('different proposed key changes patternKey', () => {
    const a = buildPatternKeyFromInputs({
      matchReasonCodes: ['x'],
      candidateServiceKeys: [],
      proposedCatalogServiceKey: 'a',
    });
    const b = buildPatternKeyFromInputs({
      matchReasonCodes: ['x'],
      candidateServiceKeys: [],
      proposedCatalogServiceKey: 'b',
    });
    expect(a.patternKey).not.toBe(b.patternKey);
  });

  it('normalizeMatchReasonCodes sorts and dedupes', () => {
    expect(normalizeMatchReasonCodes(['z', 'a', 'a'])).toEqual(['a', 'z']);
  });

  it('extractCandidateServiceKeysFromLabels reads service_key', () => {
    expect(
      extractCandidateServiceKeysFromLabels([
        { service_key: 'beta', label: 'B' },
        { service_key: 'alpha', label: 'A' },
      ])
    ).toEqual(['alpha', 'beta']);
  });
});
