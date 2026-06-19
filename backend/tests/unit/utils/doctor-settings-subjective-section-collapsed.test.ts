/**
 * subj-28 — doctor_settings subjective_section_collapsed validation.
 */

import { describe, expect, it } from '@jest/globals';
import { validatePatchDoctorSettings } from '../../../src/utils/validation';
import { ValidationError } from '../../../src/utils/errors';
import { SUBJECTIVE_SECTION_ORDER_MAX } from '../../../src/types/subjective-section-order';

describe('doctor settings subjective_section_collapsed (subj-28)', () => {
  it('accepts a valid collapse map on PATCH', () => {
    const result = validatePatchDoctorSettings({
      subjective_section_collapsed: {
        chief_complaints: true,
        family_history: false,
        free_text_notes: true,
      },
    });
    expect(result.subjective_section_collapsed).toEqual({
      chief_complaints: true,
      family_history: false,
      free_text_notes: true,
    });
  });

  it('accepts an empty map', () => {
    const result = validatePatchDoctorSettings({ subjective_section_collapsed: {} });
    expect(result.subjective_section_collapsed).toEqual({});
  });

  it('accepts flattened custom block ids as keys', () => {
    const result = validatePatchDoctorSettings({
      subjective_section_collapsed: {
        'custom_block:aaaaaaaa-aaaa-4aaa-8aaa-000000000001': false,
      },
    });
    expect(result.subjective_section_collapsed).toEqual({
      'custom_block:aaaaaaaa-aaaa-4aaa-8aaa-000000000001': false,
    });
  });

  it('drops unknown keys instead of rejecting the PATCH', () => {
    const result = validatePatchDoctorSettings({
      subjective_section_collapsed: {
        chief_complaints: false,
        legacy_removed_section: true,
        not_a_section: false,
        allergies: true,
      },
    });
    expect(result.subjective_section_collapsed).toEqual({
      chief_complaints: false,
      allergies: true,
    });
  });

  it('skips non-boolean values instead of rejecting the PATCH', () => {
    const result = validatePatchDoctorSettings({
      subjective_section_collapsed: {
        chief_complaints: true,
        allergies: 'nope',
        family_history: 1,
        social_history: null,
        free_text_notes: false,
      },
    });
    expect(result.subjective_section_collapsed).toEqual({
      chief_complaints: true,
      free_text_notes: false,
    });
  });

  it('rejects maps with more entries than the registry size', () => {
    const tooBig: Record<string, boolean> = {};
    for (let i = 0; i < SUBJECTIVE_SECTION_ORDER_MAX + 1; i += 1) {
      tooBig[`id-${i}`] = true;
    }
    expect(() =>
      validatePatchDoctorSettings({ subjective_section_collapsed: tooBig }),
    ).toThrow(ValidationError);
  });

  it('rejects unknown PATCH keys (strict schema)', () => {
    expect(() =>
      validatePatchDoctorSettings({
        subjective_section_collapsed: { chief_complaints: true },
        subjectiveSectionCollapsed: { allergies: false },
      }),
    ).toThrow(ValidationError);
  });
});
