/**
 * Content-sanity test for migration 166
 * (patient_chronic_conditions.code + code_title — optional ICD-11 coding).
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/166_patient_chronic_conditions_icd_coding.sql',
);

describe('166_patient_chronic_conditions_icd_coding.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  describe('columns', () => {
    it('adds nullable TEXT code (idempotent)', () => {
      expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS code TEXT NULL/);
    });

    it('adds nullable TEXT code_title (idempotent)', () => {
      expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS code_title TEXT NULL/);
    });
  });

  describe('Row-Level Security', () => {
    it('does not enable RLS or add new policies (inherits original migration)', () => {
      expect(sql).not.toMatch(/ENABLE ROW LEVEL SECURITY/i);
      expect(sql).not.toMatch(/CREATE POLICY/i);
      expect(sql).toMatch(/RLS unchanged/i);
    });
  });

  describe('column comments', () => {
    it('documents PHI for both coding columns', () => {
      expect(sql).toMatch(/COMMENT ON COLUMN patient_chronic_conditions\.code IS/);
      expect(sql).toMatch(/COMMENT ON COLUMN patient_chronic_conditions\.code_title IS/);
      expect(sql).toMatch(/PHI/);
      expect(sql).toMatch(/ICD-11/);
    });
  });

  describe('rollback documentation', () => {
    it('documents the drop-column rollback for both columns', () => {
      expect(sql).toMatch(/DROP COLUMN IF EXISTS code/);
      expect(sql).toMatch(/DROP COLUMN IF EXISTS code_title/);
    });
  });
});
