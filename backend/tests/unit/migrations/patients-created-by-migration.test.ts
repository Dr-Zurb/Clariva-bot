import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/206_patients_created_by_and_doctor_via.sql'
);

describe('206_patients_created_by_and_doctor_via.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  const nonComment = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

  it('widens registered_via to include doctor', () => {
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS patients_registered_via_check/);
    expect(sql).toMatch(/'doctor'/);
    expect(sql).toMatch(/front_desk/);
  });

  it('adds created_by with SET NULL on auth user delete', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS created_by UUID NULL/);
    expect(sql).toMatch(/ON DELETE SET NULL/);
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_patients_created_by/);
  });

  it('does not change RLS or add PHI columns', () => {
    expect(nonComment).not.toMatch(/ENABLE ROW LEVEL SECURITY/i);
    expect(nonComment).not.toMatch(/CREATE POLICY/i);
    expect(sql).toMatch(/Not PHI/i);
  });
});
