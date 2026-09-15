import { describe, expect, it } from '@jest/globals';
import {
  EMPTY_DESK_PREP_FLAGS,
  deskPrepFlagsFromEmbeds,
  isDeskPrepRelationError,
  rowHasDeskPrepEmbeds,
} from '../../../src/services/desk-prep-flags';

describe('deskPrepFlagsFromEmbeds', () => {
  it('treats empty embeds as missing prep', () => {
    expect(
      deskPrepFlagsFromEmbeds({
        patient_vitals: [],
        patient_history_submissions: [],
        visit_documents: [],
      })
    ).toEqual(EMPTY_DESK_PREP_FLAGS);
  });

  it('fills V only from a non-archived patient_vitals row', () => {
    expect(
      deskPrepFlagsFromEmbeds({
        patient_vitals: [{ id: 'v1', archived_at: null }],
      }).has_desk_vitals
    ).toBe(true);
    expect(
      deskPrepFlagsFromEmbeds({
        patient_vitals: [{ id: 'v1', archived_at: '2026-09-12T10:00:00Z' }],
      }).has_desk_vitals
    ).toBe(false);
  });

  it('fills H from a sidecar object or array', () => {
    expect(
      deskPrepFlagsFromEmbeds({
        patient_history_submissions: { id: 'h1' },
      }).has_history_submission
    ).toBe(true);
    expect(
      deskPrepFlagsFromEmbeds({
        patient_history_submissions: [{ id: 'h1' }],
      }).has_history_submission
    ).toBe(true);
  });

  it('counts visit_documents rows for D', () => {
    expect(
      deskPrepFlagsFromEmbeds({
        visit_documents: [{ id: 'd1' }, { id: 'd2' }],
      })
    ).toEqual({
      has_desk_vitals: false,
      has_history_submission: false,
      visit_document_count: 2,
      has_visit_documents: true,
    });
    expect(
      deskPrepFlagsFromEmbeds({
        visit_documents: [],
      }).has_visit_documents
    ).toBe(false);
  });
});

describe('rowHasDeskPrepEmbeds', () => {
  it('is false on a plain appointment row', () => {
    expect(rowHasDeskPrepEmbeds({ id: 'apt_1' })).toBe(false);
  });

  it('is true when the list select included an embed key', () => {
    expect(rowHasDeskPrepEmbeds({ id: 'apt_1', patient_vitals: [] })).toBe(true);
  });
});

describe('isDeskPrepRelationError', () => {
  it('matches a missing PostgREST relationship', () => {
    expect(
      isDeskPrepRelationError({
        code: 'PGRST200',
        message: "Could not find a relationship between 'appointments' and 'visit_documents'",
      })
    ).toBe(true);
  });

  it('does not swallow unrelated list errors', () => {
    expect(
      isDeskPrepRelationError({
        code: 'PGRST116',
        message: 'JSON object requested, multiple (or no) rows returned',
      })
    ).toBe(false);
    expect(isDeskPrepRelationError(null)).toBe(false);
  });
});
