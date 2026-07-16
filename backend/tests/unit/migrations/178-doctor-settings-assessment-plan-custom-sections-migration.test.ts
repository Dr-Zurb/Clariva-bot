/**
 * Content-sanity test for migration 178
 * (doctor_settings.assessment_custom_sections + plan_custom_sections).
 *
 * assessment-plan-custom-sections
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/178_doctor_settings_assessment_plan_custom_sections.sql',
);

describe('178_doctor_settings_assessment_plan_custom_sections.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  describe('column assessment_custom_sections', () => {
    it('adds JSONB NOT NULL column with empty-array default (idempotent)', () => {
      expect(sql).toMatch(
        /ADD COLUMN IF NOT EXISTS assessment_custom_sections JSONB NOT NULL DEFAULT '\[\]'::jsonb/,
      );
    });

    it('drops then adds the array-type constraint (idempotent re-run)', () => {
      expect(sql).toMatch(
        /DROP CONSTRAINT IF EXISTS doctor_settings_assessment_custom_sections_is_array/,
      );
      expect(sql).toMatch(
        /ADD CONSTRAINT doctor_settings_assessment_custom_sections_is_array/,
      );
      expect(sql).toMatch(/jsonb_typeof\(assessment_custom_sections\) = 'array'/);
    });

    it('documents the seed-on-empty contract', () => {
      expect(sql).toMatch(
        /COMMENT ON COLUMN doctor_settings\.assessment_custom_sections IS/,
      );
      expect(sql).toMatch(/Seeds fresh visits when empty/i);
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
        /DROP CONSTRAINT IF EXISTS doctor_settings_plan_custom_sections_is_array/,
      );
      expect(sql).toMatch(
        /ADD CONSTRAINT doctor_settings_plan_custom_sections_is_array/,
      );
      expect(sql).toMatch(/jsonb_typeof\(plan_custom_sections\) = 'array'/);
    });

    it('documents the seed-on-empty contract', () => {
      expect(sql).toMatch(
        /COMMENT ON COLUMN doctor_settings\.plan_custom_sections IS/,
      );
      expect(sql).toMatch(/Seeds fresh visits when empty/i);
    });
  });

  describe('Row-Level Security', () => {
    it('does not enable RLS or add new policies (inherits migration 009)', () => {
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
