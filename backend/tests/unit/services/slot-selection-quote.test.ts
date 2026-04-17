/**
 * SFU-05: slot booking quote resolution (catalog vs legacy)
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { ConversationState } from '../../../src/types/conversation';
import type { DoctorSettingsRow } from '../../../src/types/doctor-settings';
import {
  deterministicServiceIdForLegacyOffering,
  type ServiceCatalogV1,
} from '../../../src/utils/service-catalog-schema';

const DOC = 'd1';
const sid = (key: string) => deterministicServiceIdForLegacyOffering(DOC, key);
import * as careEpisode from '../../../src/services/care-episode-service';
import {
  computeSlotBookingQuote,
  resolveCatalogServiceKeyForSlotBooking,
  resolveModalityForSlotBooking,
} from '../../../src/services/slot-selection-service';

jest.mock('../../../src/services/care-episode-service', () => ({
  getActiveEpisodeForPatientDoctorService: jest.fn(async () => null),
}));

const mockedGetActiveEpisode = careEpisode.getActiveEpisodeForPatientDoctorService as jest.MockedFunction<
  typeof careEpisode.getActiveEpisodeForPatientDoctorService
>;

function catalogSingle(serviceKey = 'skin'): ServiceCatalogV1 {
  return {
    version: 1,
    services: [
      {
        service_id: sid(serviceKey),
        service_key: serviceKey,
        label: 'Skin',
        modalities: {
          video: { enabled: true, price_minor: 100_00 },
          text: { enabled: true, price_minor: 50_00 },
          voice: { enabled: false, price_minor: 1 },
        },
      },
    ],
  };
}

function catalogMulti(): ServiceCatalogV1 {
  return {
    version: 1,
    services: [
      {
        service_id: sid('skin'),
        service_key: 'skin',
        label: 'Skin',
        modalities: { video: { enabled: true, price_minor: 80_00 } },
      },
      {
        service_id: sid('gp'),
        service_key: 'gp',
        label: 'GP',
        modalities: { video: { enabled: true, price_minor: 200_00 } },
      },
    ],
  };
}

function baseDoctor(overrides: Partial<DoctorSettingsRow> = {}): DoctorSettingsRow {
  return {
    doctor_id: 'd1',
    appointment_fee_minor: 99_00,
    appointment_fee_currency: 'INR',
    country: 'IN',
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
    service_offerings_json: catalogSingle(),
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

const correlationId = 'corr-sfu05';

describe('resolveModalityForSlotBooking', () => {
  it('uses state.consultationModality when set', () => {
    const state = { consultationModality: 'text' } as ConversationState;
    expect(resolveModalityForSlotBooking(state, 'video')).toBe('text');
  });

  it('defaults to video when modality unset and teleconsult', () => {
    const state = {} as ConversationState;
    expect(resolveModalityForSlotBooking(state, 'video')).toBe('video');
  });
});

describe('resolveCatalogServiceKeyForSlotBooking', () => {
  const cat = catalogMulti();

  it('returns null for multi-service when state has no key', () => {
    const state = {} as ConversationState;
    expect(resolveCatalogServiceKeyForSlotBooking(state, cat, correlationId)).toBeNull();
  });

  it('returns single service key when catalog has one offering', () => {
    const one = catalogSingle('only');
    const state = {} as ConversationState;
    expect(resolveCatalogServiceKeyForSlotBooking(state, one, correlationId)).toBe('only');
  });

  it('returns normalized key when state matches offering', () => {
    const state = { catalogServiceKey: 'GP' } as ConversationState;
    expect(resolveCatalogServiceKeyForSlotBooking(state, cat, correlationId)).toBe('gp');
  });
});

describe('computeSlotBookingQuote', () => {
  beforeEach(() => {
    mockedGetActiveEpisode.mockResolvedValue(null);
  });

  it('uses legacy fee for in_clinic (no catalog path)', async () => {
    const settings = baseDoctor({ appointment_fee_minor: 77_00 });
    const state = { consultationType: 'in_clinic' as const } as ConversationState;
    const q = await computeSlotBookingQuote('d1', 'p1', state, settings, correlationId);
    expect(q.pricingSource).toBe('legacy_fee');
    expect(q.amountMinor).toBe(77_00);
    expect(q.currency).toBe('INR');
    expect(q.quoteMetadata).toBeUndefined();
  });

  it('uses legacy fee when doctor has no active catalog', async () => {
    const settings = baseDoctor({ service_offerings_json: null, appointment_fee_minor: 88_00 });
    const state = { consultationType: 'video' as const } as ConversationState;
    const q = await computeSlotBookingQuote('d1', 'p1', state, settings, correlationId);
    expect(q.pricingSource).toBe('legacy_fee');
    expect(q.amountMinor).toBe(88_00);
  });

  it('ARM-11: rejects quote when multi-service and catalogServiceKey missing (no legacy fallback)', async () => {
    const settings = baseDoctor({ service_offerings_json: catalogMulti(), appointment_fee_minor: 42_00 });
    const state = { consultationType: 'video' as const } as ConversationState;
    await expect(computeSlotBookingQuote('d1', 'p1', state, settings, correlationId)).rejects.toThrow(
      /select a consultation service/i
    );
  });

  it('ARM-11: rejects quote when catalogServiceKey not in catalog (single-service doctor)', async () => {
    const settings = baseDoctor({ service_offerings_json: catalogSingle('skin'), appointment_fee_minor: 42_00 });
    const state = {
      consultationType: 'video' as const,
      catalogServiceKey: 'bogus',
    } as ConversationState;
    await expect(computeSlotBookingQuote('d1', 'p1', state, settings, correlationId)).rejects.toThrow(
      /does not match an active service/i
    );
  });

  it('ARM-11: rejects quote when catalogServiceKey not in catalog (multi-service)', async () => {
    const settings = baseDoctor({ service_offerings_json: catalogMulti(), appointment_fee_minor: 42_00 });
    const state = {
      consultationType: 'video' as const,
      catalogServiceKey: 'nope',
    } as ConversationState;
    await expect(computeSlotBookingQuote('d1', 'p1', state, settings, correlationId)).rejects.toThrow(
      /does not match an active service/i
    );
  });

  it('ARM-11: rejects quote when catalogServiceId not in catalog', async () => {
    const settings = baseDoctor({ service_offerings_json: catalogMulti(), appointment_fee_minor: 42_00 });
    const state = {
      consultationType: 'video' as const,
      catalogServiceId: '00000000-0000-4000-8000-000000000099',
    } as ConversationState;
    await expect(computeSlotBookingQuote('d1', 'p1', state, settings, correlationId)).rejects.toThrow(
      /does not match an active service/i
    );
  });

  it('uses catalog quote for single-service teleconsult (video default)', async () => {
    const settings = baseDoctor();
    const state = { consultationType: 'video' as const } as ConversationState;
    const q = await computeSlotBookingQuote('d1', 'p1', state, settings, correlationId);
    expect(q.pricingSource).toBe('catalog_quote');
    expect(q.amountMinor).toBe(100_00);
    expect(q.currency).toBe('INR');
    expect(q.catalogServiceKey).toBe('skin');
    expect(q.quoteMetadata).toEqual({
      visit_kind: 'index',
      service_key: 'skin',
      service_id: sid('skin'),
      modality: 'video',
    });
    expect(mockedGetActiveEpisode).toHaveBeenCalledWith('d1', 'p1', 'skin', sid('skin'));
  });

  it('uses catalog quote with state consultationModality text', async () => {
    const settings = baseDoctor();
    const state = {
      consultationType: 'video' as const,
      consultationModality: 'text' as const,
    } as ConversationState;
    const q = await computeSlotBookingQuote('d1', 'p1', state, settings, correlationId);
    expect(q.pricingSource).toBe('catalog_quote');
    expect(q.amountMinor).toBe(50_00);
    expect(q.quoteMetadata?.modality).toBe('text');
  });

  it('uses explicit catalogServiceKey for multi-service doctor', async () => {
    const settings = baseDoctor({ service_offerings_json: catalogMulti() });
    const state = {
      consultationType: 'video' as const,
      catalogServiceKey: 'gp',
    } as ConversationState;
    const q = await computeSlotBookingQuote('d1', 'p1', state, settings, correlationId);
    expect(q.pricingSource).toBe('catalog_quote');
    expect(q.amountMinor).toBe(200_00);
    expect(q.quoteMetadata?.service_key).toBe('gp');
  });

  it('returns zero from catalog when modality price is 0 (free consult slot)', async () => {
    const zeroCat: ServiceCatalogV1 = {
      version: 1,
      services: [
        {
          service_id: sid('freebie'),
          service_key: 'freebie',
          label: 'Free',
          modalities: { video: { enabled: true, price_minor: 0 } },
        },
      ],
    };
    const settings = baseDoctor({ service_offerings_json: zeroCat, appointment_fee_minor: 99_00 });
    const state = { consultationType: 'video' as const } as ConversationState;
    const q = await computeSlotBookingQuote('d1', 'p1', state, settings, correlationId);
    expect(q.pricingSource).toBe('catalog_quote');
    expect(q.amountMinor).toBe(0);
  });
});
