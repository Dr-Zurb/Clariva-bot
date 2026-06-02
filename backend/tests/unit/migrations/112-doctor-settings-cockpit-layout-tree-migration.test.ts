/**
 * Content-sanity test for migration 112 (doctor_settings.cockpit_layout_tree).
 *
 * cockpit-layout-presets-modality batch · clpm-01
 *
 * No live-Supabase harness in this workspace — pins load-bearing clauses so an
 * accidental edit that drops the CHECK refresh, comment update, or idempotent
 * re-run guards fails in review. Per-element shape (layout vs layout_tree) is
 * enforced in doctor-settings-service (Zod-equivalent validators); the DB CHECK
 * only guards array type + max-5 cap (same scalar invariants as migration 099).
 *
 * Behavioural verification (legacy-only, tree-only, and mixed preset rows)
 * happens at service-layer unit tests and manual smoke per the task file.
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/112_doctor_settings_cockpit_layout_tree.sql',
);

describe('112_doctor_settings_cockpit_layout_tree.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  const sqlCodeOnly = sql.replace(/--[^\n]*/g, '');

  describe('CHECK constraint (099 compat + tree shape allowance)', () => {
    it('drops then re-adds the constraint idempotently', () => {
      expect(sqlCodeOnly).toMatch(
        /DROP CONSTRAINT IF EXISTS doctor_settings_cockpit_layout_presets_check/,
      );
      expect(sqlCodeOnly).toMatch(
        /ADD CONSTRAINT doctor_settings_cockpit_layout_presets_check CHECK/,
      );
    });

    it('requires a JSONB array with at most 5 elements', () => {
      expect(sqlCodeOnly).toMatch(/jsonb_typeof\(cockpit_layout_presets\) = 'array'/);
      expect(sqlCodeOnly).toMatch(/jsonb_array_length\(cockpit_layout_presets\) <= 5/);
    });

    it('does not add a separate column (JSONB element shape variance only)', () => {
      expect(sqlCodeOnly).not.toMatch(/ADD COLUMN/i);
    });
  });

  describe('column comment', () => {
    it('documents legacy layout and layout_tree element shapes', () => {
      expect(sql).toMatch(/COMMENT ON COLUMN doctor_settings\.cockpit_layout_presets/);
      expect(sql).toMatch(/layout\?:/);
      expect(sql).toMatch(/layout_tree\?:/);
      expect(sql).toMatch(/sourceTemplateId\?:/);
      expect(sql).toMatch(/R-LAYOUT-UX/i);
    });

    it('notes app-layer enforcement for at-least-one-of layout / layout_tree', () => {
      expect(sql).toMatch(/At least one of layout \/ layout_tree must be present/i);
    });
  });

  describe('reverse migration (documented rollback)', () => {
    it('documents restoring the 099-equivalent CHECK', () => {
      expect(sql).toMatch(/Reverse:/);
      expect(sql).toMatch(
        /DROP CONSTRAINT IF EXISTS doctor_settings_cockpit_layout_presets_check/,
      );
      expect(sql).toMatch(
        /ADD CONSTRAINT doctor_settings_cockpit_layout_presets_check CHECK/,
      );
    });
  });

  describe('legacy + tree shape acceptance (CHECK-level)', () => {
    it('permits legacy-only elements (CHECK has no per-element key enforcement)', () => {
      const checkBlock = sqlCodeOnly.match(
        /ADD CONSTRAINT doctor_settings_cockpit_layout_presets_check CHECK \([\s\S]*?\);/,
      )?.[0];
      expect(checkBlock).toBeDefined();
      expect(checkBlock!).not.toMatch(/layout_tree/);
      expect(checkBlock!).not.toMatch(/layout\s*->>/);
    });

    it('permits tree-only elements (same scalar CHECK — no layout key required)', () => {
      // Tree-only presets are accepted at the DB layer; service validators
      // require layout_tree when layout is absent (see cockpit-presets tests).
      expect(sqlCodeOnly).toMatch(/jsonb_typeof\(cockpit_layout_presets\) = 'array'/);
    });
  });
});
