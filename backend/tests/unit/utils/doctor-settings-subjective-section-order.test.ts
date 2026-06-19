/**
 * subj-24 — doctor_settings subjective_section_order validation.
 */

import { describe, expect, it } from '@jest/globals';
import { validatePatchDoctorSettings } from '../../../src/utils/validation';
import { ValidationError } from '../../../src/utils/errors';
import { SUBJECTIVE_SECTION_ORDER_MAX } from '../../../src/types/subjective-section-order';

describe('doctor settings subjective_section_order (subj-24)', () => {
  it('accepts a valid section order on PATCH', () => {
    const result = validatePatchDoctorSettings({
      subjective_section_order: [
        'chief_complaints',
        'family_history',
        'social_history',
        'free_text_notes',
      ],
    });
    expect(result.subjective_section_order).toEqual([
      'chief_complaints',
      'family_history',
      'social_history',
      'free_text_notes',
    ]);
  });

  it('accepts an empty order array', () => {
    const result = validatePatchDoctorSettings({ subjective_section_order: [] });
    expect(result.subjective_section_order).toEqual([]);
  });

  it('dedupes known ids and preserves first occurrence order', () => {
    const result = validatePatchDoctorSettings({
      subjective_section_order: [
        'social_history',
        'chief_complaints',
        'social_history',
        'chief_complaints',
        'custom_subsections',
      ],
    });
    expect(result.subjective_section_order).toEqual([
      'social_history',
      'chief_complaints',
      'custom_subsections',
    ]);
  });

  it('accepts flattened custom block ids on PATCH', () => {
    const result = validatePatchDoctorSettings({
      subjective_section_order: [
        'chief_complaints',
        'custom_block:aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
        'family_history',
      ],
    });
    expect(result.subjective_section_order).toEqual([
      'chief_complaints',
      'custom_block:aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
      'family_history',
    ]);
  });

  it('drops unknown ids instead of rejecting the PATCH', () => {
    const result = validatePatchDoctorSettings({
      subjective_section_order: [
        'chief_complaints',
        'legacy_removed_section',
        'allergies',
        'not_a_section',
      ],
    });
    expect(result.subjective_section_order).toEqual(['chief_complaints', 'allergies']);
  });

  it('rejects arrays longer than the registry size', () => {
    const tooLong = Array.from({ length: SUBJECTIVE_SECTION_ORDER_MAX + 1 }, (_, i) => `id-${i}`);
    expect(() =>
      validatePatchDoctorSettings({ subjective_section_order: tooLong }),
    ).toThrow(ValidationError);
  });

  it('rejects unknown PATCH keys (strict schema)', () => {
    expect(() =>
      validatePatchDoctorSettings({
        subjective_section_order: ['chief_complaints'],
        subjectiveSectionOrder: ['allergies'],
      }),
    ).toThrow(ValidationError);
  });
});
