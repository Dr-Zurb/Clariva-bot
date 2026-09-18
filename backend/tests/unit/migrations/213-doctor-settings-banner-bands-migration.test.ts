/**
 * Content-sanity test for migration 213 (banner header/footer bands).
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/213_doctor_settings_banner_bands.sql',
);

describe('213_doctor_settings_banner_bands.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  it('adds header/footer columns idempotently', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS header_path TEXT NULL/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS header_version INTEGER NOT NULL DEFAULT 0/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS footer_path TEXT NULL/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS footer_version INTEGER NOT NULL DEFAULT 0/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS header_height_mm INTEGER NOT NULL DEFAULT 35/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS footer_height_mm INTEGER NOT NULL DEFAULT 20/);
  });

  it('does not add a registration_number column (BRD-D2)', () => {
    expect(sql).not.toMatch(/registration_number/);
  });

  it('expands the preset check to include banner', () => {
    expect(sql).toMatch(
      /letterhead_preset IN \('classic', 'centred', 'preprinted', 'banner'\)/,
    );
  });

  it('constrains band heights and their sum', () => {
    expect(sql).toMatch(/header_height_mm >= 15 AND header_height_mm <= 80/);
    expect(sql).toMatch(/footer_height_mm >= 10 AND footer_height_mm <= 60/);
    expect(sql).toMatch(/header_height_mm \+ footer_height_mm <= 100/);
  });

  it('documents a reverse migration', () => {
    expect(sql).toMatch(/Reverse migration/);
    expect(sql).toMatch(/DROP COLUMN IF EXISTS header_path/);
    expect(sql).toMatch(/DROP COLUMN IF EXISTS footer_path/);
  });
});
