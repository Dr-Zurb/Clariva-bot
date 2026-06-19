/**
 * subj-32 — doctor_settings subjective_section_hidden validation.
 */

import { describe, expect, it } from '@jest/globals';
import { validatePatchDoctorSettings } from '../../../src/utils/validation';
import { ValidationError } from '../../../src/utils/errors';
import { SUBJECTIVE_SECTION_ORDER_MAX } from '../../../src/types/subjective-section-order';

describe('doctor settings subjective_section_hidden (subj-32)', () => {
  it('accepts a valid hidden set on PATCH', () => {
    const result = validatePatchDoctorSettings({
      subjective_section_hidden: ['family_history', 'social_history'],
    });
    expect(result.subjective_section_hidden).toEqual(['family_history', 'social_history']);
  });

  it('accepts an empty hidden array', () => {
    const result = validatePatchDoctorSettings({ subjective_section_hidden: [] });
    expect(result.subjective_section_hidden).toEqual([]);
  });

  it('dedupes known ids and preserves first occurrence order', () => {
    const result = validatePatchDoctorSettings({
      subjective_section_hidden: [
        'social_history',
        'allergies',
        'social_history',
        'allergies',
        'past_surgical',
      ],
    });
    expect(result.subjective_section_hidden).toEqual([
      'social_history',
      'allergies',
      'past_surgical',
    ]);
  });

  it('keeps a valid custom_block id (P11-D2)', () => {
    const result = validatePatchDoctorSettings({
      subjective_section_hidden: [
        'chief_complaints',
        'custom_block:aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
        'family_history',
      ],
    });
    expect(result.subjective_section_hidden).toEqual([
      'chief_complaints',
      'custom_block:aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
      'family_history',
    ]);
  });

  it('drops unknown ids instead of rejecting the PATCH', () => {
    const result = validatePatchDoctorSettings({
      subjective_section_hidden: [
        'chief_complaints',
        'legacy_removed_section',
        'allergies',
        'not_a_section',
      ],
    });
    expect(result.subjective_section_hidden).toEqual(['chief_complaints', 'allergies']);
  });

  it('rejects arrays longer than the registry size', () => {
    const tooLong = Array.from({ length: SUBJECTIVE_SECTION_ORDER_MAX + 1 }, (_, i) => `id-${i}`);
    expect(() =>
      validatePatchDoctorSettings({ subjective_section_hidden: tooLong }),
    ).toThrow(ValidationError);
  });

  it('rejects unknown PATCH keys (strict schema)', () => {
    expect(() =>
      validatePatchDoctorSettings({
        subjective_section_hidden: ['chief_complaints'],
        subjectiveSectionHidden: ['allergies'],
      }),
    ).toThrow(ValidationError);
  });
});
