/**
 * Content-sanity test for migration 176 (known_conditions template scope).
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/176_doctor_rx_templates_known_conditions_scope.sql',
);

describe('176_doctor_rx_templates_known_conditions_scope.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  it('drops then re-adds the scope CHECK (idempotent)', () => {
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS doctor_rx_templates_scope_valid/);
    expect(sql).toMatch(/ADD CONSTRAINT\s+doctor_rx_templates_scope_valid/);
  });

  it('preserves assessment scopes and adds known_conditions', () => {
    for (const scope of [
      'diagnoses',
      'assessment_notes',
      'assessment_full',
      'known_conditions',
      'plan_full',
      'medicines',
    ]) {
      expect(sql).toContain(`'${scope}'`);
    }
  });

  it('does not add a new column (payload rides assessment_json)', () => {
    expect(sql).not.toMatch(/ADD COLUMN/i);
  });

  it('documents RLS unchanged', () => {
    expect(sql).toMatch(/RLS unchanged/i);
  });
});
