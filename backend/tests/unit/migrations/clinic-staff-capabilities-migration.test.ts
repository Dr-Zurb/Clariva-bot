import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/235_clinic_staff_capabilities.sql'
);

describe('235_clinic_staff_capabilities.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  it('drops the one-active-per-doctor index', () => {
    expect(sql).toMatch(/DROP INDEX IF EXISTS idx_clinic_staff_one_active_per_doctor/i);
  });

  it('creates one-active seat indexes for front_desk and previsit', () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS idx_clinic_staff_one_active_front_desk/i
    );
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS idx_clinic_staff_one_active_previsit/i
    );
    expect(sql).toMatch(/'front_desk' = ANY \(capabilities\)/);
    expect(sql).toMatch(/'previsit' = ANY \(capabilities\)/);
  });

  it('defaults existing rows to all three capabilities', () => {
    expect(sql).toMatch(
      /DEFAULT ARRAY\['front_desk', 'billing', 'previsit'\]::TEXT\[\]/
    );
  });

  it('widens history source to assistant', () => {
    expect(sql).toMatch(/source IN \('front_desk', 'patient', 'assistant'\)/);
  });
});
