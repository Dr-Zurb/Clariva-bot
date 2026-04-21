/**
 * `buildModalitySwitchedBanner` copy-matrix tests (Plan 09 · Task 53).
 *
 * The builder is the single source of truth for the body string
 * persisted on every `modality_switched` system message. Its output
 * feeds:
 *   · the in-consult `<TextConsultRoom>` chat thread;
 *   · Plan 07 Task 31's post-consult readonly chat history;
 *   · Plan 07 Task 32's transcript PDF;
 *   · Plan 10's session-narrative AI pipeline.
 *
 * This file pins the exact copy so copy regressions surface on the
 * PR instead of in production. Structured `meta` enrichment is
 * asserted by `modality-change-service.test.ts` at the call-site
 * level — here we only prove the 4 × 2 billing-action × initiator
 * combinations render the right strings.
 */

import { __testOnly__ } from '../../../src/services/modality-change-service';

const { buildModalitySwitchedBanner, formatRupeesFromPaise } = __testOnly__;

describe('buildModalitySwitchedBanner · Plan 09 Task 53 copy matrix', () => {
  describe('paid_upgrade (patient-initiated)', () => {
    it('renders "Patient upgraded to Video. Payment of ₹500 processed." when amount present', () => {
      const body = buildModalitySwitchedBanner({
        from: 'voice',
        to: 'video',
        initiatedBy: 'patient',
        billingAction: 'paid_upgrade',
        reason: null,
        amountPaise: 50_000,
      });
      expect(body).toBe('Patient upgraded to Video. Payment of ₹500 processed.');
    });

    it('falls back to "Payment processed." wording when amountPaise is null', () => {
      const body = buildModalitySwitchedBanner({
        from: 'text',
        to: 'voice',
        initiatedBy: 'patient',
        billingAction: 'paid_upgrade',
        reason: null,
        amountPaise: null,
      });
      expect(body).toBe('Patient upgraded to Voice. Payment processed.');
    });

    it('drops reason on paid_upgrade (reason is not required for the patient-initiated path)', () => {
      const body = buildModalitySwitchedBanner({
        from: 'voice',
        to: 'video',
        initiatedBy: 'patient',
        billingAction: 'paid_upgrade',
        reason: 'patient wanted video',
        amountPaise: 30_000,
      });
      expect(body).toBe('Patient upgraded to Video. Payment of ₹300 processed.');
      expect(body).not.toContain('Reason:');
    });
  });

  describe('free_upgrade', () => {
    it('patient-initiated · doctor-approved-as-free renders "Doctor approved the patient\'s upgrade…"', () => {
      const body = buildModalitySwitchedBanner({
        from: 'voice',
        to: 'video',
        initiatedBy: 'patient',
        billingAction: 'free_upgrade',
        reason: null,
        amountPaise: null,
      });
      expect(body).toBe("Doctor approved the patient's upgrade to Video as a free upgrade.");
    });

    it('doctor-initiated renders "Doctor upgraded the consult to {To} at no extra charge." plus reason', () => {
      const body = buildModalitySwitchedBanner({
        from: 'voice',
        to: 'video',
        initiatedBy: 'doctor',
        billingAction: 'free_upgrade',
        reason: 'Need to visually examine the patient',
        amountPaise: null,
      });
      expect(body).toBe(
        'Doctor upgraded the consult to Video at no extra charge. Reason: Need to visually examine the patient',
      );
    });

    it('doctor-initiated with empty reason still renders without the "Reason:" suffix', () => {
      const body = buildModalitySwitchedBanner({
        from: 'text',
        to: 'voice',
        initiatedBy: 'doctor',
        billingAction: 'free_upgrade',
        reason: '   ',
        amountPaise: null,
      });
      expect(body).toBe('Doctor upgraded the consult to Voice at no extra charge.');
    });
  });

  describe('no_refund_downgrade (patient-initiated)', () => {
    it('renders "Patient switched to {To}…. No refund issued. Reason: {reason}"', () => {
      const body = buildModalitySwitchedBanner({
        from: 'video',
        to: 'voice',
        initiatedBy: 'patient',
        billingAction: 'no_refund_downgrade',
        reason: 'Phone overheating, switching to voice',
        amountPaise: null,
      });
      expect(body).toBe(
        'Patient switched to Voice for the remainder of the consult. No refund issued. Reason: Phone overheating, switching to voice',
      );
    });
  });

  describe('auto_refund_downgrade (doctor-initiated)', () => {
    it('renders "Doctor downgraded the consult to {To}. Patient refunded ₹X. Reason: {reason}"', () => {
      const body = buildModalitySwitchedBanner({
        from: 'video',
        to: 'voice',
        initiatedBy: 'doctor',
        billingAction: 'auto_refund_downgrade',
        reason: 'Patient environment unsuitable for video',
        amountPaise: 5_000,
      });
      expect(body).toBe(
        'Doctor downgraded the consult to Voice. Patient refunded ₹50. Reason: Patient environment unsuitable for video',
      );
    });

    it('falls back to "Refund issued to patient." when amountPaise is null', () => {
      const body = buildModalitySwitchedBanner({
        from: 'voice',
        to: 'text',
        initiatedBy: 'doctor',
        billingAction: 'auto_refund_downgrade',
        reason: 'Case no longer needs voice',
        amountPaise: null,
      });
      expect(body).toBe(
        'Doctor downgraded the consult to Text. Refund issued to patient. Reason: Case no longer needs voice',
      );
    });
  });
});

describe('formatRupeesFromPaise', () => {
  it('renders ₹ with no fractional digits (whole rupees)', () => {
    expect(formatRupeesFromPaise(5_000)).toBe('₹50');
    expect(formatRupeesFromPaise(35_000)).toBe('₹350');
    expect(formatRupeesFromPaise(50_000)).toBe('₹500');
  });

  it('rounds paise to the nearest rupee (banker-agnostic — simple round-half-up)', () => {
    expect(formatRupeesFromPaise(49)).toBe('₹0');
    expect(formatRupeesFromPaise(50)).toBe('₹1');
    expect(formatRupeesFromPaise(150)).toBe('₹2');
  });

  it('applies Indian grouping (lakh) on large amounts — future-proofs for premium catalogue', () => {
    expect(formatRupeesFromPaise(100_00_00)).toBe('₹10,000');
    expect(formatRupeesFromPaise(1_00_000_00)).toBe('₹1,00,000');
  });
});
