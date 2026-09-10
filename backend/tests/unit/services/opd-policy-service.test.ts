/**
 * OPD policy helpers (OPD-08)
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  DEFAULT_SLOT_JOIN_GRACE_MINUTES,
  getSlotJoinGraceMinutes,
  getReschedulePaymentPolicy,
  getQueueReinsertDefault,
  assertSlotJoinAllowedForPatient,
} from '../../../src/services/opd/opd-policy-service';
import type { DoctorSettingsRow } from '../../../src/types/doctor-settings';
import * as database from '../../../src/config/database';
import * as doctorSettings from '../../../src/services/doctor-settings-service';
import * as opdMode from '../../../src/services/opd/opd-mode-service';

jest.mock('../../../src/config/database');
jest.mock('../../../src/services/doctor-settings-service');
jest.mock('../../../src/services/opd/opd-mode-service');

const mockedDb = database as jest.Mocked<typeof database>;
const mockedDoctorSettings = doctorSettings as jest.Mocked<typeof doctorSettings>;
const mockedOpdMode = opdMode as jest.Mocked<typeof opdMode>;

function baseSettings(overrides: Partial<DoctorSettingsRow> = {}): DoctorSettingsRow {
  return {
    doctor_id: 'd1',
    appointment_fee_minor: null,
    appointment_fee_currency: null,
    country: null,
    practice_name: null,
    timezone: 'Asia/Kolkata',
    slot_interval_minutes: 15,
    max_advance_booking_days: 30,
    min_advance_hours: 0,
    business_hours_summary: null,
    cancellation_policy_hours: null,
    max_appointments_per_day: null,
    booking_buffer_minutes: null,
    welcome_message: null,
    specialty: null,
    address_summary: null,
    consultation_types: null,
    service_offerings_json: null,
    default_notes: null,
    payout_schedule: null,
    payout_minor: null,
    razorpay_linked_account_id: null,
    opd_mode: 'slot',
    opd_policies: null,
    instagram_receptionist_paused: false,
    instagram_receptionist_pause_message: null,
    catalog_mode: null,
    patient_flow_advance: 'countdown',
    auto_no_show_after_min: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  } as DoctorSettingsRow;
}

function makeAdminMock(opts: {
  appointment: Record<string, unknown> | null;
  liveSession?: { id: string } | null;
}) {
  const appointmentsChain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({
      data: opts.appointment,
      error: null,
    } as never),
  };
  const sessionsChain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({
      data: opts.liveSession === undefined ? null : opts.liveSession,
      error: null,
    } as never),
  };
  const from = jest.fn().mockImplementation((table: unknown) => {
    if (table === 'consultation_sessions') return sessionsChain;
    return appointmentsChain;
  });
  return { from };
}

describe('getSlotJoinGraceMinutes', () => {
  it('uses default when policies missing', () => {
    expect(getSlotJoinGraceMinutes(baseSettings())).toBe(DEFAULT_SLOT_JOIN_GRACE_MINUTES);
  });

  it('reads slot_join_grace_minutes from opd_policies', () => {
    expect(
      getSlotJoinGraceMinutes(
        baseSettings({ opd_policies: { slot_join_grace_minutes: 20 } as Record<string, unknown> })
      )
    ).toBe(20);
  });

  it('rejects out-of-range grace', () => {
    expect(
      getSlotJoinGraceMinutes(
        baseSettings({ opd_policies: { slot_join_grace_minutes: 99999 } as Record<string, unknown> })
      )
    ).toBe(DEFAULT_SLOT_JOIN_GRACE_MINUTES);
  });
});

describe('getReschedulePaymentPolicy', () => {
  it('defaults to forfeit', () => {
    expect(getReschedulePaymentPolicy(baseSettings())).toBe('forfeit');
  });

  it('honors transfer_entitlement', () => {
    expect(
      getReschedulePaymentPolicy(
        baseSettings({
          opd_policies: { reschedule_payment_policy: 'transfer_entitlement' } as Record<string, unknown>,
        })
      )
    ).toBe('transfer_entitlement');
  });
});

describe('getQueueReinsertDefault', () => {
  it('defaults to end_of_queue', () => {
    expect(getQueueReinsertDefault(baseSettings())).toBe('end_of_queue');
  });

  it('honors after_current', () => {
    expect(
      getQueueReinsertDefault(
        baseSettings({ opd_policies: { queue_reinsert_default: 'after_current' } as Record<string, unknown> })
      )
    ).toBe('after_current');
  });
});

describe('assertSlotJoinAllowedForPatient', () => {
  const pastSlot = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  beforeEach(() => {
    jest.resetAllMocks();
    mockedDoctorSettings.getDoctorSettings.mockResolvedValue(baseSettings() as never);
    mockedOpdMode.resolveSessionDayMode.mockResolvedValue({
      mode: 'slot',
      source: 'doctor_settings',
      changeCount: 0,
    } as never);
  });

  it('allows join when a live consultation session exists (even past grace)', async () => {
    const { from } = makeAdminMock({
      appointment: {
        id: 'apt-1',
        doctor_id: 'd1',
        appointment_date: pastSlot,
        status: 'confirmed',
        opd_early_invite_response: null,
        opd_session_delay_minutes: null,
      },
      liveSession: { id: 'sess-1' },
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);

    await expect(assertSlotJoinAllowedForPatient('apt-1', 'cid')).resolves.toBeUndefined();
    expect(mockedOpdMode.resolveSessionDayMode).not.toHaveBeenCalled();
  });

  it('rejects when past grace and no live session', async () => {
    const { from } = makeAdminMock({
      appointment: {
        id: 'apt-1',
        doctor_id: 'd1',
        appointment_date: pastSlot,
        status: 'confirmed',
        opd_early_invite_response: null,
        opd_session_delay_minutes: null,
      },
      liveSession: null,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);

    await expect(assertSlotJoinAllowedForPatient('apt-1', 'cid')).rejects.toThrow(
      /join window has passed/i
    );
  });

  it('allows when session delay extends the grace window past now', async () => {
    // Slot was 20 minutes ago; default grace is 15 → would fail without delay.
    const almostPast = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const { from } = makeAdminMock({
      appointment: {
        id: 'apt-1',
        doctor_id: 'd1',
        appointment_date: almostPast,
        status: 'confirmed',
        opd_early_invite_response: null,
        opd_session_delay_minutes: 30,
      },
      liveSession: null,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);

    await expect(assertSlotJoinAllowedForPatient('apt-1', 'cid')).resolves.toBeUndefined();
  });
});
