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

  it('accepts opd_mode and opd_policies (e-task-opd-02)', () => {
    const result = validatePatchDoctorSettings({
      opd_mode: 'queue',
      opd_policies: { slot_join_grace_minutes: 5 },
    });
    expect(result.opd_mode).toBe('queue');
    expect(result.opd_policies).toEqual({ slot_join_grace_minutes: 5 });
  });

  it('accepts null opd_policies', () => {
    const result = validatePatchDoctorSettings({ opd_policies: null });
    expect(result.opd_policies).toBeNull();
  });

  it('accepts instagram_receptionist_paused and pause message (RBH-09)', () => {
    const result = validatePatchDoctorSettings({
      instagram_receptionist_paused: true,
      instagram_receptionist_pause_message: 'We will reply soon.',
    });
    expect(result.instagram_receptionist_paused).toBe(true);
    expect(result.instagram_receptionist_pause_message).toBe('We will reply soon.');
  });

  it('rejects pause message over 500 chars', () => {
    expect(() =>
      validatePatchDoctorSettings({
        instagram_receptionist_pause_message: 'x'.repeat(501),
      })
    ).toThrow(ValidationError);
  });

  it('rejects invalid opd_mode', () => {
    expect(() =>
      validatePatchDoctorSettings({ opd_mode: 'hybrid' as 'slot' })
    ).toThrow(ValidationError);
  });
});
