import { describe, expect, it } from '@jest/globals';
import {
  formatConsultationFeesForDm,
  formatFeeBookingCtaForDm,
  isConsultationTypePricingFollowUp,
  isMetaBookingOrFeeReasonText,
  isPricingInquiryMessage,
  userExplicitlyWantsToBookNow,
} from '../../../src/utils/consultation-fees';

describe('consultation-fees (RBH-13)', () => {
  it('isPricingInquiryMessage detects fee questions', () => {
    expect(isPricingInquiryMessage('how much is consultation')).toBe(true);
    expect(isPricingInquiryMessage('Hi')).toBe(false);
    expect(isPricingInquiryMessage('')).toBe(false);
  });

  it('userExplicitlyWantsToBookNow detects real booking intent', () => {
    expect(userExplicitlyWantsToBookNow('I want to book an appointment')).toBe(true);
    expect(userExplicitlyWantsToBookNow('how much do you charge')).toBe(false);
  });

  it('formatConsultationFeesForDm parses plain consultation_types with inline ₹', () => {
    const out = formatConsultationFeesForDm({
      practice_name: 'Test Clinic',
      consultation_types: 'In-person ₹500, Video ₹400',
      business_hours_summary: 'Mon–Fri 9–5',
    });
    expect(out).toContain('Test Clinic');
    expect(out).toContain('**In-person**');
    expect(out).toContain('₹500');
    expect(out).toContain('₹400');
    expect(out).toContain('Mon–Fri');
  });

  it('formatConsultationFeesForDm parses compact JSON with r / l keys', () => {
    const out = formatConsultationFeesForDm({
      practice_name: 'Clinic',
      consultation_types: '[{"l":"General","r":500},{"label":"Video","fee_inr":400}]',
    });
    expect(out).toContain('**General**');
    expect(out).toContain('₹500');
    expect(out).toContain('₹400');
  });

  it('formatConsultationFeesForDm safe copy when consultation_types empty', () => {
    const out = formatConsultationFeesForDm({
      practice_name: 'Clinic',
      consultation_types: null,
    });
    expect(out.toLowerCase()).toContain("don't have");
    expect(out).not.toMatch(/₹\d+/);
  });

  it('formatConsultationFeesForDm Roman Hindi when user writes Hinglish (fee question)', () => {
    const out = formatConsultationFeesForDm(
      {
        practice_name: 'Dr Zurb Clinic',
        consultation_types: 'Video',
        appointment_fee_minor: 50000,
        appointment_fee_currency: 'INR',
      },
      'acha kitni fees hai?'
    );
    expect(out).toContain('consultation types / fees');
    expect(out).toMatch(/₹500/);
    expect(out).toContain('**Video**');
  });

  it('formatConsultationFeesForDm uses appointment_fee_minor when JSON rows lack amounts', () => {
    const out = formatConsultationFeesForDm(
      {
        practice_name: 'Clinic',
        consultation_types: '[{"l":"Video","note":"ask desk"}]',
        appointment_fee_minor: 75000,
        appointment_fee_currency: 'INR',
      },
      ''
    );
    expect(out).toContain('₹750');
    expect(out).toContain('Video');
  });

  it('formatFeeBookingCtaForDm follows Hinglish locale', () => {
    const cta = formatFeeBookingCtaForDm('kitni fee hai bhai');
    expect(cta).toMatch(/appointment book/i);
    expect(cta.toLowerCase()).not.toContain("when you're ready");
  });

  it('isMetaBookingOrFeeReasonText blocks meta strings for reason', () => {
    expect(isMetaBookingOrFeeReasonText('how much is the consultation fee')).toBe(true);
    expect(isMetaBookingOrFeeReasonText('stomach pain for 3 days')).toBe(false);
    expect(isMetaBookingOrFeeReasonText('general consultation')).toBe(false);
  });

  it('isConsultationTypePricingFollowUp (RBH-14)', () => {
    expect(isConsultationTypePricingFollowUp('general consultation please')).toBe(true);
    expect(isConsultationTypePricingFollowUp('video consult')).toBe(true);
    expect(isConsultationTypePricingFollowUp('tomorrow')).toBe(false);
  });
});
