/**
 * Content-sanity test for migration 167 (prescriptions.investigations_orders_json).
 *
 * plan-investigations-library · inv-lib-05
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/167_prescriptions_investigations_orders_json.sql',
);

describe('167_prescriptions_investigations_orders_json.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  describe('column investigations_orders_json', () => {
    it('adds JSONB NOT NULL column with empty-array default (idempotent)', () => {
      expect(sql).toMatch(
        /ADD COLUMN IF NOT EXISTS investigations_orders_json JSONB NOT NULL DEFAULT '\[\]'::jsonb/,
      );
    });
  });

  describe('CHECK constraint', () => {
    it('drops then adds the array-type constraint (idempotent re-run)', () => {
      expect(sql).toMatch(
        /DROP CONSTRAINT IF EXISTS prescriptions_investigations_orders_json_is_array/,
      );
      expect(sql).toMatch(
        /ADD CONSTRAINT prescriptions_investigations_orders_json_is_array/,
      );
      expect(sql).toMatch(
        /jsonb_typeof\(investigations_orders_json\) = 'array'/,
      );
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
    it('documents PHI + investigations_orders derivation contract (INV-D8)', () => {
      expect(sql).toMatch(
        /COMMENT ON COLUMN prescriptions\.investigations_orders_json IS/,
      );
      expect(sql).toMatch(/PHI/);
      expect(sql).toMatch(/investigations_orders TEXT is derived/);
      expect(sql).toMatch(/INV-D8/);
    });
  });

  describe('rollback documentation', () => {
    it('documents the drop-column rollback', () => {
      expect(sql).toMatch(/DROP COLUMN IF EXISTS investigations_orders_json/);
    });
  });
});
