/**
 * Content-sanity test for migration 217 (drop minimal patient preset).
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/217_doctor_settings_drop_minimal_patient.sql'
);

describe('217_doctor_settings_drop_minimal_patient.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  it('folds minimal rows to open_letter and drops it from the check', () => {
    expect(sql).toMatch(/patient_identity_preset = 'open_letter'/);
    expect(sql).toMatch(/patient_identity_preset = 'minimal'/);
    expect(sql).toMatch(
      /patient_identity_preset IN \('open_letter', 'compact', 'grid'\)/
    );
  });

  it('does not add a registration_number column (BRD-D2)', () => {
    expect(sql).not.toMatch(/registration_number/);
  });

  it('documents a reverse migration', () => {
    expect(sql).toMatch(/Reverse migration/);
  });
});
