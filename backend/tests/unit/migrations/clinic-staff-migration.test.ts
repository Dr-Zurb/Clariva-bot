import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(__dirname, '../../../migrations/200_clinic_staff.sql');

describe('200_clinic_staff.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  const nonComment = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

  it('creates clinic_staff with the unique staff_user_id index (DL-5)', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS clinic_staff/i);
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS idx_clinic_staff_staff_user_id/i);
  });

  it('indexes active rows per doctor', () => {
    expect(sql).toMatch(/idx_clinic_staff_doctor_active/i);
    expect(sql).toMatch(/WHERE status = 'active'/i);
  });

  it('enables RLS and adds no permissive policies (DL-10)', () => {
    expect(sql).toMatch(/ALTER TABLE clinic_staff ENABLE ROW LEVEL SECURITY/i);
    expect(nonComment).not.toMatch(/CREATE POLICY/i);
  });

  it('is not a PHI table and documents rollback', () => {
    expect(sql).toMatch(/NOT PHI/);
    expect(sql).toMatch(/DROP TABLE IF EXISTS clinic_staff/);
  });

  it('restricts role and status via CHECK', () => {
    expect(sql).toMatch(/CHECK \(role IN \('receptionist'\)\)/);
    expect(sql).toMatch(/CHECK \(status IN \('active', 'suspended'\)\)/);
  });
});
