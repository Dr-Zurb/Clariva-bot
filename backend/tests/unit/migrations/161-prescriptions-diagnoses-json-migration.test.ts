/**
 * Content-sanity test for migration 161 (prescriptions.diagnoses_json).
 *
 * assessment-tab · asmt-03
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/161_prescriptions_diagnoses_json.sql',
);

describe('161_prescriptions_diagnoses_json.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  describe('column diagnoses_json', () => {
    it('adds JSONB NOT NULL column with empty-array default (idempotent)', () => {
      expect(sql).toMatch(
        /ADD COLUMN IF NOT EXISTS diagnoses_json JSONB NOT NULL DEFAULT '\[\]'::jsonb/,
      );
    });
  });

  describe('CHECK constraint', () => {
    it('drops then adds the array-type constraint (idempotent re-run)', () => {
      expect(sql).toMatch(
        /DROP CONSTRAINT IF EXISTS prescriptions_diagnoses_json_is_array/,
      );
      expect(sql).toMatch(
        /ADD CONSTRAINT prescriptions_diagnoses_json_is_array/,
      );
      expect(sql).toMatch(/jsonb_typeof\(diagnoses_json\) = 'array'/);
    });
  });

  describe('Row-Level Security', () => {
    it('does not enable RLS or add new policies (inherits migration 026)', () => {
      expect(sql).not.toMatch(/ENABLE ROW LEVEL SECURITY/i);
      expect(sql).not.toMatch(/CREATE POLICY/i);
      expect(sql).toMatch(/RLS unchanged/i);
    });
  });

  describe('column comment', () => {
    it('documents PHI + provisional_diagnosis derivation contract (ASMT-D4)', () => {
      expect(sql).toMatch(/COMMENT ON COLUMN prescriptions\.diagnoses_json IS/);
      expect(sql).toMatch(/PHI/);
      expect(sql).toMatch(/provisional_diagnosis/);
      expect(sql).toMatch(/derived/i);
    });
  });

  describe('rollback documentation', () => {
    it('documents the drop-column rollback', () => {
      expect(sql).toMatch(/DROP COLUMN IF EXISTS diagnoses_json/);
    });
  });
});
