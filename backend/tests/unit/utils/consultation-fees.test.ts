import { describe, expect, it } from '@jest/globals';
import {
  formatAppointmentFeeForAiContext,
  formatConsultationFeesForDm,
  formatFeeBookingCtaForDm,
  formatFollowUpPolicyHint,
  formatServiceCatalogForAiContext,
  formatServiceCatalogForDm,
  isConsultationTypePricingFollowUp,
  isMetaBookingOrFeeReasonText,
  isPricingInquiryMessage,
  pickCatalogServicesMatchingUserText,
  userExplicitlyWantsToBookNow,
} from '../../../src/utils/consultation-fees';
import {
  deterministicServiceIdForLegacyOffering,
  type ServiceCatalogV1,
} from '../../../src/utils/service-catalog-schema';

const sid = (key: string) => deterministicServiceIdForLegacyOffering('d-dm', key);

describe('consultation-fees (RBH-13)', () => {
  it('isPricingInquiryMessage detects fee questions', () => {
    expect(isPricingInquiryMessage('how much is consultation')).toBe(true);
    expect(isPricingInquiryMessage('yar kitne paise ye to batao')).toBe(true);
    expect(isPricingInquiryMessage('Hi')).toBe(false);
    expect(isPricingInquiryMessage('')).toBe(false);
  });

  it('formatAppointmentFeeForAiContext formats INR from paise', () => {
    const line = formatAppointmentFeeForAiContext({
      appointment_fee_minor: 1000,
      appointment_fee_currency: 'INR',
    });
    expect(line).toContain('₹10');
    expect(line).toContain('Standard appointment');
  });

  it('formatAppointmentFeeForAiContext uses supplemental wording when teleconsult catalog present', () => {
    const line = formatAppointmentFeeForAiContext(
      {
        appointment_fee_minor: 5000_00,
        appointment_fee_currency: 'USD',
      },
      { teleconsultCatalogPresent: true }
    );
    expect(line).toContain('catalog');
    expect(line).toContain('5000.00 USD');
    expect(line).not.toContain('Standard appointment / consultation fee on file:');
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

  const catalogTwoServices: ServiceCatalogV1 = {
    version: 1,
    services: [
      {
        service_id: sid('skin'),
        service_key: 'skin',
        label: 'Dermatology',
        modalities: {
          text: { enabled: true, price_minor: 50_00 },
          voice: { enabled: true, price_minor: 80_00 },
          video: { enabled: true, price_minor: 100_00 },
        },
      },
      {
        service_id: sid('gp'),
        service_key: 'gp',
        label: 'General',
        modalities: {
          video: { enabled: true, price_minor: 200_00 },
        },
      },
    ],
  };

  it('SFU-08: formatConsultationFeesForDm prefers service_offerings_json over consultation_types', () => {
    const out = formatConsultationFeesForDm({
      practice_name: 'Skin Clinic',
      consultation_types: 'Legacy ₹999 should not appear',
      service_offerings_json: catalogTwoServices,
      appointment_fee_minor: 300_00,
      appointment_fee_currency: 'INR',
      business_hours_summary: 'Mon–Fri',
    });
    expect(out).toContain('Dermatology');
    expect(out).toContain('`skin`');
    expect(out).toContain('₹50');
    expect(out).toContain('₹80');
    expect(out).toContain('₹100');
    expect(out).toContain('General');
    expect(out).toContain('₹200');
    expect(out).toContain('₹300');
    expect(out).not.toContain('999');
    expect(out).not.toContain('Legacy');
  });

  it('SFU-08: legacy path unchanged when catalog null', () => {
    const out = formatConsultationFeesForDm({
      practice_name: 'Test Clinic',
      consultation_types: 'Video ₹400',
      service_offerings_json: null,
    });
    expect(out).toContain('₹400');
  });

  it('SFU-08: pickCatalogServicesMatchingUserText narrows to one service', () => {
    const rows = pickCatalogServicesMatchingUserText(catalogTwoServices, 'how much for dermatology');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.service_key).toBe('skin');
  });

  it('SFU-08: formatServiceCatalogForAiContext compact line', () => {
    const s = formatServiceCatalogForAiContext({
      service_offerings_json: catalogTwoServices,
      appointment_fee_currency: 'INR',
    });
    expect(s).toContain('Dermatology');
    expect(s).toContain('service_key=skin');
    expect(s).toContain('₹50');
    expect(s).toContain('video ₹100');
  });

  it('ARM-02: formatServiceCatalogForAiContext includes matcher hints (system prompt only)', () => {
    const catalog: ServiceCatalogV1 = {
      version: 1,
      services: [
        {
          service_id: sid('skin'),
          service_key: 'skin',
          label: 'Dermatology',
          matcher_hints: {
            keywords: 'rash, acne',
            include_when: 'skin lesions',
            exclude_when: 'chest pain emergency',
          },
          modalities: { video: { enabled: true, price_minor: 100_00 } },
        },
      ],
    };
    const s = formatServiceCatalogForAiContext({
      service_offerings_json: catalog,
      appointment_fee_currency: 'INR',
    });
    expect(s).toContain('[matcher:');
    expect(s).toContain('keywords=rash, acne');
    expect(s).toContain('include_when=');
    expect(s).toContain('exclude_when=');
  });

  it('SFU-08: formatServiceCatalogForDm uses narrow pick', () => {
    const body = formatServiceCatalogForDm(catalogTwoServices, {
      practice_name: 'X',
      consultation_types: null,
      business_hours_summary: null,
      appointment_fee_minor: null,
      appointment_fee_currency: 'INR',
    }, 'price for gp visit');
    expect(body).toContain('General');
    expect(body).toContain('`gp`');
    expect(body).not.toContain('Dermatology');
  });

  it('e-task-2: formatFollowUpPolicyHint summarizes enabled policy', () => {
    const h = formatFollowUpPolicyHint(
      {
        enabled: true,
        max_followups: 2,
        eligibility_window_days: 30,
        discount_type: 'percent',
        discount_value: 15,
      },
      'INR'
    );
    expect(h).toContain('15%');
    expect(h).toContain('max 2');
    expect(h).toContain('30 days');
  });

  it('e-task-2: formatServiceCatalogForAiContext includes follow-up hint on modality', () => {
    const catalog: ServiceCatalogV1 = {
      version: 1,
      services: [
        {
          service_id: sid('fu'),
          service_key: 'fu',
          label: 'Follow svc',
          modalities: {
            video: {
              enabled: true,
              price_minor: 99_00,
              followup_policy: {
                enabled: true,
                max_followups: 1,
                eligibility_window_days: 14,
                discount_type: 'free',
              },
            },
          },
        },
      ],
    };
    const s = formatServiceCatalogForAiContext({
      service_offerings_json: catalog,
      appointment_fee_currency: 'INR',
    });
    expect(s).toContain('follow-ups');
    expect(s).toContain('free');
    expect(s).toContain('service_key=fu');
  });

  it('e-task-2: empty service catalog + no legacy types uses empty-catalog copy', () => {
    const emptyCatalog: ServiceCatalogV1 = { version: 1, services: [] };
    const out = formatConsultationFeesForDm({
      practice_name: 'Solo Doc',
      consultation_types: null,
      service_offerings_json: emptyCatalog,
      appointment_fee_minor: null,
    });
    expect(out.toLowerCase()).toContain('services catalog');
    expect(out.toLowerCase()).toContain('empty');
    expect(out).not.toMatch(/₹\d+/);
  });

  it('e-task-2: appendMinorFeeLine path supports non-INR legacy fee', () => {
    const out = formatConsultationFeesForDm({
      practice_name: 'US Clinic',
      consultation_types: null,
      appointment_fee_minor: 150_00,
      appointment_fee_currency: 'USD',
    });
    expect(out).toContain('150.00 USD');
  });
});
