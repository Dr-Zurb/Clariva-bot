/**
 * Content-sanity test for migration 169 (investigations_custom_orders).
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/169_doctor_settings_investigations_custom_orders.sql',
);

describe('169_doctor_settings_investigations_custom_orders.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  describe('column doctor_settings.investigations_custom_orders', () => {
    it('adds JSONB NOT NULL column with empty-array default (idempotent)', () => {
      expect(sql).toMatch(
        /ADD COLUMN IF NOT EXISTS investigations_custom_orders JSONB NOT NULL DEFAULT '\[\]'::jsonb/,
      );
    });

    it('drops then adds the array-type CHECK (idempotent re-run)', () => {
      expect(sql).toMatch(
        /DROP CONSTRAINT IF EXISTS doctor_settings_investigations_custom_orders_is_array/,
      );
      expect(sql).toMatch(
        /ADD CONSTRAINT\s+doctor_settings_investigations_custom_orders_is_array/,
      );
      expect(sql).toMatch(/jsonb_typeof\(investigations_custom_orders\) = 'array'/);
    });

    it('documents the config-only (not PHI), Zod-validated contract', () => {
      expect(sql).toMatch(/COMMENT ON COLUMN doctor_settings\.investigations_custom_orders IS/);
      expect(sql).toMatch(/not PHI/i);
      expect(sql).toMatch(/Zod/i);
    });
  });

  describe('additive + reversible', () => {
    it('does not rewrite data or alter/drop existing columns', () => {
      expect(sql).not.toMatch(/UPDATE\s+doctor_settings/i);
      expect(sql).not.toMatch(/ALTER COLUMN/i);
      expect(sql).not.toMatch(/DROP COLUMN (?!IF EXISTS investigations_custom_orders)/i);
    });

    it('documents a drop-column rollback', () => {
      expect(sql).toMatch(/Rollback/i);
      expect(sql).toMatch(/DROP COLUMN IF EXISTS investigations_custom_orders/);
    });
  });

  describe('Row-Level Security', () => {
    it('does not enable RLS or add new policies (inherits 009)', () => {
      expect(sql).not.toMatch(/ENABLE ROW LEVEL SECURITY/i);
      expect(sql).not.toMatch(/CREATE POLICY/i);
      expect(sql).toMatch(/RLS unchanged/i);
    });
  });
});
