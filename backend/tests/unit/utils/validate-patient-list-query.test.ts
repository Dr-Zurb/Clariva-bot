/**
 * Patients list query validation (pr-02).
 */

import { describe, it, expect } from '@jest/globals';
import {
  PatientListQueryError,
  validatePatientListQuery,
} from '../../../src/utils/validation';

describe('validatePatientListQuery', () => {
  it('parses defaults for page and pageSize', () => {
    expect(validatePatientListQuery({})).toEqual({
      q: undefined,
      name: undefined,
      guardianName: undefined,
      age: undefined,
      gender: undefined,
      segment: undefined,
      tag: undefined,
      sort: undefined,
      page: 1,
      pageSize: 50,
      includeArchived: undefined,
      lean: undefined,
    });
  });

  it('parses lean=true', () => {
    expect(validatePatientListQuery({ lean: 'true' }).lean).toBe(true);
    expect(validatePatientListQuery({ lean: 'false' }).lean).toBeUndefined();
  });

  it('parses includeArchived=true', () => {
    expect(validatePatientListQuery({ includeArchived: 'true' }).includeArchived).toBe(true);
    expect(validatePatientListQuery({ includeArchived: 'false' }).includeArchived).toBeUndefined();
  });

  it('parses desk identity filters', () => {
    expect(
      validatePatientListQuery({
        name: '  Sunita  ',
        guardianName: 'Ram Prakash',
        age: '62',
        gender: 'female',
      })
    ).toEqual(
      expect.objectContaining({
        name: 'Sunita',
        guardianName: 'Ram Prakash',
        age: 62,
        gender: 'female',
      })
    );
  });

  it('parses tag filter', () => {
    expect(validatePatientListQuery({ tag: '  VIP  ' }).tag).toBe('VIP');
  });

  it('throws invalid_segment for unknown segment', () => {
    expect(() => validatePatientListQuery({ segment: 'unknown' })).toThrow(PatientListQueryError);
    try {
      validatePatientListQuery({ segment: 'unknown' });
    } catch (e) {
      expect((e as PatientListQueryError).name).toBe('invalid_segment');
    }
  });

  it('throws segment_unsupported_on_current_schema for at-risk-followup', () => {
    try {
      validatePatientListQuery({ segment: 'at-risk-followup' });
    } catch (e) {
      expect((e as PatientListQueryError).name).toBe('segment_unsupported_on_current_schema');
    }
  });

  it('throws page_size_too_large when pageSize > 200', () => {
    try {
      validatePatientListQuery({ pageSize: '250' });
    } catch (e) {
      expect((e as PatientListQueryError).name).toBe('page_size_too_large');
    }
  });
});
