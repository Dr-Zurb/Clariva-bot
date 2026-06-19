/**
 * Content-sanity test for migration 152 (doctor_settings objective layout config).
 *
 * objective-tab p3 · obj-10
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/152_doctor_settings_objective_layout.sql',
);

describe('152_doctor_settings_objective_layout.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  describe('array columns (order / hidden / custom sections)', () => {
    it('adds objective_section_order JSONB NOT NULL with empty-array default (idempotent)', () => {
      expect(sql).toMatch(
        /ADD COLUMN IF NOT EXISTS objective_section_order JSONB NOT NULL DEFAULT '\[\]'::jsonb/,
      );
    });

    it('adds objective_section_hidden JSONB NOT NULL with empty-array default (idempotent)', () => {
      expect(sql).toMatch(
        /ADD COLUMN IF NOT EXISTS objective_section_hidden JSONB NOT NULL DEFAULT '\[\]'::jsonb/,
      );
    });

    it('adds objective_custom_sections JSONB NOT NULL with empty-array default (idempotent)', () => {
      expect(sql).toMatch(
        /ADD COLUMN IF NOT EXISTS objective_custom_sections JSONB NOT NULL DEFAULT '\[\]'::jsonb/,
      );
    });

    it('guards each array column with a drop+add jsonb array CHECK', () => {
      for (const col of [
        'objective_section_order',
        'objective_section_hidden',
        'objective_custom_sections',
      ]) {
        expect(sql).toMatch(
          new RegExp(`DROP CONSTRAINT IF EXISTS doctor_settings_${col}_is_array`),
        );
        expect(sql).toMatch(new RegExp(`ADD CONSTRAINT doctor_settings_${col}_is_array`));
        expect(sql).toMatch(new RegExp(`jsonb_typeof\\(${col}\\) = 'array'`));
      }
    });
  });

  describe('collapse map column (object)', () => {
    it('adds objective_section_collapsed JSONB NOT NULL with empty-object default (idempotent)', () => {
      expect(sql).toMatch(
        /ADD COLUMN IF NOT EXISTS objective_section_collapsed JSONB NOT NULL DEFAULT '\{\}'::jsonb/,
      );
    });

    it('drops then adds the object-type constraint (idempotent re-run)', () => {
      expect(sql).toMatch(
        /DROP CONSTRAINT IF EXISTS doctor_settings_objective_section_collapsed_is_object/,
      );
      expect(sql).toMatch(
        /ADD CONSTRAINT doctor_settings_objective_section_collapsed_is_object/,
      );
      expect(sql).toMatch(/jsonb_typeof\(objective_section_collapsed\) = 'object'/);
    });
  });

  describe('Row-Level Security', () => {
    it('does not enable RLS or add new policies (inherits migration 009)', () => {
      expect(sql).not.toMatch(/ENABLE ROW LEVEL SECURITY/i);
      expect(sql).not.toMatch(/CREATE POLICY/i);
      expect(sql).toMatch(/RLS unchanged/i);
    });
  });

  describe('column comments (config, not PHI)', () => {
    it('documents obj-10 purpose on each column', () => {
      for (const col of [
        'objective_section_order',
        'objective_section_collapsed',
        'objective_section_hidden',
        'objective_custom_sections',
      ]) {
        expect(sql).toMatch(
          new RegExp(`COMMENT ON COLUMN doctor_settings\\.${col} IS`),
        );
      }
      expect(sql).toMatch(/obj-10/);
    });
  });

  describe('rollback documented', () => {
    it('documents a reversible drop of constraints + columns', () => {
      expect(sql).toMatch(/Rollback \(documented only\)/i);
      expect(sql).toMatch(/DROP COLUMN IF EXISTS objective_section_order/);
      expect(sql).toMatch(/DROP COLUMN IF EXISTS objective_custom_sections/);
    });
  });
});
