/**
 * Content-sanity test for migration 157 (doctor_settings.vitals_custom).
 *
 * vitals-section · VP3+ · vit-14
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/157_doctor_settings_vitals_custom.sql',
);

describe('157_doctor_settings_vitals_custom.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  describe('column doctor_settings.vitals_custom', () => {
    it('adds JSONB NOT NULL column with empty-array default (idempotent)', () => {
      expect(sql).toMatch(
        /ADD COLUMN IF NOT EXISTS vitals_custom JSONB NOT NULL DEFAULT '\[\]'::jsonb/,
      );
    });

    it('drops then adds the array-type CHECK (idempotent re-run)', () => {
      expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS doctor_settings_vitals_custom_is_array/);
      expect(sql).toMatch(/ADD CONSTRAINT\s+doctor_settings_vitals_custom_is_array/);
      expect(sql).toMatch(/jsonb_typeof\(vitals_custom\) = 'array'/);
    });

    it('documents the config-only (not PHI), Zod-validated contract', () => {
      expect(sql).toMatch(/COMMENT ON COLUMN doctor_settings\.vitals_custom IS/);
      expect(sql).toMatch(/not PHI/i);
      expect(sql).toMatch(/Zod/i);
    });
  });

  describe('additive + reversible', () => {
    it('does not rewrite data or alter/drop existing columns', () => {
      expect(sql).not.toMatch(/UPDATE\s+doctor_settings/i);
      expect(sql).not.toMatch(/ALTER COLUMN/i);
      expect(sql).not.toMatch(/DROP COLUMN (?!IF EXISTS vitals_custom)/i);
    });

    it('adds no new prescriptions column (values reuse vitals_json)', () => {
      expect(sql).not.toMatch(/ALTER TABLE prescriptions/i);
    });

    it('documents a drop-column rollback', () => {
      expect(sql).toMatch(/Rollback/i);
      expect(sql).toMatch(/DROP COLUMN IF EXISTS vitals_custom/);
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
