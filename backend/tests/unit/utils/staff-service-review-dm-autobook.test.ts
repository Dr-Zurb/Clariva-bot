import { describe, it, expect } from '@jest/globals';
import { formatStaffReviewResolvedContinueBookingDm } from '../../../src/utils/staff-service-review-dm';
import type { DoctorSettingsRow } from '../../../src/types/doctor-settings';

describe('formatStaffReviewResolvedContinueBookingDm (learn-05)', () => {
  it('learning_policy_autobook uses preference copy', () => {
    const settings = { practice_name: 'Demo Clinic' } as DoctorSettingsRow;
    const text = formatStaffReviewResolvedContinueBookingDm(
      settings,
      'Teleconsult',
      'https://book.example/c',
      'learning_policy_autobook'
    );
    expect(text).toContain('saved visit-type preference');
    expect(text).toContain('Teleconsult');
    expect(text).toContain('https://book.example/c');
  });
});
