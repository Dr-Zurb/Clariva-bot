/**
 * Content-sanity test for migration 179 (exam_additional_notes template scope).
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/179_doctor_rx_templates_exam_additional_notes_scope.sql',
);

describe('179_doctor_rx_templates_exam_additional_notes_scope.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  it('drops then re-adds the scope CHECK (idempotent)', () => {
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS doctor_rx_templates_scope_valid/);
    expect(sql).toMatch(/ADD CONSTRAINT\s+doctor_rx_templates_scope_valid/);
  });

  it('preserves prior exam scopes and adds exam_additional_notes', () => {
    for (const scope of [
      'exam_systemic',
      'exam_general',
      'exam_cvs',
      'exam_resp',
      'exam_abd',
      'exam_cns',
      'exam_additional_notes',
      'known_conditions',
    ]) {
      expect(sql).toContain(`'${scope}'`);
    }
  });

  it('does not add a new column (payload rides objective_json)', () => {
    expect(sql).not.toMatch(/ADD COLUMN/i);
  });

  it('documents RLS unchanged', () => {
    expect(sql).toMatch(/RLS unchanged/i);
  });
});
