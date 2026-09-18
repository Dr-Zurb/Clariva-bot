/**
 * Content-sanity test for migration 216 (patient identity grid preset).
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/216_doctor_settings_patient_grid.sql'
);

describe('216_doctor_settings_patient_grid.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  it('extends the patient preset check to include grid', () => {
    expect(sql).toMatch(
      /patient_identity_preset IN \('open_letter', 'compact', 'minimal', 'grid'\)/
    );
  });

  it('does not add a registration_number column (BRD-D2)', () => {
    expect(sql).not.toMatch(/registration_number/);
  });

  it('documents a reverse migration', () => {
    expect(sql).toMatch(/Reverse migration/);
    expect(sql).toMatch(/patient_identity_preset = 'grid'/);
  });
});
