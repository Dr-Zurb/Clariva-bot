import { describe, expect, it } from '@jest/globals';
import {
  applyTagOp,
  coercePatientTags,
  normalizeTagList,
  patientHasTag,
  unappliedAddLabels,
} from '../../../src/utils/patient-tags';

describe('patient-tags', () => {
  it('normalizes and dedupes case-insensitively', () => {
    expect(normalizeTagList([' VIP ', 'vip', 'Follow-up', ''])).toEqual([
      'VIP',
      'Follow-up',
    ]);
  });

  it('coerces legacy patient_tag', () => {
    expect(coercePatientTags([], 'VIP')).toEqual(['VIP']);
    expect(coercePatientTags(['A', 'B'], 'VIP')).toEqual(['A', 'B']);
  });

  it('add / remove / clear', () => {
    expect(applyTagOp(['VIP'], 'add', ['Follow-up'])).toEqual(['VIP', 'Follow-up']);
    expect(applyTagOp(['VIP', 'Follow-up'], 'remove', ['vip'])).toEqual(['Follow-up']);
    expect(applyTagOp(['VIP'], 'clear', [])).toEqual([]);
  });

  it('membership is case-insensitive', () => {
    expect(patientHasTag(['VIP', 'Follow-up'], 'vip')).toBe(true);
    expect(patientHasTag(['VIP'], 'Other')).toBe(false);
  });

  it('unappliedAddLabels reports max-8 drops', () => {
    const full = ['1', '2', '3', '4', '5', '6', '7', '8'];
    expect(unappliedAddLabels(full, ['VIP'])).toEqual(['VIP']);
    expect(unappliedAddLabels(['VIP'], ['vip'])).toEqual([]);
    expect(unappliedAddLabels(['1', '2', '3', '4', '5', '6', '7'], ['A', 'B'])).toEqual([
      'B',
    ]);
  });
});
