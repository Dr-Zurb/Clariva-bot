/**
 * vit-07 — doctor_settings.vitals_hidden validation (per-doctor hidden vitals set).
 * Registry vital-key strings only — not PHI.
 */

import { describe, expect, it } from '@jest/globals';
import { validatePatchDoctorSettings } from '../../../src/utils/validation';
import { ValidationError } from '../../../src/utils/errors';
import { VITALS_HIDDEN_MAX } from '../../../src/types/vitals-hidden';

describe('doctor settings vitals_hidden (vit-07)', () => {
  it('accepts a valid hidden set on PATCH', () => {
    const result = validatePatchDoctorSettings({
      vitals_hidden: ['vitalsHr', 'vitalsGcsTotal'],
    });
    expect(result.vitals_hidden).toEqual(['vitalsHr', 'vitalsGcsTotal']);
  });

  it('accepts an empty hidden set', () => {
    const result = validatePatchDoctorSettings({ vitals_hidden: [] });
    expect(result.vitals_hidden).toEqual([]);
  });

  it('dedupes + drops unknown ids', () => {
    const result = validatePatchDoctorSettings({
      vitals_hidden: ['vitalsHr', 'vitalsHr', 'bogus', 'vitalsGcsTotal'],
    });
    expect(result.vitals_hidden).toEqual(['vitalsHr', 'vitalsGcsTotal']);
  });

  it('rejects arrays longer than the registry size', () => {
    const tooLong = Array.from({ length: VITALS_HIDDEN_MAX + 1 }, (_, i) => `id-${i}`);
    expect(() => validatePatchDoctorSettings({ vitals_hidden: tooLong })).toThrow(
      ValidationError,
    );
  });
});
