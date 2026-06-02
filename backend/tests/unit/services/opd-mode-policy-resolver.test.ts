/**
 * OPD mode_schedule policy resolver (pdm-07 / DL-9)
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  resolveOneDate,
  resolveModePolicyForDateRange,
} from '../../../src/services/opd/opd-mode-service';
import type { ModeSchedule } from '../../../src/types/doctor-settings';
import * as doctorSettingsService from '../../../src/services/doctor-settings-service';
import { ValidationError } from '../../../src/utils/errors';

jest.mock('../../../src/services/doctor-settings-service');

const TZ = 'Asia/Kolkata';

describe('resolveOneDate', () => {
  it('returns null for empty schedule', () => {
    expect(resolveOneDate(null, '2026-05-20', TZ)).toBeNull();
  });

  it('date_overrides match returns mode', () => {
    const schedule: ModeSchedule = {
      date_overrides: [{ date: '2026-05-20', mode: 'queue' }],
    };
    expect(resolveOneDate(schedule, '2026-05-20', TZ)).toBe('queue');
  });

  it('date_overrides duplicate — last-in-array wins', () => {
    const schedule: ModeSchedule = {
      date_overrides: [
        { date: '2026-05-20', mode: 'slot' },
        { date: '2026-05-20', mode: 'queue' },
      ],
    };
    expect(resolveOneDate(schedule, '2026-05-20', TZ)).toBe('queue');
  });

  it('date_range_overrides match when no date_override', () => {
    const schedule: ModeSchedule = {
      date_range_overrides: [{ from: '2026-05-01', to: '2026-05-31', mode: 'queue' }],
    };
    expect(resolveOneDate(schedule, '2026-05-15', TZ)).toBe('queue');
  });

  it('date_range_overrides overlap — last-in-array wins', () => {
    const schedule: ModeSchedule = {
      date_range_overrides: [
        { from: '2026-05-01', to: '2026-05-31', mode: 'slot' },
        { from: '2026-05-10', to: '2026-05-20', mode: 'queue' },
      ],
    };
    expect(resolveOneDate(schedule, '2026-05-15', TZ)).toBe('queue');
  });

  it('weekly_overrides match when no date rules', () => {
    const schedule: ModeSchedule = {
      weekly_overrides: { tue: 'queue' },
    };
    expect(resolveOneDate(schedule, '2026-05-19', TZ)).toBe('queue');
  });

  it('default_mode when nothing else matches', () => {
    const schedule: ModeSchedule = { default_mode: 'queue' };
    expect(resolveOneDate(schedule, '2026-05-20', TZ)).toBe('queue');
  });

  it('date_override beats weekly_override on same date', () => {
    const schedule: ModeSchedule = {
      weekly_overrides: { tue: 'slot' },
      date_overrides: [{ date: '2026-05-19', mode: 'queue' }],
    };
    expect(resolveOneDate(schedule, '2026-05-19', TZ)).toBe('queue');
  });
});

describe('resolveModePolicyForDateRange', () => {
  const doctorId = 'doc-policy-1';
  const supabase = {} as any;

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(doctorSettingsService, 'getDoctorTimezone').mockResolvedValue(TZ);
  });

  it('7-day range with weekly_overrides.tue = queue', async () => {
    jest.spyOn(doctorSettingsService, 'getDoctorSettings').mockResolvedValue({
      opd_policies: {
        mode_schedule: { weekly_overrides: { tue: 'queue' } },
      },
    } as any);

    const map = await resolveModePolicyForDateRange(
      supabase,
      doctorId,
      '2026-05-18',
      '2026-05-24'
    );

    expect(map['2026-05-19']).toBe('queue');
    expect(map['2026-05-18']).toBeNull();
    expect(map['2026-05-20']).toBeNull();
  });

  it('60-day range succeeds', async () => {
    jest.spyOn(doctorSettingsService, 'getDoctorSettings').mockResolvedValue({
      opd_policies: { mode_schedule: { default_mode: 'slot' } },
    } as any);

    const map = await resolveModePolicyForDateRange(
      supabase,
      doctorId,
      '2026-05-01',
      '2026-06-30'
    );
    expect(Object.keys(map).length).toBe(61);
    expect(map['2026-05-01']).toBe('slot');
  });

  it('61-day range throws ValidationError', async () => {
    await expect(
      resolveModePolicyForDateRange(supabase, doctorId, '2026-05-01', '2026-07-01')
    ).rejects.toThrow(ValidationError);
  });
});
