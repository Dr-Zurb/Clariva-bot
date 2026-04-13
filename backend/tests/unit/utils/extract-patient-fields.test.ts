/**
 * extract-patient-fields: fallback regex path (when AI returns empty).
 */

import { describe, it, expect } from '@jest/globals';
import { extractFieldsFromMessage } from '../../../src/utils/extract-patient-fields';

describe('extractFieldsFromMessage (fallback)', () => {
  it('extracts reason from i took ... on a composite one-line intake', () => {
    const msg =
      'Abhishek Sahil 46 male 8264602737 i took amlodipine 5mg and telmisartan 40mg';
    const r = extractFieldsFromMessage(msg);
    expect(r.reason_for_visit).toBeDefined();
    expect(r.reason_for_visit).toMatch(/amlodipine|Taking/i);
    expect(r.phone).toBe('8264602737');
  });

  it('extracts i took reason without composite name swallowing reason', () => {
    const msg = 'Firstname Lastname 30 male 9876543210 i took metformin';
    const r = extractFieldsFromMessage(msg);
    expect(r.reason_for_visit).toMatch(/metformin|Taking/i);
  });
});
