/**
 * Content-sanity test for migration 181 (patient_background template scope).
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/181_doctor_rx_templates_patient_background_scope.sql',
);

describe('181_doctor_rx_templates_patient_background_scope.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  it('drops then re-adds the scope CHECK (idempotent)', () => {
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS doctor_rx_templates_scope_valid/);
    expect(sql).toMatch(/ADD CONSTRAINT\s+doctor_rx_templates_scope_valid/);
  });

  it('adds patient_background while preserving past_medical and past_surgical', () => {
    for (const scope of ['past_medical', 'past_surgical', 'patient_background', 'free_text_notes']) {
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
