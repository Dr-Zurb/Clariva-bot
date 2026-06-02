/**
 * Content-sanity test for migration 113 (rcp-25 per-doctor identity seam).
 *
 * Pins load-bearing SQL: nullable doctor_id FK, partial unique index with
 * WHERE platform IS NOT NULL (excludes book-for-other rows), and retention
 * of the legacy global idx_patients_platform_external_id from migration 004.
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_113 = resolve(
  __dirname,
  '../../../migrations/113_patients_doctor_id_per_doctor_identity.sql',
);
const MIGRATION_004 = resolve(
  __dirname,
  '../../../migrations/004_conversation_state_and_patient_platform.sql',
);

const sql113 = readFileSync(MIGRATION_113, 'utf8');
const sql004 = readFileSync(MIGRATION_004, 'utf8');

describe('113_patients_doctor_id_per_doctor_identity.sql (rcp-25)', () => {
  it('adds nullable patients.doctor_id with FK to auth.users', () => {
    expect(sql113).toMatch(
      /ADD COLUMN IF NOT EXISTS doctor_id UUID REFERENCES auth\.users\(id\) ON DELETE SET NULL/,
    );
  });

  it('creates partial unique index on (doctor_id, platform, platform_external_id) WHERE platform IS NOT NULL', () => {
    expect(sql113).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_doctor_platform_external_id/);
    expect(sql113).toMatch(
      /ON patients \(doctor_id, platform, platform_external_id\)\s+WHERE platform IS NOT NULL/,
    );
  });

  it('does not drop the legacy global idx_patients_platform_external_id (rcp-29)', () => {
    expect(sql113).not.toMatch(/DROP INDEX.*idx_patients_platform_external_id/);
    expect(sql004).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_platform_external_id/);
  });

  describe('book-for-other exclusion (platform = NULL)', () => {
    it('partial index WHERE platform IS NOT NULL excludes manual/book-for-other patients', () => {
      // createPatientForBooking inserts platform: null — must not be caught by per-doctor uniqueness.
      expect(sql113).toMatch(/WHERE platform IS NOT NULL/);
      expect(sql113).toMatch(/platform = NULL/);
      expect(sql113).toMatch(/createPatientForBooking/);
    });

    it('allows multiple book-for-other rows per doctor (no doctor_id+platform uniqueness when platform is null)', () => {
      // The partial index predicate ensures rows with platform IS NULL are invisible to the index.
      const partialIndexBlock = sql113.match(
        /CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_doctor_platform_external_id[\s\S]*?WHERE platform IS NOT NULL/,
      );
      expect(partialIndexBlock).not.toBeNull();
      expect(partialIndexBlock![0]).not.toMatch(/platform_external_id IS NOT NULL/);
    });
  });
});
