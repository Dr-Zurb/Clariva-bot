/**
 * Content-sanity test for migration 149 (doctor_rx_templates custom_block scope).
 *
 * subjective-tab p12 · subj-39
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/149_doctor_rx_templates_custom_block_scope.sql',
);

describe('149_doctor_rx_templates_custom_block_scope.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  describe('CHECK constraint widen', () => {
    it('drops then re-adds the scope CHECK (idempotent re-run)', () => {
      expect(sql).toMatch(
        /DROP CONSTRAINT IF EXISTS doctor_rx_templates_scope_valid/,
      );
      expect(sql).toMatch(/ADD CONSTRAINT\s+doctor_rx_templates_scope_valid/);
    });

    it('includes custom_block alongside the seven prior scopes', () => {
      for (const scope of [
        'subjective_full',
        'chief_complaints',
        'past_medical',
        'past_surgical',
        'family_history',
        'social_history',
        'allergies',
        'custom_block',
      ]) {
        expect(sql).toContain(`'${scope}'`);
      }
    });
  });

  describe('additive + reversible', () => {
    it('does not rewrite data or alter the column type', () => {
      expect(sql).not.toMatch(/UPDATE\s+doctor_rx_templates/i);
      expect(sql).not.toMatch(/ALTER COLUMN/i);
      expect(sql).not.toMatch(/DROP COLUMN/i);
    });

    it('documents a rollback path', () => {
      expect(sql).toMatch(/Rollback:/i);
    });
  });

  describe('Row-Level Security', () => {
    it('does not enable RLS or add new policies (inherits migration 091)', () => {
      expect(sql).not.toMatch(/ENABLE ROW LEVEL SECURITY/i);
      expect(sql).not.toMatch(/CREATE POLICY/i);
      expect(sql).toMatch(/RLS unchanged/i);
    });
  });
});
