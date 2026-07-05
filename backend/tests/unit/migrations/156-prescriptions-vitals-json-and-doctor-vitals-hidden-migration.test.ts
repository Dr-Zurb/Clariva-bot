/**
 * Content-sanity test for migration 156 (prescriptions.vitals_json +
 * doctor_settings.vitals_hidden).
 *
 * vitals-section · VP1 · vit-02
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/156_prescriptions_vitals_json_and_doctor_vitals_hidden.sql',
);

describe('156_prescriptions_vitals_json_and_doctor_vitals_hidden.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  describe('column prescriptions.vitals_json', () => {
    it('adds JSONB NOT NULL column with empty-object default (idempotent)', () => {
      expect(sql).toMatch(
        /ADD COLUMN IF NOT EXISTS vitals_json JSONB NOT NULL DEFAULT '\{\}'::jsonb/,
      );
    });

    it('drops then adds the object-type CHECK (idempotent re-run)', () => {
      expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS prescriptions_vitals_json_is_object/);
      expect(sql).toMatch(/ADD CONSTRAINT\s+prescriptions_vitals_json_is_object/);
      expect(sql).toMatch(/jsonb_typeof\(vitals_json\) = 'object'/);
    });

    it('documents PHI + Zod-validated + view-parity contract', () => {
      expect(sql).toMatch(/COMMENT ON COLUMN prescriptions\.vitals_json IS/);
      expect(sql).toMatch(/PHI/);
      expect(sql).toMatch(/Zod-validated/i);
    });
  });

  describe('column doctor_settings.vitals_hidden', () => {
    it('adds JSONB NOT NULL column with empty-array default (idempotent)', () => {
      expect(sql).toMatch(
        /ADD COLUMN IF NOT EXISTS vitals_hidden JSONB NOT NULL DEFAULT '\[\]'::jsonb/,
      );
    });

    it('drops then adds the array-type CHECK (idempotent re-run)', () => {
      expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS doctor_settings_vitals_hidden_is_array/);
      expect(sql).toMatch(/ADD CONSTRAINT\s+doctor_settings_vitals_hidden_is_array/);
      expect(sql).toMatch(/jsonb_typeof\(vitals_hidden\) = 'array'/);
    });

    it('documents the config-only, view-only contract', () => {
      expect(sql).toMatch(/COMMENT ON COLUMN doctor_settings\.vitals_hidden IS/);
      expect(sql).toMatch(/does not affect PDF\/examination_findings\/test_results\/vitals/i);
    });
  });

  describe('additive + reversible', () => {
    it('does not rewrite data or alter/drop existing columns', () => {
      expect(sql).not.toMatch(/UPDATE\s+prescriptions/i);
      expect(sql).not.toMatch(/UPDATE\s+doctor_settings/i);
      expect(sql).not.toMatch(/ALTER COLUMN/i);
      expect(sql).not.toMatch(/DROP COLUMN (?!IF EXISTS vitals_json|IF EXISTS vitals_hidden)/i);
    });

    it('does not touch the shipped vitals_* columns', () => {
      expect(sql).not.toMatch(/vitals_bp_systolic|vitals_hr|vitals_temp_c|vitals_spo2/i);
    });

    it('documents a drop-column rollback for both columns', () => {
      expect(sql).toMatch(/Rollback/i);
      expect(sql).toMatch(/DROP COLUMN IF EXISTS vitals_json/);
      expect(sql).toMatch(/DROP COLUMN IF EXISTS vitals_hidden/);
    });
  });

  describe('Row-Level Security', () => {
    it('does not enable RLS or add new policies (inherits 026 + 009)', () => {
      expect(sql).not.toMatch(/ENABLE ROW LEVEL SECURITY/i);
      expect(sql).not.toMatch(/CREATE POLICY/i);
      expect(sql).toMatch(/RLS unchanged/i);
    });
  });
});
