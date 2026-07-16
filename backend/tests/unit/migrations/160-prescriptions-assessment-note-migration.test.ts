/**
 * Content-sanity test for migration 160
 * (prescriptions.assessment_note + prescriptions.assessment_acuity).
 *
 * assessment-tab · asmt-02
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/160_prescriptions_assessment_note.sql',
);

describe('160_prescriptions_assessment_note.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  describe('columns', () => {
    it('adds nullable TEXT assessment_note (idempotent)', () => {
      expect(sql).toMatch(
        /ADD COLUMN IF NOT EXISTS assessment_note\s+TEXT NULL/,
      );
    });

    it('adds nullable TEXT assessment_acuity (idempotent)', () => {
      expect(sql).toMatch(
        /ADD COLUMN IF NOT EXISTS assessment_acuity TEXT NULL/,
      );
    });
  });

  describe('acuity CHECK constraint', () => {
    it('drops then adds the acuity value constraint (idempotent re-run)', () => {
      expect(sql).toMatch(
        /DROP CONSTRAINT IF EXISTS prescriptions_assessment_acuity_chk/,
      );
      expect(sql).toMatch(
        /ADD CONSTRAINT prescriptions_assessment_acuity_chk/,
      );
    });

    it('constrains acuity to the three values OR null', () => {
      expect(sql).toMatch(/assessment_acuity IS NULL/);
      expect(sql).toMatch(
        /assessment_acuity IN \('improving', 'stable', 'worsening'\)/,
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

  describe('column comments', () => {
    it('documents PHI + clinician-only privacy (ASMT-D5) for both columns', () => {
      expect(sql).toMatch(/COMMENT ON COLUMN prescriptions\.assessment_note IS/);
      expect(sql).toMatch(
        /COMMENT ON COLUMN prescriptions\.assessment_acuity IS/,
      );
      expect(sql).toMatch(/PHI/);
      expect(sql).toMatch(/NOT rendered on patient/i);
    });
  });

  describe('rollback documentation', () => {
    it('documents the drop-column rollback for both columns', () => {
      expect(sql).toMatch(/DROP COLUMN IF EXISTS assessment_note/);
      expect(sql).toMatch(/DROP COLUMN IF EXISTS assessment_acuity/);
    });
  });
});
