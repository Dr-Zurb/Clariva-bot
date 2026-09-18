/**
 * Content-sanity test for migration 218 (page background).
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/218_doctor_settings_page_background.sql'
);

describe('218_doctor_settings_page_background.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  it('adds background pointer, preset, and opacity', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS background_path TEXT NULL/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS background_version INTEGER NOT NULL DEFAULT 0/);
    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS letterhead_background_preset TEXT NOT NULL DEFAULT 'none'/
    );
    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS letterhead_background_opacity INTEGER NOT NULL DEFAULT 15/
    );
  });

  it('constrains preset and opacity', () => {
    expect(sql).toMatch(
      /letterhead_background_preset IN \('none', 'paper', 'cross', 'upload'\)/
    );
    expect(sql).toContain('letterhead_background_opacity >= 8');
    expect(sql).toContain('letterhead_background_opacity <= 40');
  });

  it('does not add a registration_number column (BRD-D2)', () => {
    expect(sql).not.toMatch(/registration_number/);
  });

  it('documents a reverse migration', () => {
    expect(sql).toMatch(/Reverse migration/);
    expect(sql).toMatch(/DROP COLUMN IF EXISTS background_path/);
  });
});
