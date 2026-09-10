import { describe, expect, it } from '@jest/globals';
import { ageYearsFromIsoDate } from '../../../src/utils/validation';
import {
  effectiveAgeYears,
  matchesPatientIdentityFilter,
} from '../../../src/utils/patient-identity-filter';

describe('effectiveAgeYears', () => {
  it('prefers date of birth over the stored age', () => {
    const dob = `${new Date().getFullYear() - 31}-01-01`;
    expect(effectiveAgeYears(99, dob)).toBe(ageYearsFromIsoDate(dob));
  });

  it('falls back to stored age when DOB is missing', () => {
    expect(effectiveAgeYears(60, null)).toBe(60);
  });
});

describe('matchesPatientIdentityFilter', () => {
  const row = {
    name: 'Sunita Devi',
    guardian_name: 'Ram Prakash',
    age: 62,
    date_of_birth: '1964-01-01',
    gender: 'female',
  };

  it('ANDs name, guardian, age window, and gender', () => {
    expect(
      matchesPatientIdentityFilter(row, {
        name: 'sunita',
        guardianName: 'ram',
        age: 62,
        gender: 'female',
      })
    ).toBe(true);
  });

  it('allows age within ±3 using DOB-derived years', () => {
    const years = effectiveAgeYears(row.age, row.date_of_birth);
    expect(matchesPatientIdentityFilter(row, { name: 'Sunita', age: (years ?? 62) + 3 })).toBe(
      true
    );
    expect(matchesPatientIdentityFilter(row, { name: 'Sunita', age: (years ?? 62) + 4 })).toBe(
      false
    );
  });

  it('rejects a gender mismatch', () => {
    expect(matchesPatientIdentityFilter(row, { name: 'Sunita', gender: 'male' })).toBe(false);
  });
});
