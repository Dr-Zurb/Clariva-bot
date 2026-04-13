/**
 * extract-patient-fields: regex extraction + booking confirmation detection.
 */

import { describe, it, expect } from '@jest/globals';
import {
  extractFieldsFromMessage,
  isBookingConfirmationOnlyMessage,
} from '../../../src/utils/extract-patient-fields';

describe('isBookingConfirmationOnlyMessage', () => {
  it('detects pure confirmation phrases', () => {
    expect(isBookingConfirmationOnlyMessage('yes confirm that')).toBe(true);
    expect(isBookingConfirmationOnlyMessage('Yes, that\'s correct.')).toBe(true);
    expect(isBookingConfirmationOnlyMessage('correct')).toBe(true);
    expect(isBookingConfirmationOnlyMessage('yeah please confirm')).toBe(true);
  });

  it('returns false for substantive patient content', () => {
    expect(isBookingConfirmationOnlyMessage('yes I have stomach pain')).toBe(false);
    expect(isBookingConfirmationOnlyMessage('Abhishek Sahil 46 male')).toBe(false);
    expect(isBookingConfirmationOnlyMessage('i took amlodipine 5mg')).toBe(false);
  });
});

describe('extractFieldsFromMessage', () => {
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
