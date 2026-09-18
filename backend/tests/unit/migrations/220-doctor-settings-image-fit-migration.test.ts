/**
 * Content-sanity test for migration 220 (image fit tokens).
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/220_doctor_settings_image_fit.sql'
);

describe('220_doctor_settings_image_fit.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  it('adds header, footer, and background fit columns', () => {
    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS letterhead_header_fit TEXT NOT NULL DEFAULT 'stretch'/
    );
    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS letterhead_footer_fit TEXT NOT NULL DEFAULT 'stretch'/
    );
    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS letterhead_background_fit TEXT NOT NULL DEFAULT 'fill'/
    );
  });

  it('constrains all three to fit | fill | stretch', () => {
    expect(sql).toMatch(/letterhead_header_fit IN \('fit', 'fill', 'stretch'\)/);
    expect(sql).toMatch(/letterhead_footer_fit IN \('fit', 'fill', 'stretch'\)/);
    expect(sql).toMatch(/letterhead_background_fit IN \('fit', 'fill', 'stretch'\)/);
  });

  it('does not add a registration_number column (BRD-D2)', () => {
    expect(sql).not.toMatch(/registration_number/);
  });

  it('documents a reverse migration', () => {
    expect(sql).toMatch(/Reverse migration/);
    expect(sql).toMatch(/DROP COLUMN IF EXISTS letterhead_header_fit/);
  });
});
