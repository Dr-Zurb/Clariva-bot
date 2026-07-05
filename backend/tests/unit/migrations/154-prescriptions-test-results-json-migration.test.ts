/**
 * Content-sanity test for migration 154 (prescriptions.test_results_json).
 *
 * objective-tab p5 · obj-20
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/154_prescriptions_test_results_json.sql',
);

describe('154_prescriptions_test_results_json.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  describe('column test_results_json', () => {
    it('adds JSONB NOT NULL column with empty-array default (idempotent)', () => {
      expect(sql).toMatch(
        /ADD COLUMN IF NOT EXISTS test_results_json JSONB NOT NULL DEFAULT '\[\]'::jsonb/,
      );
    });
  });

  describe('CHECK constraint', () => {
    it('drops then adds the array-type constraint (idempotent re-run)', () => {
      expect(sql).toMatch(
        /DROP CONSTRAINT IF EXISTS prescriptions_test_results_json_is_array/,
      );
      expect(sql).toMatch(
        /ADD CONSTRAINT prescriptions_test_results_json_is_array/,
      );
      expect(sql).toMatch(/jsonb_typeof\(test_results_json\) = 'array'/);
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
    it('documents PHI + obj-20 derivation contract', () => {
      expect(sql).toMatch(/COMMENT ON COLUMN prescriptions\.test_results_json IS/);
      expect(sql).toMatch(/PHI/);
      expect(sql).toMatch(/test_results is derived from this/i);
    });
  });

  describe('rollback documentation', () => {
    it('documents the drop-column rollback', () => {
      expect(sql).toMatch(/DROP COLUMN IF EXISTS test_results_json/);
    });
  });
});
