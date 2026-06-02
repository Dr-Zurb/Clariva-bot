/**
 * Content-sanity test for migration 115 (rcp-29 drop global platform unique index).
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_115 = resolve(
  __dirname,
  '../../../migrations/115_drop_global_patient_platform_unique.sql',
);
const MIGRATION_113 = resolve(
  __dirname,
  '../../../migrations/113_patients_doctor_id_per_doctor_identity.sql',
);

const sql115 = readFileSync(MIGRATION_115, 'utf8');
const sql113 = readFileSync(MIGRATION_113, 'utf8');

describe('115_drop_global_patient_platform_unique.sql (rcp-29)', () => {
  it('drops idx_patients_platform_external_id', () => {
    expect(sql115).toMatch(/DROP INDEX IF EXISTS idx_patients_platform_external_id/);
  });

  it('documents backfill script must run first', () => {
    expect(sql115).toMatch(/backfill-perdoctor-patient-identity\.ts/);
  });

  it('documents supersession of migration 004 / 007 global unique', () => {
    expect(sql115).toMatch(/004_conversation_state_and_patient_platform/);
    expect(sql115).toMatch(/007_fix_patients_index_name/);
  });

  it('does not drop the per-doctor partial unique from migration 113', () => {
    expect(sql115).not.toMatch(/DROP INDEX.*idx_patients_doctor_platform_external_id/);
    expect(sql113).toMatch(/idx_patients_doctor_platform_external_id/);
  });
});
