/**
 * Content-sanity test for migration 153 (doctor_rx_templates objective_json + scope widen).
 *
 * objective-tab p4 · obj-16
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/153_doctor_rx_templates_objective_json.sql',
);

describe('153_doctor_rx_templates_objective_json.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  describe('objective_json payload column (clone of migration 119)', () => {
    it('adds the column idempotently with a jsonb object default', () => {
      expect(sql).toMatch(
        /ADD COLUMN IF NOT EXISTS objective_json JSONB NOT NULL DEFAULT '\{\}'::jsonb/,
      );
    });

    it('drops then re-adds the jsonb_typeof object CHECK (idempotent re-run)', () => {
      expect(sql).toMatch(
        /DROP CONSTRAINT IF EXISTS doctor_rx_templates_objective_json_is_object/,
      );
      expect(sql).toMatch(
        /ADD CONSTRAINT\s+doctor_rx_templates_objective_json_is_object\s+CHECK \(jsonb_typeof\(objective_json\) = 'object'\)/,
      );
    });
  });

  describe('scope CHECK widen', () => {
    it('drops then re-adds the scope CHECK (idempotent re-run)', () => {
      expect(sql).toMatch(
        /DROP CONSTRAINT IF EXISTS doctor_rx_templates_scope_valid/,
      );
      expect(sql).toMatch(/ADD CONSTRAINT\s+doctor_rx_templates_scope_valid/);
    });

    it('preserves all eight prior subjective scopes', () => {
      for (const scope of [
        'subjective_full',
        'chief_complaints',
        'past_medical',
        'past_surgical',
        'family_history',
        'social_history',
        'allergies',
        'custom_block',
      ]) {
        expect(sql).toContain(`'${scope}'`);
      }
    });

    it('adds the nine objective scopes', () => {
      for (const scope of [
        'objective_full',
        'vitals',
        'exam_systemic',
        'exam_general',
        'exam_cvs',
        'exam_resp',
        'exam_abd',
        'exam_cns',
        'objective_custom_block',
      ]) {
        expect(sql).toContain(`'${scope}'`);
      }
    });
  });

  describe('additive + reversible', () => {
    it('does not rewrite data or alter/drop existing columns', () => {
      expect(sql).not.toMatch(/UPDATE\s+doctor_rx_templates/i);
      expect(sql).not.toMatch(/ALTER COLUMN/i);
      expect(sql).not.toMatch(/DROP COLUMN(?!\s+IF EXISTS objective_json)/i);
    });

    it('documents a rollback path', () => {
      expect(sql).toMatch(/Rollback:/i);
    });
  });

  describe('Row-Level Security', () => {
    it('does not enable RLS or add new policies (inherits migration 091)', () => {
      expect(sql).not.toMatch(/ENABLE ROW LEVEL SECURITY/i);
      expect(sql).not.toMatch(/CREATE POLICY/i);
      expect(sql).toMatch(/RLS unchanged/i);
    });
  });
});
