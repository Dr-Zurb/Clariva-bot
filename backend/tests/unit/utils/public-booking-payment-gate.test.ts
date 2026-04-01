import { describe, it, expect } from '@jest/globals';
import { evaluatePublicBookingPaymentGate } from '../../../src/utils/public-booking-payment-gate';
import type { DoctorSettingsRow } from '../../../src/types/doctor-settings';
import {
  deterministicServiceIdForLegacyOffering,
  type ServiceCatalogV1,
} from '../../../src/utils/service-catalog-schema';

const doc = 'arm10-test-doc';
const sid = (k: string) => deterministicServiceIdForLegacyOffering(doc, k);

function catalogTwo(): ServiceCatalogV1 {
  return {
    version: 1,
    services: [
      {
        service_id: sid('a'),
        service_key: 'a',
        label: 'A',
        modalities: { video: { enabled: true, price_minor: 100_00 } },
      },
      {
        service_id: sid('b'),
        service_key: 'b',
        label: 'B',
        modalities: { video: { enabled: true, price_minor: 200_00 } },
      },
    ],
  };
}

describe('public-booking-payment-gate (ARM-10)', () => {
  const settingsTwo: DoctorSettingsRow = {
    doctor_id: doc,
    service_offerings_json: catalogTwo(),
  } as DoctorSettingsRow;

  it('blocks when staff review pending without finalization', () => {
    const r = evaluatePublicBookingPaymentGate(
      {
        pendingStaffServiceReview: true,
        serviceSelectionFinalized: false,
        catalogServiceKey: 'a',
      },
      settingsTwo
    );
    expect(r).toEqual({ allowed: false, reason: 'staff_review_pending' });
  });

  it('allows when staff review pending is cleared and selection finalized (multi-service)', () => {
    const r = evaluatePublicBookingPaymentGate(
      {
        pendingStaffServiceReview: false,
        serviceSelectionFinalized: true,
        catalogServiceKey: 'a',
      },
      settingsTwo
    );
    expect(r).toEqual({ allowed: true });
  });

  it('blocks multi-service teleconsult when selection not finalized', () => {
    const r = evaluatePublicBookingPaymentGate(
      {
        pendingStaffServiceReview: false,
        serviceSelectionFinalized: false,
        consultationType: 'video',
      },
      settingsTwo
    );
    expect(r).toEqual({ allowed: false, reason: 'service_selection_not_finalized' });
  });

  it('allows single-service catalog without finalized flag (legacy / narrow SKUs)', () => {
    const oneSvc: DoctorSettingsRow = {
      doctor_id: doc,
      service_offerings_json: {
        version: 1,
        services: [
          {
            service_id: sid('only'),
            service_key: 'only',
            label: 'Only',
            modalities: { video: { enabled: true, price_minor: 100_00 } },
          },
        ],
      },
    } as DoctorSettingsRow;
    const r = evaluatePublicBookingPaymentGate(
      { serviceSelectionFinalized: false, consultationType: 'video' },
      oneSvc
    );
    expect(r).toEqual({ allowed: true });
  });

  it('allows in_clinic even with multi-service JSON present', () => {
    const r = evaluatePublicBookingPaymentGate(
      {
        consultationType: 'in_clinic',
        serviceSelectionFinalized: false,
      },
      settingsTwo
    );
    expect(r).toEqual({ allowed: true });
  });

  it('allows when no catalog', () => {
    const r = evaluatePublicBookingPaymentGate(
      { serviceSelectionFinalized: false },
      { doctor_id: doc } as DoctorSettingsRow
    );
    expect(r).toEqual({ allowed: true });
  });
});
