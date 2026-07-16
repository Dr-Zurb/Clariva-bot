/**
 * Content-sanity test for migration 175 (doctor_rx_templates assessment_json +
 * Assessment scope widen).
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/175_doctor_rx_templates_assessment_scopes.sql',
);

describe('175_doctor_rx_templates_assessment_scopes.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  describe('assessment_json payload column', () => {
    it('adds the column idempotently with a jsonb object default', () => {
      expect(sql).toMatch(
        /ADD COLUMN IF NOT EXISTS assessment_json JSONB NOT NULL DEFAULT '\{\}'::jsonb/,
      );
    });

    it('drops then re-adds the jsonb_typeof object CHECK (idempotent re-run)', () => {
      expect(sql).toMatch(
        /DROP CONSTRAINT IF EXISTS doctor_rx_templates_assessment_json_is_object/,
      );
      expect(sql).toMatch(
        /ADD CONSTRAINT\s+doctor_rx_templates_assessment_json_is_object\s+CHECK \(jsonb_typeof\(assessment_json\) = 'object'\)/,
      );
    });
  });

  describe('scope CHECK widen', () => {
    it('drops then re-adds the scope CHECK (idempotent re-run)', () => {
      expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS doctor_rx_templates_scope_valid/);
      expect(sql).toMatch(/ADD CONSTRAINT\s+doctor_rx_templates_scope_valid/);
    });

    it('preserves prior subjective + objective + result + inv + meds + plan scopes', () => {
      for (const scope of [
        'subjective_full',
        'chief_complaints',
        'past_medical',
        'past_surgical',
        'family_history',
        'social_history',
        'allergies',
        'custom_block',
        'objective_full',
        'vitals',
        'exam_systemic',
        'exam_general',
        'exam_cvs',
        'exam_resp',
        'exam_abd',
        'exam_cns',
        'objective_custom_block',
        'test_results',
        'point_of_care',
        'investigations_orders',
        'medicines',
        'advice',
        'follow_up',
        'referral',
        'clinical_notes',
        'plan_full',
      ]) {
        expect(sql).toContain(`'${scope}'`);
      }
    });

    it('adds the Assessment section + whole-tab scopes', () => {
      for (const scope of ['diagnoses', 'assessment_notes', 'assessment_full']) {
        expect(sql).toContain(`'${scope}'`);
      }
    });
  });

  describe('additive + reversible', () => {
    it('does not rewrite data or alter/drop existing columns', () => {
      expect(sql).not.toMatch(/UPDATE\s+doctor_rx_templates/i);
      expect(sql).not.toMatch(/ALTER COLUMN/i);
      // Rollback docs may mention DROP COLUMN IF EXISTS assessment_json.
      expect(sql).not.toMatch(/DROP COLUMN(?!\s+IF EXISTS assessment_json)/i);
    });

    it('documents a rollback path', () => {
      expect(sql).toMatch(/Rollback/i);
      expect(sql).toMatch(/DROP COLUMN IF EXISTS assessment_json/);
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
