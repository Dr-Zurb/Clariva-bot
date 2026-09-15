import { describe, expect, it } from '@jest/globals';

import {
  canWriteVisitDocumentKind,
  hasAnyStaffCapability,
  normalizeStaffCapabilities,
  roleForCapabilities,
  seatsOverlap,
} from '../../../src/auth/staff-capabilities';
import { ValidationError } from '../../../src/utils/errors';

const ALL = ['front_desk', 'vitals', 'history', 'internal_labs', 'papers'];
const PREP = ['vitals', 'history', 'internal_labs', 'papers'];

describe('normalizeStaffCapabilities', () => {
  it('defaults to every seat when omitted', () => {
    expect(normalizeStaffCapabilities()).toEqual(ALL);
  });

  it('rejects an empty list', () => {
    expect(() => normalizeStaffCapabilities([])).toThrow(ValidationError);
  });

  it('keeps only known capabilities in lock order', () => {
    expect(normalizeStaffCapabilities(['history', 'unknown', 'front_desk'])).toEqual([
      'front_desk',
      'history',
    ]);
  });

  it('folds leftover billing into front_desk', () => {
    expect(normalizeStaffCapabilities(['billing'])).toEqual(['front_desk']);
    expect(normalizeStaffCapabilities(['front_desk', 'billing', 'previsit'])).toEqual(ALL);
  });

  it('folds leftover previsit into the four prep seats', () => {
    expect(normalizeStaffCapabilities(['previsit'])).toEqual(PREP);
  });
});

describe('roleForCapabilities', () => {
  it('stays receptionist when the login can register', () => {
    expect(roleForCapabilities(['front_desk'])).toBe('receptionist');
  });

  it('is assistant when there is no front_desk seat', () => {
    expect(roleForCapabilities(['previsit'])).toBe('assistant');
    expect(roleForCapabilities(['vitals'])).toBe('assistant');
  });
});

describe('seatsOverlap', () => {
  it('treats leftover billing as the registration seat', () => {
    expect(seatsOverlap(['billing'], ['front_desk'])).toBe(true);
    expect(seatsOverlap(['billing'], ['previsit'])).toBe(false);
  });

  it('detects a shared prep seat after the previsit fold', () => {
    expect(seatsOverlap(['previsit'], ['front_desk', 'previsit'])).toBe(true);
    expect(seatsOverlap(['vitals'], ['history'])).toBe(false);
  });
});

describe('hasAnyStaffCapability', () => {
  it('fails closed on a missing list', () => {
    expect(hasAnyStaffCapability(undefined, ['front_desk'])).toBe(false);
  });

  it('matches any required capability after fold', () => {
    expect(hasAnyStaffCapability(['previsit'], ['vitals', 'front_desk'])).toBe(true);
    expect(hasAnyStaffCapability(['previsit'], ['front_desk'])).toBe(false);
  });

  it('treats leftover billing as front_desk', () => {
    expect(hasAnyStaffCapability(['billing'], ['front_desk'])).toBe(true);
  });
});

describe('canWriteVisitDocumentKind', () => {
  it('leaves the doctor unrestricted', () => {
    expect(canWriteVisitDocumentKind(undefined, 'lab_report', 'us')).toBe(true);
  });

  it('gives internal labs only to the internal_labs seat', () => {
    expect(canWriteVisitDocumentKind(['internal_labs'], 'lab_report', 'us')).toBe(true);
    expect(canWriteVisitDocumentKind(['papers'], 'lab_report', 'us')).toBe(false);
  });

  it('gives every other paper to the papers seat', () => {
    expect(canWriteVisitDocumentKind(['papers'], 'lab_report', 'outside')).toBe(true);
    expect(canWriteVisitDocumentKind(['papers'], 'other', 'outside')).toBe(true);
    expect(canWriteVisitDocumentKind(['internal_labs'], 'other', 'outside')).toBe(false);
  });

  it('folds leftover previsit into both document seats', () => {
    expect(canWriteVisitDocumentKind(['previsit'], 'lab_report', 'us')).toBe(true);
    expect(canWriteVisitDocumentKind(['previsit'], 'referral', 'outside')).toBe(true);
  });
});
