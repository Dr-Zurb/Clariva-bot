import { describe, expect, it } from '@jest/globals';
import {
  computeAgeLabel,
  formatAgeGender,
  formatGuardianLine,
} from '../../../src/templates/prescription-pdf/patient-identity';

describe('computeAgeLabel', () => {
  it('returns null for missing or impossible DOB', () => {
    expect(computeAgeLabel(null)).toBeNull();
    expect(computeAgeLabel('not-a-date')).toBeNull();
  });
});

describe('formatAgeGender', () => {
  it('joins age and gender', () => {
    expect(formatAgeGender('50 y', 'male')).toBe('50 y · M');
    expect(formatAgeGender('8 y', 'female')).toBe('8 y · F');
  });

  it('omits the missing half', () => {
    expect(formatAgeGender('50 y', null)).toBe('50 y');
    expect(formatAgeGender(null, 'male')).toBe('M');
    expect(formatAgeGender(null, null)).toBeNull();
  });
});

describe('formatGuardianLine', () => {
  it('uses s/o d/o w/o c/o', () => {
    expect(formatGuardianLine('Minder Singh', 'father', 'male')).toBe('s/o Minder Singh');
    expect(formatGuardianLine('Minder Singh', 'father', 'female')).toBe('d/o Minder Singh');
    expect(formatGuardianLine('Kaur', 'spouse', null)).toBe('w/o Kaur');
    expect(formatGuardianLine('Rani', 'mother', null)).toBe('c/o Rani');
  });

  it('returns null when the name is empty', () => {
    expect(formatGuardianLine('  ', 'father', 'male')).toBeNull();
    expect(formatGuardianLine(null, 'father', 'male')).toBeNull();
  });
});
