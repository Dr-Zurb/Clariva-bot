/**
 * obj-10 — doctor_settings objective layout config validation.
 */

import { describe, expect, it } from '@jest/globals';
import { validatePatchDoctorSettings } from '../../../src/utils/validation';
import { ValidationError } from '../../../src/utils/errors';
import { OBJECTIVE_SECTION_ORDER_MAX } from '../../../src/types/objective-section-order';

describe('doctor settings objective_section_order (obj-10)', () => {
  it('accepts a valid section order on PATCH', () => {
    const result = validatePatchDoctorSettings({
      objective_section_order: ['vitals', 'exam', 'test_results', 'legacy_exam'],
    });
    expect(result.objective_section_order).toEqual([
      'vitals',
      'exam',
      'test_results',
      'legacy_exam',
    ]);
  });

  it('accepts an empty order array', () => {
    const result = validatePatchDoctorSettings({ objective_section_order: [] });
    expect(result.objective_section_order).toEqual([]);
  });

  it('dedupes known ids and preserves first occurrence order', () => {
    const result = validatePatchDoctorSettings({
      objective_section_order: ['exam', 'vitals', 'exam', 'vitals', 'legacy_vitals'],
    });
    expect(result.objective_section_order).toEqual(['exam', 'vitals', 'legacy_vitals']);
  });

  it('accepts flattened custom block ids on PATCH', () => {
    const result = validatePatchDoctorSettings({
      objective_section_order: [
        'vitals',
        'custom_block:aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
        'exam',
      ],
    });
    expect(result.objective_section_order).toEqual([
      'vitals',
      'custom_block:aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
      'exam',
    ]);
  });

  it('drops unknown ids instead of rejecting the PATCH', () => {
    const result = validatePatchDoctorSettings({
      objective_section_order: ['vitals', 'chief_complaints', 'exam', 'not_a_section'],
    });
    expect(result.objective_section_order).toEqual(['vitals', 'exam']);
  });

  it('rejects arrays longer than the registry size', () => {
    const tooLong = Array.from({ length: OBJECTIVE_SECTION_ORDER_MAX + 1 }, (_, i) => `id-${i}`);
    expect(() =>
      validatePatchDoctorSettings({ objective_section_order: tooLong }),
    ).toThrow(ValidationError);
  });
});

describe('doctor settings objective_section_collapsed (obj-10)', () => {
  it('keeps only known section ids with boolean values', () => {
    const result = validatePatchDoctorSettings({
      objective_section_collapsed: {
        vitals: true,
        exam: false,
        not_a_section: true,
        legacy_exam: 'nope' as unknown as boolean,
      },
    });
    expect(result.objective_section_collapsed).toEqual({ vitals: true, exam: false });
  });

  it('accepts an empty collapse map', () => {
    const result = validatePatchDoctorSettings({ objective_section_collapsed: {} });
    expect(result.objective_section_collapsed).toEqual({});
  });
});

describe('doctor settings objective_section_hidden (obj-10)', () => {
  it('dedupes + drops unknown ids', () => {
    const result = validatePatchDoctorSettings({
      objective_section_hidden: ['legacy_exam', 'legacy_exam', 'bogus', 'legacy_vitals'],
    });
    expect(result.objective_section_hidden).toEqual(['legacy_exam', 'legacy_vitals']);
  });
});

describe('doctor settings objective_custom_sections (obj-10)', () => {
  it('accepts a valid custom-section tree on PATCH', () => {
    const id = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000099';
    const result = validatePatchDoctorSettings({
      objective_custom_sections: [{ id, title: 'Point of care', body: 'USG abdomen' }],
    });
    expect(result.objective_custom_sections).toEqual([
      { id, title: 'Point of care', body: 'USG abdomen', children: [] },
    ]);
  });
});

describe('doctor settings objective layout (obj-10) strictness', () => {
  it('rejects unknown PATCH keys (strict schema)', () => {
    expect(() =>
      validatePatchDoctorSettings({
        objective_section_order: ['vitals'],
        objectiveSectionOrder: ['exam'],
      }),
    ).toThrow(ValidationError);
  });
});
