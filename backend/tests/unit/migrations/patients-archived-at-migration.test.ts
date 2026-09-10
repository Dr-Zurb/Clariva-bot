import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(__dirname, '../../../migrations/209_patients_archived_at.sql');

describe('209_patients_archived_at.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  const nonComment = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

  it('adds archived_at and archived_by without RLS policies', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS archived_at/i);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS archived_by/i);
    expect(nonComment).not.toMatch(/CREATE POLICY/i);
  });

  it('indexes archived rows per doctor', () => {
    expect(sql).toMatch(/idx_patients_doctor_archived/i);
    expect(sql).toMatch(/WHERE archived_at IS NOT NULL/i);
  });

  it('marks the stamp as not PHI and documents rollback', () => {
    expect(sql).toMatch(/NOT PHI/);
    expect(sql).toMatch(/DROP INDEX IF EXISTS idx_patients_doctor_archived/);
    expect(sql).toMatch(/DROP COLUMN IF EXISTS archived_at/);
    expect(sql).toMatch(/DROP COLUMN IF EXISTS archived_by/);
  });
});
