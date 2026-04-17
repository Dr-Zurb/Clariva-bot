/**
 * OPD policy helpers (OPD-08)
 */

import { describe, it, expect } from '@jest/globals';
import {
  DEFAULT_SLOT_JOIN_GRACE_MINUTES,
  getSlotJoinGraceMinutes,
  getReschedulePaymentPolicy,
  getQueueReinsertDefault,
} from '../../../src/services/opd/opd-policy-service';
import type { DoctorSettingsRow } from '../../../src/types/doctor-settings';

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
    created_at: '',
    updated_at: '',
    ...overrides,
  };
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
