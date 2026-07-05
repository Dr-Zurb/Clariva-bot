/**
 * Content-sanity test for migration 155 (doctor_rx_templates scope widen with
 * the Zone-C result scopes: test_results / point_of_care).
 *
 * objective-tab p5 · obj-23
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/155_doctor_rx_templates_result_scopes.sql',
);

describe('155_doctor_rx_templates_result_scopes.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  describe('scope CHECK widen', () => {
    it('drops then re-adds the scope CHECK (idempotent re-run)', () => {
      expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS doctor_rx_templates_scope_valid/);
      expect(sql).toMatch(/ADD CONSTRAINT\s+doctor_rx_templates_scope_valid/);
    });

    it('preserves all seventeen prior subjective + objective scopes', () => {
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
      ]) {
        expect(sql).toContain(`'${scope}'`);
      }
    });

    it('adds the two result scopes', () => {
      expect(sql).toContain(`'test_results'`);
      expect(sql).toContain(`'point_of_care'`);
    });
  });

  describe('additive + reversible', () => {
    it('does not rewrite data, add a column, or alter/drop existing columns', () => {
      expect(sql).not.toMatch(/UPDATE\s+doctor_rx_templates/i);
      expect(sql).not.toMatch(/ALTER COLUMN/i);
      expect(sql).not.toMatch(/ADD COLUMN/i);
      expect(sql).not.toMatch(/DROP COLUMN/i);
    });

    it('documents a rollback path', () => {
      expect(sql).toMatch(/Rollback/i);
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
