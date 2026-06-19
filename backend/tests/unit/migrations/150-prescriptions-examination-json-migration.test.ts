/**
 * Content-sanity test for migration 150 (prescriptions.examination_json).
 *
 * objective-tab p1 · obj-01
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/150_prescriptions_examination_json.sql',
);

describe('150_prescriptions_examination_json.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  describe('column examination_json', () => {
    it('adds JSONB NOT NULL column with empty-array default (idempotent)', () => {
      expect(sql).toMatch(
        /ADD COLUMN IF NOT EXISTS examination_json JSONB NOT NULL DEFAULT '\[\]'::jsonb/,
      );
    });
  });

  describe('CHECK constraint', () => {
    it('drops then adds the array-type constraint (idempotent re-run)', () => {
      expect(sql).toMatch(
        /DROP CONSTRAINT IF EXISTS prescriptions_examination_json_is_array/,
      );
      expect(sql).toMatch(
        /ADD CONSTRAINT prescriptions_examination_json_is_array/,
      );
      expect(sql).toMatch(/jsonb_typeof\(examination_json\) = 'array'/);
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
    it('documents PHI + obj-01 derivation contract', () => {
      expect(sql).toMatch(/COMMENT ON COLUMN prescriptions\.examination_json IS/);
      expect(sql).toMatch(/PHI/);
      expect(sql).toMatch(/examination_findings is derived from this/i);
    });
  });

  describe('rollback documentation', () => {
    it('documents the drop-column rollback', () => {
      expect(sql).toMatch(/DROP COLUMN IF EXISTS examination_json/);
    });
  });
});
