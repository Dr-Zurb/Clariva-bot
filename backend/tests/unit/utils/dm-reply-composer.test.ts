import { describe, expect, it } from '@jest/globals';
import {
  composeIdleFeeQuoteDm,
  composeMidCollectionFeeQuoteDm,
  formatMidCollectionAfterFeeBlock,
} from '../../../src/utils/dm-reply-composer';
import type { DoctorSettingsRow } from '../../../src/types/doctor-settings';

/** Minimal row for fee formatters (other columns unused). */
const catalogFixture = {
  version: 1 as const,
  services: [
    {
      service_key: 'only',
      label: 'Solo Service',
      modalities: { video: { enabled: true, price_minor: 123_45 } },
    },
  ],
};

const feeFixture = {
  doctor_id: 'doc-1',
  appointment_fee_minor: null,
  appointment_fee_currency: null,
  country: null,
  practice_name: 'Test Clinic',
  timezone: 'Asia/Kolkata',
  slot_interval_minutes: 30,
  max_advance_booking_days: 90,
  min_advance_hours: 1,
  business_hours_summary: 'Mon–Fri 9–5',
  cancellation_policy_hours: null,
  max_appointments_per_day: null,
  booking_buffer_minutes: null,
  welcome_message: null,
  specialty: null,
  address_summary: null,
  consultation_types: 'In-person ₹500, Video ₹400',
  service_offerings_json: null as typeof catalogFixture | null,
  default_notes: null,
  payout_schedule: null,
  payout_minor: null,
  razorpay_linked_account_id: null,
  opd_mode: 'slot' as const,
  opd_policies: null,
  instagram_receptionist_paused: false,
  instagram_receptionist_pause_message: null,
  created_at: '',
  updated_at: '',
} satisfies DoctorSettingsRow;

describe('dm-reply-composer (RBH-19)', () => {
  it('composeIdleFeeQuoteDm joins fee body and booking CTA with exact ₹ from settings', () => {
    const out = composeIdleFeeQuoteDm(feeFixture, 'how much is consultation');
    expect(out).toContain('**In-person**');
    expect(out).toContain('₹500');
    expect(out).toContain('₹400');
    expect(out).toContain('**book appointment**');
    expect(out.indexOf('₹500')).toBeLessThan(out.indexOf('book appointment'));
  });

  it('composeMidCollectionFeeQuoteDm adds localized continue block after fees (English)', () => {
    const out = composeMidCollectionFeeQuoteDm(feeFixture, 'what is the fee', {
      collectedFields: ['name'],
    });
    expect(out).toContain('₹500');
    expect(out).toContain('---');
    expect(out).toContain('Please continue sharing any booking details');
    expect(out).toMatch(/Still needed:.*mobile number/i);
  });

  it('composeMidCollectionFeeQuoteDm uses Roman Hindi footer for Hinglish pricing during intake', () => {
    const out = composeMidCollectionFeeQuoteDm(feeFixture, 'kitna charge hai', {
      collectedFields: [],
    });
    expect(out).toContain('₹500');
    expect(out).toContain('---');
    expect(out).toContain('Booking complete karne ke liye');
  });

  it('composeIdleFeeQuoteDm uses catalog when service_offerings_json set (SFU-08)', () => {
    const withCat = { ...feeFixture, service_offerings_json: catalogFixture, consultation_types: 'ignored' };
    const out = composeIdleFeeQuoteDm(withCat, 'fees please');
    expect(out).toContain('Solo Service');
    expect(out).toContain('₹123.45');
    expect(out).not.toContain('₹500');
    expect(out).toContain('**book appointment**');
  });

  it('formatMidCollectionAfterFeeBlock omits missing line when all required fields present', () => {
    const block = formatMidCollectionAfterFeeBlock('ok', []);
    expect(block).toContain('---');
    expect(block).not.toMatch(/Still needed/i);
    expect(block).not.toMatch(/mobile number/i);
  });
});
