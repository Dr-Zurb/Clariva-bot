/**
 * Unit tests for the diagnosis-catalog seed parser (assessment-tab · asmt-06).
 *
 * The seed script applies the full ICD-11 MMS import (migration 163) through
 * the service-role client because the ~1.9 MB SQL is too large for the Supabase
 * SQL editor. These tests lock the parser that reads the canonical `163_*.sql`
 * so the script and the migration can never drift.
 */

import { describe, expect, it, jest } from '@jest/globals';

// Prevent the script's `../src/config/database` import from loading + validating
// real env at module import time.
jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

import { parseSeedRows } from '../../../scripts/seed-diagnosis-catalog';

const SAMPLE = [
  '-- a comment line that must be ignored',
  'INSERT INTO diagnosis_catalog (code, title, synonyms, chapter)',
  'SELECT v.code, v.title, v.synonyms, v.chapter',
  'FROM (VALUES',
  "  ('BA00', 'Essential hypertension', '{}'::text[], 'Circulatory system'),",
  "  ('1C19.0', 'Nonpneumonic Legionnaires'' disease', '{}'::text[], 'Infectious or parasitic'),",
  "  ('RA00', 'Conditions of uncertain aetiology, emergency use', '{}'::text[], NULL)",
  ') AS v(code, title, synonyms, chapter)',
  'WHERE NOT EXISTS (',
  '  SELECT 1 FROM diagnosis_catalog d WHERE lower(d.code) = lower(v.code)',
  ');',
].join('\n');

describe('parseSeedRows', () => {
  const rows = parseSeedRows(SAMPLE);

  it('extracts one row per VALUES tuple and ignores non-row lines', () => {
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.code)).toEqual(['BA00', '1C19.0', 'RA00']);
  });

  it('un-escapes doubled single quotes in titles', () => {
    expect(rows[1]).toEqual({
      code: '1C19.0',
      title: "Nonpneumonic Legionnaires' disease",
      chapter: 'Infectious or parasitic',
    });
  });

  it('keeps commas inside a quoted title', () => {
    expect(rows[2].title).toBe('Conditions of uncertain aetiology, emergency use');
  });

  it('maps a NULL chapter to null (not the string "NULL")', () => {
    expect(rows[2].chapter).toBeNull();
  });
});
