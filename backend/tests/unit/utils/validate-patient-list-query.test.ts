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
      segment: undefined,
      sort: undefined,
      page: 1,
      pageSize: 50,
    });
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
