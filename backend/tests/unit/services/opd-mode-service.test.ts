/**
 * OPD mode resolution (e-task-opd-03, pdm-02)
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  resolveOpdModeFromSettings,
  resolveSessionDayMode,
} from '../../../src/services/opd/opd-mode-service';
import * as doctorSettingsService from '../../../src/services/doctor-settings-service';

jest.mock('../../../src/services/doctor-settings-service');

describe('resolveOpdModeFromSettings', () => {
  it('defaults to slot when null', () => {
    expect(resolveOpdModeFromSettings(null)).toBe('slot');
    expect(resolveOpdModeFromSettings(undefined)).toBe('slot');
  });

  it('respects queue when set', () => {
    expect(resolveOpdModeFromSettings({ opd_mode: 'queue' } as any)).toBe('queue');
  });

  it('treats slot explicitly', () => {
    expect(resolveOpdModeFromSettings({ opd_mode: 'slot' } as any)).toBe('slot');
  });
});

describe('resolveSessionDayMode (pdm-02)', () => {
  const doctorId = 'doc-1';
  const date = '2026-05-17';

  function mockSupabase(factRow: { mode: string; change_count: number } | null, factError: unknown = null) {
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: factRow, error: factError } as never),
    };
    return {
      from: jest.fn().mockReturnValue(chain),
    } as any;
  }

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns fact row when present', async () => {
    const supabase = mockSupabase({ mode: 'queue', change_count: 2 });
    const result = await resolveSessionDayMode(supabase, doctorId, date);
    expect(result).toEqual({ mode: 'queue', source: 'fact', changeCount: 2 });
  });

  it('falls through to policy when no fact row (pdm-07)', async () => {
    const supabase = mockSupabase(null);
    jest.spyOn(doctorSettingsService, 'getDoctorSettings').mockResolvedValue({
      opd_mode: 'slot',
      opd_policies: {
        mode_schedule: { date_overrides: [{ date, mode: 'queue' }] },
      },
    } as any);
    jest.spyOn(doctorSettingsService, 'getDoctorTimezone').mockResolvedValue('Asia/Kolkata');
    const result = await resolveSessionDayMode(supabase, doctorId, date);
    expect(result).toEqual({ mode: 'queue', source: 'policy', changeCount: 0 });
  });

  it('falls through to doctor_settings when no fact row', async () => {
    const supabase = mockSupabase(null);
    jest.spyOn(doctorSettingsService, 'getDoctorSettings').mockResolvedValue({
      opd_mode: 'queue',
    } as any);
    jest.spyOn(doctorSettingsService, 'getDoctorTimezone').mockResolvedValue('Asia/Kolkata');
    const result = await resolveSessionDayMode(supabase, doctorId, date);
    expect(result).toEqual({ mode: 'queue', source: 'doctor_settings', changeCount: 0 });
  });

  it('defaults to slot when no fact and no settings mode', async () => {
    const supabase = mockSupabase(null);
    jest.spyOn(doctorSettingsService, 'getDoctorSettings').mockResolvedValue(null);
    jest.spyOn(doctorSettingsService, 'getDoctorTimezone').mockResolvedValue('Asia/Kolkata');
    const result = await resolveSessionDayMode(supabase, doctorId, date);
    expect(result).toEqual({ mode: 'slot', source: 'default', changeCount: 0 });
  });
});
