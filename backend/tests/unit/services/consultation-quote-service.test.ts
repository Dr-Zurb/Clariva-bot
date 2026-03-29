/**
 * SFU-03: consultation quote engine
 */

import { describe, it, expect } from '@jest/globals';
import type { CareEpisodeRow } from '../../../src/types/care-episode';
import type { DoctorSettingsRow } from '../../../src/types/doctor-settings';
import {
  applyFollowUpDiscount,
  isEpisodeEligibleForFollowUpQuote,
  parseEpisodePriceSnapshotV1,
  quoteConsultationVisit,
  resolveFollowUpDiscountSpec,
} from '../../../src/services/consultation-quote-service';
import {
  LegacyAppointmentFeeNotConfiguredError,
  ModalityNotOfferedForQuote,
  ServiceNotFoundForQuote,
} from '../../../src/utils/errors';
import {
  deterministicServiceIdForLegacyOffering,
  type ServiceCatalogV1,
} from '../../../src/utils/service-catalog-schema';

const DOC = 'd1';

function catalogSingleVideo(serviceKey = 'skin'): ServiceCatalogV1 {
  return {
    version: 1,
    services: [
      {
        service_id: deterministicServiceIdForLegacyOffering(DOC, serviceKey),
        service_key: serviceKey,
        label: 'Skin',
        modalities: {
          video: { enabled: true, price_minor: 100_00 },
          text: { enabled: true, price_minor: 50_00 },
        },
      },
    ],
  };
}

function baseDoctorRow(overrides: Partial<DoctorSettingsRow> = {}): DoctorSettingsRow {
  return {
    doctor_id: 'd1',
    appointment_fee_minor: 99_00,
    appointment_fee_currency: 'INR',
    country: null,
    practice_name: null,
    timezone: 'Asia/Kolkata',
    slot_interval_minutes: 15,
    max_advance_booking_days: 90,
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
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

function baseEpisode(overrides: Partial<CareEpisodeRow> = {}): CareEpisodeRow {
  return {
    id: 'ep-1',
    doctor_id: 'd1',
    patient_id: 'p1',
    catalog_service_key: 'skin',
    catalog_service_id: deterministicServiceIdForLegacyOffering(DOC, 'skin'),
    status: 'active',
    started_at: new Date().toISOString(),
    eligibility_ends_at: new Date('2030-12-31T23:59:59.000Z').toISOString(),
    followups_used: 0,
    max_followups: 3,
    price_snapshot_json: {
      version: 1,
      modalities: {
        video: { price_minor: 100_00 },
        text: { price_minor: 50_00 },
      },
      followup_policy: {
        enabled: true,
        max_followups: 3,
        eligibility_window_days: 90,
        discount_type: 'percent',
        discount_value: 30,
      },
    },
    index_appointment_id: 'a1',
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

describe('quoteConsultationVisit', () => {
  const at = new Date('2026-06-15T12:00:00.000Z');

  it('index path: list price from catalog for modality', () => {
    const settings = baseDoctorRow({ service_offerings_json: catalogSingleVideo() });
    const q = quoteConsultationVisit({
      settings,
      catalogServiceKey: 'skin',
      modality: 'video',
      at,
    });
    expect(q.kind).toBe('index');
    expect(q.visit_index).toBe(1);
    expect(q.amount_minor).toBe(100_00);
    expect(q.currency).toBe('INR');
    expect(q.service_key).toBe('skin');
  });

  it('follow-up path: 30% off snapshot base', () => {
    const settings = baseDoctorRow({ service_offerings_json: catalogSingleVideo() });
    const q = quoteConsultationVisit({
      settings,
      catalogServiceKey: 'skin',
      modality: 'video',
      at,
      activeEpisode: baseEpisode(),
    });
    expect(q.kind).toBe('followup');
    expect(q.episode_id).toBe('ep-1');
    expect(q.amount_minor).toBe(70_00);
    expect(q.visit_index).toBe(2);
    expect(q.visits_remaining).toBe(2);
  });

  it('SFU-09: tiered follow-up — visit 2 vs 3 use different percents', () => {
    const settings = baseDoctorRow({ service_offerings_json: catalogSingleVideo() });
    const snapshot = {
      version: 1 as const,
      modalities: {
        video: { price_minor: 100_00 },
        text: { price_minor: 50_00 },
      },
      followup_policy: {
        enabled: true,
        max_followups: 3,
        eligibility_window_days: 90,
        discount_type: 'percent' as const,
        discount_value: 10,
        discount_tiers: [
          { from_visit: 2, discount_type: 'percent' as const, discount_value: 30 },
          { from_visit: 3, discount_type: 'percent' as const, discount_value: 50 },
        ],
      },
    };
    const ep2 = baseEpisode({ price_snapshot_json: snapshot });
    const q2 = quoteConsultationVisit({
      settings,
      catalogServiceKey: 'skin',
      modality: 'video',
      at,
      activeEpisode: ep2,
    });
    expect(q2.visit_index).toBe(2);
    expect(q2.amount_minor).toBe(70_00);
    const ep3 = baseEpisode({ followups_used: 1, price_snapshot_json: snapshot });
    const q3 = quoteConsultationVisit({
      settings,
      catalogServiceKey: 'skin',
      modality: 'video',
      at,
      activeEpisode: ep3,
    });
    expect(q3.visit_index).toBe(3);
    expect(q3.amount_minor).toBe(50_00);
  });

  it('SFU-09: tier with higher from_visit applies when visit index reaches it', () => {
    const settings = baseDoctorRow({ service_offerings_json: catalogSingleVideo() });
    const snapshot = {
      version: 1 as const,
      modalities: { video: { price_minor: 100_00 } },
      followup_policy: {
        enabled: true,
        max_followups: 5,
        eligibility_window_days: 90,
        discount_type: 'percent' as const,
        discount_value: 5,
        discount_tiers: [
          { from_visit: 2, discount_type: 'percent' as const, discount_value: 20 },
          { from_visit: 4, discount_type: 'percent' as const, discount_value: 40 },
        ],
      },
    };
    const qV3 = quoteConsultationVisit({
      settings,
      catalogServiceKey: 'skin',
      modality: 'video',
      at,
      activeEpisode: baseEpisode({ followups_used: 1, price_snapshot_json: snapshot }),
    });
    expect(qV3.visit_index).toBe(3);
    expect(qV3.amount_minor).toBe(80_00);
    const qV4 = quoteConsultationVisit({
      settings,
      catalogServiceKey: 'skin',
      modality: 'video',
      at,
      activeEpisode: baseEpisode({ followups_used: 2, price_snapshot_json: snapshot }),
    });
    expect(qV4.visit_index).toBe(4);
    expect(qV4.amount_minor).toBe(60_00);
  });

  it('SFU-09: when no tier matches visit index, uses top-level policy discount', () => {
    const settings = baseDoctorRow({ service_offerings_json: catalogSingleVideo() });
    const snapshot = {
      version: 1 as const,
      modalities: { video: { price_minor: 100_00 } },
      followup_policy: {
        enabled: true,
        max_followups: 3,
        eligibility_window_days: 90,
        discount_type: 'percent' as const,
        discount_value: 15,
        discount_tiers: [{ from_visit: 3, discount_type: 'percent' as const, discount_value: 50 }],
      },
    };
    const q = quoteConsultationVisit({
      settings,
      catalogServiceKey: 'skin',
      modality: 'video',
      at,
      activeEpisode: baseEpisode({ followups_used: 0, price_snapshot_json: snapshot }),
    });
    expect(q.visit_index).toBe(2);
    expect(q.amount_minor).toBe(85_00);
  });

  it('exhausted follow-ups: falls back to index list price', () => {
    const settings = baseDoctorRow({ service_offerings_json: catalogSingleVideo() });
    const q = quoteConsultationVisit({
      settings,
      catalogServiceKey: 'skin',
      modality: 'video',
      at,
      activeEpisode: baseEpisode({ followups_used: 3, max_followups: 3 }),
    });
    expect(q.kind).toBe('index');
    expect(q.amount_minor).toBe(100_00);
    expect(q.episode_id).toBeUndefined();
  });

  it('expired eligibility: falls back to index list price', () => {
    const settings = baseDoctorRow({ service_offerings_json: catalogSingleVideo() });
    const q = quoteConsultationVisit({
      settings,
      catalogServiceKey: 'skin',
      modality: 'video',
      at: new Date('2030-01-01T00:00:00.000Z'),
      activeEpisode: baseEpisode({
        eligibility_ends_at: new Date('2029-12-01T00:00:00.000Z').toISOString(),
      }),
    });
    expect(q.kind).toBe('index');
    expect(q.amount_minor).toBe(100_00);
  });

  it('wrong modality for service: throws ModalityNotOfferedForQuote', () => {
    const onlyVideo = catalogSingleVideo();
    onlyVideo.services[0]!.modalities = { video: { enabled: true, price_minor: 100_00 } };
    const settings = baseDoctorRow({ service_offerings_json: onlyVideo });
    expect(() =>
      quoteConsultationVisit({
        settings,
        catalogServiceKey: 'skin',
        modality: 'voice',
        at,
      })
    ).toThrow(ModalityNotOfferedForQuote);
  });

  it('service missing from catalog: throws ServiceNotFoundForQuote', () => {
    const settings = baseDoctorRow({ service_offerings_json: catalogSingleVideo() });
    expect(() =>
      quoteConsultationVisit({
        settings,
        catalogServiceKey: 'other',
        modality: 'video',
        at,
      })
    ).toThrow(ServiceNotFoundForQuote);
  });

  it('legacy: no catalog uses appointment_fee_minor for any modality', () => {
    const settings = baseDoctorRow({
      service_offerings_json: null,
      appointment_fee_minor: 42_00,
    });
    const q = quoteConsultationVisit({
      settings,
      catalogServiceKey: 'anything',
      modality: 'video',
      at,
    });
    expect(q.kind).toBe('index');
    expect(q.amount_minor).toBe(42_00);
  });

  it('legacy: null fee throws LegacyAppointmentFeeNotConfiguredError', () => {
    const settings = baseDoctorRow({
      service_offerings_json: null,
      appointment_fee_minor: null,
    });
    expect(() =>
      quoteConsultationVisit({
        settings,
        catalogServiceKey: 'x',
        modality: 'video',
        at,
      })
    ).toThrow(LegacyAppointmentFeeNotConfiguredError);
  });

  it('SFU-11: same service_id keeps follow-up after service_key rename in catalog', () => {
    const sidSkin = deterministicServiceIdForLegacyOffering(DOC, 'skin');
    const catRenamed: ServiceCatalogV1 = {
      version: 1,
      services: [
        {
          service_id: sidSkin,
          service_key: 'derm',
          label: 'Dermatology',
          modalities: {
            video: { enabled: true, price_minor: 100_00 },
            text: { enabled: true, price_minor: 50_00 },
          },
        },
      ],
    };
    const settings = baseDoctorRow({ service_offerings_json: catRenamed });
    const q = quoteConsultationVisit({
      settings,
      catalogServiceKey: 'derm',
      catalogServiceId: sidSkin,
      modality: 'video',
      at,
      activeEpisode: baseEpisode({ catalog_service_key: 'skin', catalog_service_id: sidSkin }),
    });
    expect(q.kind).toBe('followup');
    expect(q.amount_minor).toBe(70_00);
  });

  it('episode for different service: ignored — index quote for requested service', () => {
    const cat2: ServiceCatalogV1 = {
      version: 1,
      services: [
        catalogSingleVideo('skin').services[0]!,
        {
          service_id: deterministicServiceIdForLegacyOffering(DOC, 'other'),
          service_key: 'other',
          label: 'Other',
          modalities: { video: { enabled: true, price_minor: 200_00 } },
        },
      ],
    };
    const settings = baseDoctorRow({ service_offerings_json: cat2 });
    const q = quoteConsultationVisit({
      settings,
      catalogServiceKey: 'other',
      modality: 'video',
      at,
      activeEpisode: baseEpisode({
        catalog_service_key: 'skin',
        catalog_service_id: deterministicServiceIdForLegacyOffering(DOC, 'skin'),
      }),
    });
    expect(q.kind).toBe('index');
    expect(q.amount_minor).toBe(200_00);
  });

  it('SFU-12: v2 snapshot uses per-modality follow-up policy (text vs video)', () => {
    const settings = baseDoctorRow({ service_offerings_json: catalogSingleVideo() });
    const snapshot = {
      version: 2 as const,
      modalities: {
        video: {
          price_minor: 100_00,
          followup_policy: {
            enabled: true,
            max_followups: 3,
            eligibility_window_days: 90,
            discount_type: 'percent' as const,
            discount_value: 10,
          },
        },
        text: {
          price_minor: 50_00,
          followup_policy: {
            enabled: true,
            max_followups: 3,
            eligibility_window_days: 90,
            discount_type: 'percent' as const,
            discount_value: 40,
          },
        },
      },
    };
    const ep = baseEpisode({ price_snapshot_json: snapshot });
    const qVideo = quoteConsultationVisit({
      settings,
      catalogServiceKey: 'skin',
      modality: 'video',
      at,
      activeEpisode: ep,
    });
    expect(qVideo.amount_minor).toBe(90_00);
    const qText = quoteConsultationVisit({
      settings,
      catalogServiceKey: 'skin',
      modality: 'text',
      at,
      activeEpisode: ep,
    });
    expect(qText.amount_minor).toBe(30_00);
  });

  it('replays follow-up policy from catalog when snapshot omits it', () => {
    const cat = catalogSingleVideo();
    cat.services[0]!.followup_policy = {
      enabled: true,
      max_followups: 3,
      eligibility_window_days: 90,
      discount_type: 'percent',
      discount_value: 20,
    };
    const settings = baseDoctorRow({ service_offerings_json: cat });
    const ep = baseEpisode({
      price_snapshot_json: {
        version: 1,
        modalities: { video: { price_minor: 100_00 } },
      },
    });
    const q = quoteConsultationVisit({
      settings,
      catalogServiceKey: 'skin',
      modality: 'video',
      at,
      activeEpisode: ep,
    });
    expect(q.kind).toBe('followup');
    expect(q.amount_minor).toBe(80_00);
  });
});

describe('isEpisodeEligibleForFollowUpQuote', () => {
  const at = new Date('2026-06-15T12:00:00.000Z');

  it('returns false when status is not active', () => {
    expect(isEpisodeEligibleForFollowUpQuote(baseEpisode({ status: 'exhausted' }), at)).toBe(false);
  });

  it('returns true when within window and slots remain', () => {
    expect(isEpisodeEligibleForFollowUpQuote(baseEpisode(), at)).toBe(true);
  });
});

describe('applyFollowUpDiscount', () => {
  it('percent 30', () => {
    expect(
      applyFollowUpDiscount(100_00, {
        enabled: true,
        max_followups: 1,
        eligibility_window_days: 30,
        discount_type: 'percent',
        discount_value: 30,
      })
    ).toBe(70_00);
  });

  it('free', () => {
    expect(
      applyFollowUpDiscount(100_00, {
        enabled: true,
        max_followups: 1,
        eligibility_window_days: 30,
        discount_type: 'free',
      })
    ).toBe(0);
  });

  it('SFU-09: uses tier when visitIndex provided', () => {
    const policy = {
      enabled: true,
      max_followups: 3,
      eligibility_window_days: 90,
      discount_type: 'percent' as const,
      discount_value: 10,
      discount_tiers: [
        { from_visit: 2, discount_type: 'percent' as const, discount_value: 40 },
      ],
    };
    expect(applyFollowUpDiscount(100_00, policy, 2)).toBe(60_00);
    expect(applyFollowUpDiscount(100_00, policy, undefined)).toBe(90_00);
  });
});

describe('resolveFollowUpDiscountSpec', () => {
  const base = {
    enabled: true,
    max_followups: 3,
    eligibility_window_days: 90,
    discount_type: 'percent' as const,
    discount_value: 5,
    discount_tiers: [
      { from_visit: 2, discount_type: 'percent' as const, discount_value: 20 },
      { from_visit: 4, discount_type: 'free' as const },
    ],
  };

  it('picks greatest from_visit <= index', () => {
    expect(resolveFollowUpDiscountSpec(base, 3)).toEqual({
      discount_type: 'percent',
      discount_value: 20,
    });
    expect(resolveFollowUpDiscountSpec(base, 4)).toEqual({
      discount_type: 'free',
      discount_value: undefined,
    });
  });
});

describe('parseEpisodePriceSnapshotV1', () => {
  it('reads nested modalities without enabled flag', () => {
    const p = parseEpisodePriceSnapshotV1({
      modalities: { video: { price_minor: 5000 } },
    });
    expect(p.snapshotVersion).toBe(1);
    expect(p.modalities.video?.price_minor).toBe(5000);
  });

  it('SFU-12: reads per-modality followup_policy on v2', () => {
    const p = parseEpisodePriceSnapshotV1({
      version: 2,
      modalities: {
        video: {
          price_minor: 100_00,
          followup_policy: {
            enabled: true,
            max_followups: 2,
            eligibility_window_days: 30,
            discount_type: 'percent',
            discount_value: 25,
          },
        },
      },
    });
    expect(p.snapshotVersion).toBe(2);
    expect(p.modalities.video?.followup_policy?.discount_value).toBe(25);
  });
});
