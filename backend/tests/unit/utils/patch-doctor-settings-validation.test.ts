/**
 * Patch Doctor Settings Validation Tests (e-task-6)
 *
 * Tests validatePatchDoctorSettings: payout_schedule, payout_minor.
 */

import { describe, it, expect } from '@jest/globals';
import { validatePatchDoctorSettings } from '../../../src/utils/validation';
import { ValidationError } from '../../../src/utils/errors';

describe('validatePatchDoctorSettings (e-task-6)', () => {
  it('accepts payout_schedule and payout_minor', () => {
    const result = validatePatchDoctorSettings({
      payout_schedule: 'daily',
      payout_minor: 10000,
    });
    expect(result.payout_schedule).toBe('daily');
    expect(result.payout_minor).toBe(10000);
  });

  it('accepts valid payout_schedule values', () => {
    for (const schedule of ['per_appointment', 'daily', 'weekly', 'monthly']) {
      const result = validatePatchDoctorSettings({ payout_schedule: schedule });
      expect(result.payout_schedule).toBe(schedule);
    }
  });

  it('accepts null payout_minor', () => {
    const result = validatePatchDoctorSettings({ payout_minor: null });
    expect(result.payout_minor).toBeNull();
  });

  it('rejects invalid payout_schedule', () => {
    expect(() =>
      validatePatchDoctorSettings({ payout_schedule: 'invalid' })
    ).toThrow(ValidationError);
    expect(() =>
      validatePatchDoctorSettings({ payout_schedule: 'yearly' })
    ).toThrow(ValidationError);
  });

  it('rejects negative payout_minor', () => {
    expect(() =>
      validatePatchDoctorSettings({ payout_minor: -1 })
    ).toThrow(ValidationError);
  });

  it('rejects unknown keys (strict)', () => {
    expect(() =>
      validatePatchDoctorSettings({ payout_schedule: 'daily', unknownKey: 'x' })
    ).toThrow(ValidationError);
  });
});
