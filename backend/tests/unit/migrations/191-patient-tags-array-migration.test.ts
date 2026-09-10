/**
 * Content-sanity test for migration 191 (patients.patient_tags).
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/191_patient_tags_array.sql'
);

describe('191_patient_tags_array.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  it('adds patient_tags TEXT[] with default empty array', () => {
    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS patient_tags TEXT\[] NOT NULL DEFAULT '\{\}'/s
    );
    expect(sql).toContain("patient_tags TEXT[] NOT NULL DEFAULT '{}'");
  });

  it('backfills from patient_tag', () => {
    expect(sql).toMatch(/ARRAY\[btrim\(patient_tag\)\]/);
    expect(sql).toMatch(/patient_tag IS NOT NULL/);
  });

  it('creates a GIN index', () => {
    expect(sql).toMatch(/idx_patients_tags_gin/);
    expect(sql).toMatch(/USING GIN \(patient_tags\)/);
  });

  it('documents non-PHI', () => {
    expect(sql).toMatch(/COMMENT ON COLUMN patients\.patient_tags IS/);
    expect(sql).toMatch(/not PHI/i);
  });
});
