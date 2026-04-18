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

  it('does not capture booking-intent phrasings as name or reason', () => {
    // DM bug 2026-04-18: "i'd like to book an appointment" was captured as both
    // `name` and `reason_for_visit`, then the bot later confirmed
    // "Let me confirm: i d like to book an appoinment ..." instead of the user's real name.
    for (const msg of [
      "i'd like to book an appointment",
      'id like to book an appoinment',
      'i would like to book',
      'i want to book an appointment',
      'please book an appointment',
      'can you book me an appointment',
    ]) {
      const r = extractFieldsFromMessage(msg);
      expect(r.name).toBeUndefined();
      expect(r.reason_for_visit).toBeUndefined();
    }
  });
});
