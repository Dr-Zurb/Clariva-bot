/**
 * Content-sanity test for migration 195 (T=0 start notify stamp).
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/195_appointment_start_notify_stamp.sql'
);

describe('195_appointment_start_notify_stamp.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  it('adds patient_start_notified_at', () => {
    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS patient_start_notified_at TIMESTAMPTZ NULL/
    );
  });

  it('documents non-PHI and rollback', () => {
    expect(sql).toMatch(/not PHI/i);
    expect(sql).toMatch(/DROP COLUMN IF EXISTS patient_start_notified_at/);
  });

  it('does not touch RLS', () => {
    expect(sql).not.toMatch(/ROW LEVEL SECURITY/);
    expect(sql).not.toMatch(/auth\.uid\(\)/);
    expect(sql).not.toMatch(/CREATE POLICY/);
  });
});
