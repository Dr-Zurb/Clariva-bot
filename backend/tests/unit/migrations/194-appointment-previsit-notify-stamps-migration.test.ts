/**
 * Content-sanity test for migration 194 (previsit notify stamps).
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/194_appointment_previsit_notify_stamps.sql'
);

describe('194_appointment_previsit_notify_stamps.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  it('adds three notify stamp columns', () => {
    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS patient_reminder_24h_notified_at TIMESTAMPTZ NULL/
    );
    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS patient_checkin_nudge_15_notified_at TIMESTAMPTZ NULL/
    );
    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS patient_checkin_nudge_5_notified_at TIMESTAMPTZ NULL/
    );
  });

  it('documents non-PHI and rollback', () => {
    expect(sql).toMatch(/not PHI/i);
    expect(sql).toMatch(/DROP COLUMN IF EXISTS patient_reminder_24h_notified_at/);
    expect(sql).toMatch(/DROP COLUMN IF EXISTS patient_checkin_nudge_15_notified_at/);
    expect(sql).toMatch(/DROP COLUMN IF EXISTS patient_checkin_nudge_5_notified_at/);
  });

  it('does not touch RLS', () => {
    expect(sql).not.toMatch(/ROW LEVEL SECURITY/);
    expect(sql).not.toMatch(/auth\.uid\(\)/);
    expect(sql).not.toMatch(/CREATE POLICY/);
  });
});
