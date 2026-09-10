import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(__dirname, '../../../migrations/201_patients_registered_via.sql');

describe('201_patients_registered_via.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  const nonComment = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

  it('adds registered_via as a nullable operational label', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS registered_via TEXT NULL/);
    expect(sql).toMatch(/front_desk/);
    expect(sql).toMatch(/booking_for_other/);
  });

  it('does not change RLS or add PHI columns', () => {
    expect(nonComment).not.toMatch(/ENABLE ROW LEVEL SECURITY/i);
    expect(nonComment).not.toMatch(/CREATE POLICY/i);
    expect(sql).toMatch(/Not PHI/i);
  });
});
