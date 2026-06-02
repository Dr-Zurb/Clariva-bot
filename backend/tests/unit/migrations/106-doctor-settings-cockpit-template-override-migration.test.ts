/**
 * Content-sanity test for migration 106 (doctor_settings.cockpit_template_override).
 *
 * templates-r-mod batch · tmr-03
 *
 * No live-Supabase harness in this workspace — pins load-bearing clauses so an
 * accidental edit that drops the CHECK, column, or idempotent re-run guards
 * fails in review. RLS on doctor_settings (migration 009) is unchanged;
 * additive columns inherit existing per-doctor policies.
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/106_doctor_settings_cockpit_template_override.sql',
);

describe('106_doctor_settings_cockpit_template_override.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  describe('column cockpit_template_override', () => {
    it('adds nullable TEXT column with IF NOT EXISTS (idempotent)', () => {
      expect(sql).toMatch(
        /ADD COLUMN IF NOT EXISTS cockpit_template_override TEXT NULL/,
      );
    });

    it('does not set a non-null DEFAULT (NULL = auto-select sentinel)', () => {
      expect(sql).not.toMatch(
        /cockpit_template_override\s+TEXT\s+NOT NULL/i,
      );
      expect(sql).not.toMatch(
        /cockpit_template_override[\s\S]*?DEFAULT\s+'telemed-/i,
      );
    });
  });

  describe('CHECK constraint', () => {
    it('drops then adds the constraint (idempotent re-run)', () => {
      expect(sql).toMatch(
        /DROP CONSTRAINT IF EXISTS doctor_settings_cockpit_template_override_check/,
      );
      expect(sql).toMatch(
        /ADD CONSTRAINT doctor_settings_cockpit_template_override_check/,
      );
    });

    it('allows NULL', () => {
      expect(sql).toMatch(/cockpit_template_override IS NULL/);
    });

    it('enumerates the four R-MOD-full template ids', () => {
      for (const id of [
        'telemed-video',
        'telemed-voice',
        'telemed-text',
        'review',
      ]) {
        expect(sql).toMatch(new RegExp(`'${id}'`));
      }
    });

    it('rejects invalid values at the DB layer (manual smoke: UPDATE … = invalid fails)', () => {
      expect(sql).not.toMatch(/'invalid'/);
    });
  });

  describe('Row-Level Security', () => {
    it('does not enable RLS or add new policies (inherits migration 009)', () => {
      expect(sql).not.toMatch(/ENABLE ROW LEVEL SECURITY/i);
      expect(sql).not.toMatch(/CREATE POLICY/i);
      expect(sql).toMatch(/Reuses the existing doctor_settings RLS policy/i);
    });
  });

  describe('column comment', () => {
    it('documents purpose and NULL sentinel', () => {
      expect(sql).toMatch(/COMMENT ON COLUMN doctor_settings\.cockpit_template_override/);
      expect(sql).toMatch(/NULL = auto-select/i);
      expect(sql).toMatch(/R-MOD-full/i);
    });
  });

  describe('API projection note', () => {
    it('documents explicit SELECT_COLUMNS in doctor-settings-service', () => {
      expect(sql).toMatch(/SELECT_COLUMNS/i);
      expect(sql).toMatch(/doctor-settings-service\.ts/i);
    });
  });
});
