/**
 * Content-sanity test for migration 180 (objective_notes + free_text_notes scopes).
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/180_doctor_rx_templates_objective_notes_and_free_text_scopes.sql',
);

describe('180_doctor_rx_templates_objective_notes_and_free_text_scopes.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  it('drops then re-adds the scope CHECK (idempotent)', () => {
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS doctor_rx_templates_scope_valid/);
    expect(sql).toMatch(/ADD CONSTRAINT\s+doctor_rx_templates_scope_valid/);
  });

  it('adds objective_notes and free_text_notes while preserving prior scopes', () => {
    for (const scope of [
      'exam_additional_notes',
      'objective_notes',
      'free_text_notes',
      'known_conditions',
      'past_medical',
    ]) {
      expect(sql).toContain(`'${scope}'`);
    }
  });

  it('does not add a new column', () => {
    expect(sql).not.toMatch(/ADD COLUMN/i);
  });

  it('documents RLS unchanged', () => {
    expect(sql).toMatch(/RLS unchanged/i);
  });
});
