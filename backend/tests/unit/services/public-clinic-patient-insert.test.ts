import { describe, it, expect } from '@jest/globals';
import { buildPublicClinicPatientInsert } from '../../../src/services/patient-service';

describe('public clinic patient insert', () => {
  it('stores age and sex, leaves date of birth unset, and does not use book-for-other', () => {
    const row = buildPublicClinicPatientInsert(
      '11111111-1111-4111-8111-111111111111',
      { name: 'Asha', phone: '+919800000000', age: 34, sex: 'female' },
      new Date('2026-09-23T00:00:00.000Z')
    );
    expect(row.age).toBe(34);
    expect(row.gender).toBe('female');
    expect(row.date_of_birth).toBeUndefined();
    expect(row.registered_via).toBe('public_clinic');
    expect(row.consent_method).toBe('owned_booking_page');
    expect(row.platform).toBeNull();
    expect(row.doctor_id).toBe('11111111-1111-4111-8111-111111111111');
  });
});
