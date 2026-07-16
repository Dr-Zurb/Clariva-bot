/**
 * Content-sanity test for migration 168 (doctor_rx_templates scope widen with
 * investigations_orders).
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/168_doctor_rx_templates_investigations_scope.sql',
);

describe('168_doctor_rx_templates_investigations_scope.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  describe('scope CHECK widen', () => {
    it('drops then re-adds the scope CHECK (idempotent re-run)', () => {
      expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS doctor_rx_templates_scope_valid/);
      expect(sql).toMatch(/ADD CONSTRAINT\s+doctor_rx_templates_scope_valid/);
    });

    it('preserves prior subjective + objective + result scopes', () => {
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
      ]) {
        expect(sql).toContain(`'${scope}'`);
      }
    });

    it('adds the investigations_orders scope', () => {
      expect(sql).toContain(`'investigations_orders'`);
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
