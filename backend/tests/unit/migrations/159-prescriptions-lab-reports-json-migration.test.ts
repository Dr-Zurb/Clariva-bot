/**
 * Content-sanity test for migration 159 (prescriptions.lab_reports_json).
 *
 * objective-reports-section · rpt-02
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/159_prescriptions_lab_reports_json.sql',
);

describe('159_prescriptions_lab_reports_json.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  describe('column lab_reports_json', () => {
    it('adds JSONB NOT NULL column with empty-array default (idempotent)', () => {
      expect(sql).toMatch(
        /ADD COLUMN IF NOT EXISTS lab_reports_json JSONB NOT NULL DEFAULT '\[\]'::jsonb/,
      );
    });
  });

  describe('CHECK constraint', () => {
    it('drops then adds the array-type constraint (idempotent re-run)', () => {
      expect(sql).toMatch(
        /DROP CONSTRAINT IF EXISTS prescriptions_lab_reports_json_is_array/,
      );
      expect(sql).toMatch(
        /ADD CONSTRAINT prescriptions_lab_reports_json_is_array/,
      );
      expect(sql).toMatch(/jsonb_typeof\(lab_reports_json\) = 'array'/);
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
    it('documents PHI + the byte-identical test_results derivation contract', () => {
      expect(sql).toMatch(/COMMENT ON COLUMN prescriptions\.lab_reports_json IS/);
      expect(sql).toMatch(/PHI/);
      expect(sql).toMatch(/does NOT alter the derived test_results TEXT/i);
    });
  });

  describe('rollback documentation', () => {
    it('documents the drop-column rollback', () => {
      expect(sql).toMatch(/DROP COLUMN IF EXISTS lab_reports_json/);
    });
  });
});
