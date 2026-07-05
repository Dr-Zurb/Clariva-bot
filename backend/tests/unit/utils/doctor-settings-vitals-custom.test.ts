/**
 * vit-14 — doctor_settings.vitals_custom validation (per-doctor custom-vital
 * definitions). Definitions only (labels/units/group), never PHI.
 */

import { describe, expect, it } from '@jest/globals';
import { validatePatchDoctorSettings } from '../../../src/utils/validation';
import { ValidationError } from '../../../src/utils/errors';
import { CUSTOM_VITALS_MAX } from '../../../src/types/doctor-settings';

describe('doctor settings vitals_custom (vit-14)', () => {
  it('accepts a valid numeric custom-vital definition on PATCH', () => {
    const result = validatePatchDoctorSettings({
      vitals_custom: [
        { id: 'custom_abc', label: 'Abdominal girth', unit: 'cm', kind: 'numeric', group: 'core' },
      ],
    });
    expect(result.vitals_custom).toEqual([
      { id: 'custom_abc', label: 'Abdominal girth', unit: 'cm', kind: 'numeric', group: 'core' },
    ]);
  });

  it('normalizes a blank/absent unit to null (text vitals carry no unit)', () => {
    const result = validatePatchDoctorSettings({
      vitals_custom: [
        { id: 'custom_note', label: 'Gait', kind: 'text', group: 'neuro' },
        { id: 'custom_blank', label: 'Mood', unit: '   ', kind: 'text', group: 'neuro' },
      ],
    });
    expect(result.vitals_custom).toEqual([
      { id: 'custom_note', label: 'Gait', unit: null, kind: 'text', group: 'neuro' },
      { id: 'custom_blank', label: 'Mood', unit: null, kind: 'text', group: 'neuro' },
    ]);
  });

  it('accepts an empty definition list', () => {
    const result = validatePatchDoctorSettings({ vitals_custom: [] });
    expect(result.vitals_custom).toEqual([]);
  });

  it('dedupes by id (last write wins)', () => {
    const result = validatePatchDoctorSettings({
      vitals_custom: [
        { id: 'custom_x', label: 'First', unit: 'cm', kind: 'numeric', group: 'core' },
        { id: 'custom_x', label: 'Second', unit: 'mm', kind: 'numeric', group: 'metabolic' },
      ],
    });
    expect(result.vitals_custom).toEqual([
      { id: 'custom_x', label: 'Second', unit: 'mm', kind: 'numeric', group: 'metabolic' },
    ]);
  });

  it('rejects an unknown kind', () => {
    expect(() =>
      validatePatchDoctorSettings({
        vitals_custom: [
          { id: 'custom_a', label: 'X', kind: 'boolean' as unknown as 'numeric', group: 'core' },
        ],
      }),
    ).toThrow(ValidationError);
  });

  it('rejects an unknown group', () => {
    expect(() =>
      validatePatchDoctorSettings({
        vitals_custom: [
          {
            id: 'custom_a',
            label: 'X',
            kind: 'numeric',
            group: 'cardiac' as unknown as 'core',
          },
        ],
      }),
    ).toThrow(ValidationError);
  });

  it('rejects an empty label', () => {
    expect(() =>
      validatePatchDoctorSettings({
        vitals_custom: [{ id: 'custom_a', label: '   ', kind: 'numeric', group: 'core' }],
      }),
    ).toThrow(ValidationError);
  });

  it('rejects an extra/unknown property on a definition (strict)', () => {
    expect(() =>
      validatePatchDoctorSettings({
        vitals_custom: [
          {
            id: 'custom_a',
            label: 'X',
            kind: 'numeric',
            group: 'core',
            value: 42 as unknown as undefined,
          },
        ],
      }),
    ).toThrow(ValidationError);
  });

  it('rejects a list longer than the cap', () => {
    const tooMany = Array.from({ length: CUSTOM_VITALS_MAX + 1 }, (_, i) => ({
      id: `custom_${i}`,
      label: `Vital ${i}`,
      kind: 'numeric' as const,
      group: 'core' as const,
    }));
    expect(() => validatePatchDoctorSettings({ vitals_custom: tooMany })).toThrow(ValidationError);
  });
});
