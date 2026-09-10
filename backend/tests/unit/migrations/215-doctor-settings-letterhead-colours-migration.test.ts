/**
 * Content-sanity test for migration 215 (letterhead chrome + patient colours).
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/215_doctor_settings_letterhead_colours.sql'
);

describe('215_doctor_settings_letterhead_colours.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  it('adds chrome and patient colour columns', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS letterhead_chrome_color TEXT NULL/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS letterhead_patient_color TEXT NULL/);
  });

  it('does not add a registration_number column (BRD-D2)', () => {
    expect(sql).not.toMatch(/registration_number/);
  });

  it('checks #RRGGBB on both new columns', () => {
    expect(sql).toContain("letterhead_chrome_color ~ '^#[0-9A-Fa-f]{6}$'");
    expect(sql).toContain("letterhead_patient_color ~ '^#[0-9A-Fa-f]{6}$'");
  });

  it('documents a reverse migration', () => {
    expect(sql).toMatch(/Reverse migration/);
    expect(sql).toMatch(/DROP COLUMN IF EXISTS letterhead_chrome_color/);
    expect(sql).toMatch(/DROP COLUMN IF EXISTS letterhead_patient_color/);
  });
});
