/**
 * SFU-07: public /book catalog merge + validation
 */

import { describe, it, expect } from '@jest/globals';
import type { DoctorSettingsRow } from '../../../src/types/doctor-settings';
import type { ConversationState } from '../../../src/types/conversation';
import {
  deterministicServiceIdForLegacyOffering,
  type ServiceCatalogV1,
} from '../../../src/utils/service-catalog-schema';

const DOC = 'd1';
const id = (k: string) => deterministicServiceIdForLegacyOffering(DOC, k);
import { ValidationError } from '../../../src/utils/errors';
import {
  applyPublicBookingSelectionsToState,
  getBookingPageCatalogPayload,
} from '../../../src/services/slot-selection-service';

function catTwoModalities(): ServiceCatalogV1 {
  return {
    version: 1,
    services: [
      {
        service_id: id('skin'),
        service_key: 'skin',
        label: 'Dermatology',
        modalities: {
          video: { enabled: true, price_minor: 100_00 },
          text: { enabled: true, price_minor: 50_00 },
        },
      },
    ],
  };
}

function catMultiService(): ServiceCatalogV1 {
  return {
    version: 1,
    services: [
      {
        service_id: id('a'),
        service_key: 'a',
        label: 'A',
        modalities: { video: { enabled: true, price_minor: 1 } },
      },
      {
        service_id: id('b'),
        service_key: 'b',
        label: 'B',
        modalities: { video: { enabled: true, price_minor: 2 } },
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
    service_offerings_json: catTwoModalities(),
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

describe('getBookingPageCatalogPayload', () => {
  it('returns null for reschedule mode', () => {
    expect(getBookingPageCatalogPayload(baseDoctor(), 'reschedule')).toBeNull();
  });

  it('returns services with enabled modalities and prices', () => {
    const p = getBookingPageCatalogPayload(baseDoctor(), 'book');
    expect(p?.version).toBe(1);
    expect(p?.services).toHaveLength(1);
    expect(p?.services[0]!.modalities.video).toEqual({ enabled: true, price_minor: 100_00 });
    expect(p?.services[0]!.modalities.text).toEqual({ enabled: true, price_minor: 50_00 });
    expect(p?.services[0]!.service_id).toBeTruthy();
    expect(p?.feeCurrency).toBe('INR');
  });
});

describe('applyPublicBookingSelectionsToState', () => {
  it('skips catalog merge for reschedule', () => {
    const state = {} as ConversationState;
    const next = applyPublicBookingSelectionsToState(state, baseDoctor(), {}, true);
    expect(next).toBe(state);
  });

  it('skips catalog merge for in_clinic', () => {
    const state = { consultationType: 'in_clinic' as const } as ConversationState;
    const next = applyPublicBookingSelectionsToState(
      state,
      baseDoctor(),
      { consultationModality: 'video', catalogServiceKey: 'skin' },
      false
    );
    expect(next.catalogServiceKey).toBeUndefined();
  });

  it('returns state unchanged when no catalog', () => {
    const state = {} as ConversationState;
    const doc = baseDoctor({ service_offerings_json: null });
    const next = applyPublicBookingSelectionsToState(state, doc, {}, false);
    expect(next).toBe(state);
  });

  it('auto-picks single service and single modality', () => {
    const catalog: ServiceCatalogV1 = {
      version: 1,
      services: [
        {
          service_id: id('only'),
          service_key: 'only',
          label: 'Only',
          modalities: { video: { enabled: true, price_minor: 10 } },
        },
      ],
    };
    const doc = baseDoctor({ service_offerings_json: catalog });
    const next = applyPublicBookingSelectionsToState({} as ConversationState, doc, {}, false);
    expect(next.catalogServiceKey).toBe('only');
    expect(next.consultationModality).toBe('video');
  });

  it('requires modality when multiple enabled', () => {
    const doc = baseDoctor();
    expect(() =>
      applyPublicBookingSelectionsToState({} as ConversationState, doc, { catalogServiceKey: 'skin' }, false)
    ).toThrow(ValidationError);
  });

  it('accepts valid service + modality', () => {
    const doc = baseDoctor();
    const next = applyPublicBookingSelectionsToState(
      {} as ConversationState,
      doc,
      { catalogServiceKey: 'skin', consultationModality: 'text' },
      false
    );
    expect(next.catalogServiceKey).toBe('skin');
    expect(next.catalogServiceId).toBe(id('skin'));
    expect(next.consultationModality).toBe('text');
  });

  it('rejects disabled modality', () => {
    const catalog: ServiceCatalogV1 = {
      version: 1,
      services: [
        {
          service_id: id('x'),
          service_key: 'x',
          label: 'X',
          modalities: { video: { enabled: true, price_minor: 1 }, voice: { enabled: false, price_minor: 0 } },
        },
      ],
    };
    const doc = baseDoctor({ service_offerings_json: catalog });
    expect(() =>
      applyPublicBookingSelectionsToState(
        {} as ConversationState,
        doc,
        { catalogServiceKey: 'x', consultationModality: 'voice' },
        false
      )
    ).toThrow(ValidationError);
  });

  it('requires service when multi-service and no state key', () => {
    const doc = baseDoctor({ service_offerings_json: catMultiService() });
    expect(() =>
      applyPublicBookingSelectionsToState({} as ConversationState, doc, { consultationModality: 'video' }, false)
    ).toThrow(ValidationError);
  });
});
