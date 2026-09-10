import { describe, expect, it } from '@jest/globals';
import {
  comparePatientSearchHits,
  isNameSearchQuery,
  patientSearchRank,
} from '../../../src/utils/patient-search-rank';

describe('isNameSearchQuery', () => {
  it('accepts a person name and rejects phone / MRN', () => {
    expect(isNameSearchQuery('jasbir')).toBe(true);
    expect(isNameSearchQuery('Jasbir Kaur')).toBe(true);
    expect(isNameSearchQuery('9814861579')).toBe(false);
    expect(isNameSearchQuery('P-03408')).toBe(false);
    expect(isNameSearchQuery('p00012')).toBe(false);
  });
});

describe('patientSearchRank', () => {
  it('ranks patient name above relative name', () => {
    expect(patientSearchRank('jasbir', 'Jasbir Kaur', 'Balwinder Singh')).toBe(0);
    expect(patientSearchRank('jasbir', 'Manjot Kaur', 'Jasbir Singh')).toBe(2);
  });
});

describe('comparePatientSearchHits', () => {
  it('orders name hits before guardian-only hits, then A–Z', () => {
    const rows = [
      { name: 'Manjot Kaur', guardian_name: 'Jasbir Singh' },
      { name: 'Jasbir Singh', guardian_name: 'Chanan Singh' },
      { name: 'Jasbir Kaur', guardian_name: 'Kewal Singh' },
    ];
    const sorted = [...rows].sort((a, b) => comparePatientSearchHits('jasbir', a, b));
    expect(sorted.map((r) => r.name)).toEqual(['Jasbir Kaur', 'Jasbir Singh', 'Manjot Kaur']);
  });
});
