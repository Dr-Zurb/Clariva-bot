/**
 * Content-sanity test for migration 146 (doctor_settings.subjective_section_order).
 *
 * subjective-tab p8 · subj-24
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/146_doctor_settings_subjective_section_order.sql',
);

describe('146_doctor_settings_subjective_section_order.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  describe('column subjective_section_order', () => {
    it('adds JSONB NOT NULL column with empty-array default (idempotent)', () => {
      expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS subjective_section_order JSONB NOT NULL DEFAULT '\[\]'::jsonb/);
    });
  });

  describe('CHECK constraint', () => {
    it('drops then adds the array-type constraint (idempotent re-run)', () => {
      expect(sql).toMatch(
        /DROP CONSTRAINT IF EXISTS doctor_settings_subjective_section_order_is_array/,
      );
      expect(sql).toMatch(
        /ADD CONSTRAINT doctor_settings_subjective_section_order_is_array/,
      );
      expect(sql).toMatch(/jsonb_typeof\(subjective_section_order\) = 'array'/);
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
    it('documents subj-24 purpose', () => {
      expect(sql).toMatch(/COMMENT ON COLUMN doctor_settings\.subjective_section_order IS/);
      expect(sql).toMatch(/subj-24/);
    });
  });
});
