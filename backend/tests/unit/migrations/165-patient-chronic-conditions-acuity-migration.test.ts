/**
 * Content-sanity test for migration 165
 * (patient_chronic_conditions.acuity — Known-conditions clinical trajectory).
 *
 * assessment-tab · known-conditions acuity
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/165_patient_chronic_conditions_acuity.sql',
);

describe('165_patient_chronic_conditions_acuity.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  describe('column', () => {
    it('adds nullable TEXT acuity (idempotent)', () => {
      expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS acuity TEXT NULL/);
    });
  });

  describe('acuity CHECK constraint', () => {
    it('drops then adds the acuity value constraint (idempotent re-run)', () => {
      expect(sql).toMatch(
        /DROP CONSTRAINT IF EXISTS patient_chronic_conditions_acuity_chk/,
      );
      expect(sql).toMatch(
        /ADD CONSTRAINT patient_chronic_conditions_acuity_chk/,
      );
    });

    it('constrains acuity to the three values OR null', () => {
      expect(sql).toMatch(/acuity IS NULL/);
      expect(sql).toMatch(
        /acuity IN \('improving', 'stable', 'worsening'\)/,
      );
    });
  });

  describe('Row-Level Security', () => {
    it('does not enable RLS or add new policies (inherits original migration)', () => {
      expect(sql).not.toMatch(/ENABLE ROW LEVEL SECURITY/i);
      expect(sql).not.toMatch(/CREATE POLICY/i);
      expect(sql).toMatch(/RLS unchanged/i);
    });
  });

  describe('column comment', () => {
    it('documents PHI for the acuity column', () => {
      expect(sql).toMatch(
        /COMMENT ON COLUMN patient_chronic_conditions\.acuity IS/,
      );
      expect(sql).toMatch(/PHI/);
    });
  });

  describe('rollback documentation', () => {
    it('documents the drop-column rollback', () => {
      expect(sql).toMatch(/DROP COLUMN IF EXISTS acuity/);
    });
  });
});
