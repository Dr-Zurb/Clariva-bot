/**
 * Content-sanity test for migration 147 (doctor_settings.subjective_section_collapsed).
 *
 * subjective-tab p9 · subj-28
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/147_doctor_settings_subjective_section_collapsed.sql',
);

describe('147_doctor_settings_subjective_section_collapsed.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  describe('column subjective_section_collapsed', () => {
    it('adds JSONB NOT NULL column with empty-object default (idempotent)', () => {
      expect(sql).toMatch(
        /ADD COLUMN IF NOT EXISTS subjective_section_collapsed JSONB NOT NULL DEFAULT '\{\}'::jsonb/,
      );
    });
  });

  describe('CHECK constraint', () => {
    it('drops then adds the object-type constraint (idempotent re-run)', () => {
      expect(sql).toMatch(
        /DROP CONSTRAINT IF EXISTS doctor_settings_subjective_section_collapsed_is_object/,
      );
      expect(sql).toMatch(
        /ADD CONSTRAINT doctor_settings_subjective_section_collapsed_is_object/,
      );
      expect(sql).toMatch(/jsonb_typeof\(subjective_section_collapsed\) = 'object'/);
    });
  });

  describe('Row-Level Security', () => {
    it('does not enable RLS or add new policies (inherits migration 009)', () => {
      expect(sql).not.toMatch(/ENABLE ROW LEVEL SECURITY/i);
      expect(sql).not.toMatch(/CREATE POLICY/i);
      expect(sql).toMatch(/RLS unchanged/i);
    });
  });

  describe('column comment', () => {
    it('documents subj-28 purpose', () => {
      expect(sql).toMatch(
        /COMMENT ON COLUMN doctor_settings\.subjective_section_collapsed IS/,
      );
      expect(sql).toMatch(/subj-28/);
    });
  });
});
