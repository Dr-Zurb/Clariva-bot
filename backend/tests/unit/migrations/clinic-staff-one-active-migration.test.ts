import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/205_clinic_staff_one_active_per_doctor.sql'
);

describe('205_clinic_staff_one_active_per_doctor.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  it('creates a unique partial index on active doctor_id', () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS idx_clinic_staff_one_active_per_doctor/i
    );
    expect(sql).toMatch(/WHERE status = 'active'/i);
  });

  it('guards against existing duplicates before the unique index', () => {
    expect(sql).toMatch(/HAVING COUNT\(\*\) > 1/);
    expect(sql).toMatch(/RAISE EXCEPTION/i);
  });

  it('drops the non-unique predecessor index', () => {
    expect(sql).toMatch(/DROP INDEX IF EXISTS idx_clinic_staff_doctor_active/i);
  });
});
