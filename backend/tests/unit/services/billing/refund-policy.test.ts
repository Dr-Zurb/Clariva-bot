import { describe, it, expect } from '@jest/globals';
import { resolveRefundPolicy } from '../../../../src/services/billing/refund-policy';

describe('resolveRefundPolicy', () => {
  it('refunds 100% for the four automatic floor cases', () => {
    expect(
      resolveRefundPolicy({
        cancelledBy: 'doctor',
        hoursBeforeAppointment: 1,
        reasonClass: 'other',
      }).refundPercent
    ).toBe(100);
    expect(
      resolveRefundPolicy({
        cancelledBy: 'patient',
        hoursBeforeAppointment: 1,
        reasonClass: 'emergency',
      }).refundPercent
    ).toBe(100);
    expect(
      resolveRefundPolicy({
        cancelledBy: 'platform',
        hoursBeforeAppointment: 1,
        reasonClass: 'platform_failure',
      }).refundPercent
    ).toBe(100);
    expect(
      resolveRefundPolicy({
        cancelledBy: 'patient',
        hoursBeforeAppointment: 1,
        reasonClass: 'duplicate_charge',
      }).refundPercent
    ).toBe(100);
  });

  it('does not refund a patient no-show', () => {
    expect(
      resolveRefundPolicy({
        cancelledBy: 'patient',
        hoursBeforeAppointment: 0,
        reasonClass: 'no_show',
      })
    ).toEqual({ refundPercent: 0, requiresReview: false });
  });

  it('launch-defaults patient cancel to 100% even inside 24h', () => {
    expect(
      resolveRefundPolicy({
        cancelledBy: 'patient',
        hoursBeforeAppointment: 2,
        reasonClass: 'patient_cancel',
      }).refundPercent
    ).toBe(100);
  });
});
