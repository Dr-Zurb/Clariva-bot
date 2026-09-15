import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/237_staff_capability_seats.sql'
);

describe('237_staff_capability_seats.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  it('rewrites leftover previsit into the four prep seats', () => {
    expect(sql).toMatch(/WHEN c = 'previsit' THEN NULL/);
    expect(sql).toMatch(/SELECT 'vitals'/);
    expect(sql).toMatch(/SELECT 'history'/);
    expect(sql).toMatch(/SELECT 'internal_labs'/);
    expect(sql).toMatch(/SELECT 'papers'/);
  });

  it('drops the one-active previsit index', () => {
    expect(sql).toMatch(/DROP INDEX IF EXISTS idx_clinic_staff_one_active_previsit/i);
  });

  it('creates one-active seat indexes for the four prep jobs', () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS idx_clinic_staff_one_active_vitals/i
    );
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS idx_clinic_staff_one_active_history/i
    );
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS idx_clinic_staff_one_active_internal_labs/i
    );
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS idx_clinic_staff_one_active_papers/i
    );
  });

  it('tightens the CHECK to the five live seats', () => {
    expect(sql).toMatch(/'internal_labs'/);
    expect(sql).toMatch(/'papers'/);
    expect(sql).toMatch(
      /capabilities <@ ARRAY\[\s*'front_desk',\s*'vitals',\s*'history',\s*'internal_labs',\s*'papers'\s*\]::TEXT\[\]/
    );
  });
});
