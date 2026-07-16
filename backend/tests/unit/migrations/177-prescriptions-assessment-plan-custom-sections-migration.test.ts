/**
 * Content-sanity test for migration 177
 * (prescriptions.assessment_custom_sections + plan_custom_sections).
 *
 * assessment-plan-custom-sections
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/177_prescriptions_assessment_plan_custom_sections.sql',
);

describe('177_prescriptions_assessment_plan_custom_sections.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  describe('column assessment_custom_sections', () => {
    it('adds JSONB NOT NULL column with empty-array default (idempotent)', () => {
      expect(sql).toMatch(
        /ADD COLUMN IF NOT EXISTS assessment_custom_sections JSONB NOT NULL DEFAULT '\[\]'::jsonb/,
      );
    });

    it('drops then adds the array-type constraint (idempotent re-run)', () => {
      expect(sql).toMatch(
        /DROP CONSTRAINT IF EXISTS prescriptions_assessment_custom_sections_is_array/,
      );
      expect(sql).toMatch(
        /ADD CONSTRAINT prescriptions_assessment_custom_sections_is_array/,
      );
      expect(sql).toMatch(/jsonb_typeof\(assessment_custom_sections\) = 'array'/);
    });

    it('documents PHI in the column comment', () => {
      expect(sql).toMatch(
        /COMMENT ON COLUMN prescriptions\.assessment_custom_sections IS/,
      );
    });
  });

  describe('column plan_custom_sections', () => {
    it('adds JSONB NOT NULL column with empty-array default (idempotent)', () => {
      expect(sql).toMatch(
        /ADD COLUMN IF NOT EXISTS plan_custom_sections JSONB NOT NULL DEFAULT '\[\]'::jsonb/,
      );
    });

    it('drops then adds the array-type constraint (idempotent re-run)', () => {
      expect(sql).toMatch(
        /DROP CONSTRAINT IF EXISTS prescriptions_plan_custom_sections_is_array/,
      );
      expect(sql).toMatch(
        /ADD CONSTRAINT prescriptions_plan_custom_sections_is_array/,
      );
      expect(sql).toMatch(/jsonb_typeof\(plan_custom_sections\) = 'array'/);
    });

    it('documents PHI in the column comment', () => {
      expect(sql).toMatch(
        /COMMENT ON COLUMN prescriptions\.plan_custom_sections IS/,
      );
    });
  });

  describe('PHI + Row-Level Security', () => {
    it('marks columns as PHI', () => {
      expect(sql).toMatch(/PHI/);
    });

    it('does not enable RLS or add new policies (inherits migration 026)', () => {
      expect(sql).not.toMatch(/ENABLE ROW LEVEL SECURITY/i);
      expect(sql).not.toMatch(/CREATE POLICY/i);
      expect(sql).toMatch(/RLS unchanged/i);
    });
  });

  describe('rollback documentation', () => {
    it('documents the drop-column rollback for both columns', () => {
      expect(sql).toMatch(/DROP COLUMN IF EXISTS assessment_custom_sections/);
      expect(sql).toMatch(/DROP COLUMN IF EXISTS plan_custom_sections/);
    });
  });
});
