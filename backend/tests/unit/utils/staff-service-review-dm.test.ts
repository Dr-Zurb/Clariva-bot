import { describe, it, expect } from '@jest/globals';
import {
  formatAwaitingStaffServiceConfirmationDm,
  formatStaffReviewResolvedContinueBookingDm,
  formatStaffServiceReviewSlaTimeoutDm,
  formatStaffServiceReviewStillPendingDm,
  resolveVisitTypeLabelForDm,
} from '../../../src/utils/staff-service-review-dm';
import { isSlotBookingBlockedPendingStaffReview } from '../../../src/types/conversation';
import type { DoctorSettingsRow } from '../../../src/types/doctor-settings';
import {
  deterministicServiceIdForLegacyOffering,
  type ServiceCatalogV1,
} from '../../../src/utils/service-catalog-schema';

const sid = (k: string) => deterministicServiceIdForLegacyOffering('sla-test-doc', k);

describe('staff-service-review-dm (ARM-05)', () => {
  const settings: DoctorSettingsRow = {
    doctor_id: 'sla-test-doc',
    practice_name: 'Demo Clinic',
  } as DoctorSettingsRow;

  const catalog: ServiceCatalogV1 = {
    version: 1,
    services: [
      {
        service_id: sid('skin'),
        service_key: 'skin',
        label: 'Dermatology consult',
        modalities: { video: { enabled: true, price_minor: 100_00 } },
      },
      {
        service_id: sid('other'),
        service_key: 'other',
        label: 'Other / not listed',
        modalities: { video: { enabled: true, price_minor: 50_00 } },
      },
    ],
  };

  it('resolveVisitTypeLabelForDm uses proposal key first', () => {
    const settingsWithCatalog = { ...settings, service_offerings_json: catalog };
    const label = resolveVisitTypeLabelForDm(settingsWithCatalog, {
      matcherProposedCatalogServiceKey: 'skin',
      catalogServiceKey: 'other',
    });
    expect(label).toBe('Dermatology consult');
  });

  it('formatAwaitingStaffServiceConfirmationDm includes practice and SLA wording', () => {
    const settingsWithCatalog = { ...settings, service_offerings_json: catalog };
    const s = formatAwaitingStaffServiceConfirmationDm(settingsWithCatalog, {
      matcherProposedCatalogServiceKey: 'skin',
    });
    expect(s).toContain('Demo Clinic');
    expect(s).toContain('24 hours');
    expect(s).toMatch(/not need to pay|pay yet/i);
    expect(s).toContain('Dermatology consult');
  });

  it('formatStaffServiceReviewStillPendingDm is a short reassurance', () => {
    const s = formatStaffServiceReviewStillPendingDm(settings);
    expect(s).toContain('Demo Clinic');
    expect(s).toContain('24 hours');
  });

  it('formatStaffServiceReviewSlaTimeoutDm states closure, no charge, and re-engagement (ARM-08)', () => {
    const s = formatStaffServiceReviewSlaTimeoutDm(settings);
    expect(s).toContain('Demo Clinic');
    expect(s).toMatch(/not been charged|haven't been charged|have not been charged/i);
    expect(s).toMatch(/closed|close/i);
  });

  it('formatStaffReviewResolvedContinueBookingDm includes booking URL and visit label', () => {
    const url = 'https://app.example/book?token=abc';
    const c = formatStaffReviewResolvedContinueBookingDm(settings, 'General Checkup', url, 'confirmed');
    expect(c).toContain('Demo Clinic');
    expect(c).toContain('General Checkup');
    expect(c).toContain(url);
    expect(c).toMatch(/confirm/i);
    const r = formatStaffReviewResolvedContinueBookingDm(settings, 'Follow-up', url, 'reassigned');
    expect(r).toContain('updated');
    expect(r).toContain('Follow-up');
  });

  it('isSlotBookingBlockedPendingStaffReview matches ARM-03 flags', () => {
    expect(
      isSlotBookingBlockedPendingStaffReview({
        pendingStaffServiceReview: true,
        serviceSelectionFinalized: false,
      })
    ).toBe(true);
    expect(
      isSlotBookingBlockedPendingStaffReview({
        pendingStaffServiceReview: true,
        serviceSelectionFinalized: true,
      })
    ).toBe(false);
    expect(isSlotBookingBlockedPendingStaffReview({})).toBe(false);
  });
});
