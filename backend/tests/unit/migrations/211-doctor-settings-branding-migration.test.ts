/**
 * Content-sanity test for migration 211 (doctor_settings branding columns).
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/211_doctor_settings_branding.sql',
);

describe('211_doctor_settings_branding.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  it('adds branding columns idempotently', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS logo_path TEXT NULL/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS logo_version INTEGER NOT NULL DEFAULT 0/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS qualifications TEXT NULL/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS letterhead_preset TEXT NOT NULL DEFAULT 'classic'/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS page_size TEXT NOT NULL DEFAULT 'a4'/);
  });

  it('does not add a registration_number column (BRD-D2)', () => {
    expect(sql).not.toMatch(/registration_number/);
  });

  it('constrains preset and page size', () => {
    expect(sql).toMatch(/letterhead_preset IN \('classic', 'centred', 'preprinted'\)/);
    expect(sql).toMatch(/page_size IN \('a4', 'a5'\)/);
  });

  it('documents a reverse migration', () => {
    expect(sql).toMatch(/Reverse migration/);
    expect(sql).toMatch(/DROP COLUMN IF EXISTS logo_path/);
  });
});
