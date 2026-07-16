/**
 * Content-sanity test for migration 174 (doctor_settings assessment layout columns).
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/174_doctor_settings_assessment_layout.sql',
);

describe('174_doctor_settings_assessment_layout.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  describe('assessment layout columns', () => {
    it('adds assessment_section_order as jsonb array with default []', () => {
      expect(sql).toMatch(
        /ADD COLUMN IF NOT EXISTS assessment_section_order JSONB NOT NULL DEFAULT '\[\]'::jsonb/,
      );
      expect(sql).toMatch(
        /jsonb_typeof\(assessment_section_order\) = 'array'/,
      );
    });

    it('adds assessment_section_collapsed as jsonb object with default {}', () => {
      expect(sql).toMatch(
        /ADD COLUMN IF NOT EXISTS assessment_section_collapsed JSONB NOT NULL DEFAULT '\{\}'::jsonb/,
      );
      expect(sql).toMatch(
        /jsonb_typeof\(assessment_section_collapsed\) = 'object'/,
      );
    });

    it('adds assessment_section_hidden as jsonb array with default []', () => {
      expect(sql).toMatch(
        /ADD COLUMN IF NOT EXISTS assessment_section_hidden JSONB NOT NULL DEFAULT '\[\]'::jsonb/,
      );
      expect(sql).toMatch(
        /jsonb_typeof\(assessment_section_hidden\) = 'array'/,
      );
    });
  });

  describe('additive + reversible', () => {
    it('does not rewrite data or alter existing columns', () => {
      expect(sql).not.toMatch(/UPDATE\s+doctor_settings/i);
      expect(sql).not.toMatch(/ALTER COLUMN/i);
      expect(sql).not.toMatch(/DROP COLUMN(?!\s+IF EXISTS assessment_section_)/i);
    });

    it('documents UI-only (does not affect PDF)', () => {
      expect(sql).toMatch(/UI-only/i);
      expect(sql).toMatch(/does not affect PDF/i);
    });

    it('documents a rollback path', () => {
      expect(sql).toMatch(/Rollback/i);
    });
  });

  describe('Row-Level Security', () => {
    it('does not enable RLS or add new policies', () => {
      expect(sql).not.toMatch(/ENABLE ROW LEVEL SECURITY/i);
      expect(sql).not.toMatch(/CREATE POLICY/i);
      expect(sql).toMatch(/RLS unchanged/i);
    });
  });
});
