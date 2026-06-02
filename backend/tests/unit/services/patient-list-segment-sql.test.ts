/**
 * Segment SQL predicate tests (pr-02) — assert WHERE fragments match DL-4 spec.
 */

import { describe, it, expect } from '@jest/globals';
import {
  PATIENT_SEGMENT_IDS,
  segmentWherePredicate,
  sortOrderByClause,
  textSearchWherePredicate,
} from '../../../src/services/patient-list-segment-sql';

describe('patient-list-segment-sql', () => {
  it('exports all segment ids', () => {
    expect(PATIENT_SEGMENT_IDS).toEqual([
      'active-90d',
      'new-30d',
      'at-risk-followup',
      'no-show-prone',
      'has-allergies',
      'has-open-episodes',
      'untagged',
    ]);
  });

  const segmentCases: Array<[Parameters<typeof segmentWherePredicate>[0], string]> = [
    ['active-90d', "INTERVAL '90 days'"],
    ['new-30d', "INTERVAL '30 days'"],
    ['at-risk-followup', 'follow_up_value'],
    ['no-show-prone', "FILTER (WHERE status = 'no_show')"],
    ['has-allergies', 'patient_allergies'],
    ['has-open-episodes', "source = 'episode'"],
    ['untagged', 'patient_tag IS NULL'],
  ];

  it.each(segmentCases)('segment %s includes expected predicate fragment', (segment, fragment) => {
    expect(segmentWherePredicate(segment)).toContain(fragment);
  });

  it('text search matches name, phone, MRN, and platform handle', () => {
    const sql = textSearchWherePredicate();
    expect(sql).toContain('LOWER(name)');
    expect(sql).toContain('phone LIKE');
    expect(sql).toContain('medical_record_number');
    expect(sql).toContain('platform_external_id');
  });

  it('default sort is last visit desc', () => {
    expect(sortOrderByClause(undefined)).toContain('last_appointment_date DESC NULLS LAST');
    expect(sortOrderByClause('name-asc')).toContain('LOWER(name) ASC');
  });
});
