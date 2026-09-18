/**
 * Content-sanity test for migration 214 (letterhead tokens).
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/214_doctor_settings_letterhead_tokens.sql'
);

describe('214_doctor_settings_letterhead_tokens.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  it('adds token columns idempotently', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS page_margin_top_mm INTEGER NOT NULL DEFAULT 12/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS logo_size TEXT NOT NULL DEFAULT 'medium'/);
    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS patient_identity_preset TEXT NOT NULL DEFAULT 'open_letter'/
    );
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS hide_halo_credit BOOLEAN NOT NULL DEFAULT false/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS letterhead_footer_line TEXT NULL/);
  });

  it('does not add a registration_number column (BRD-D2)', () => {
    expect(sql).not.toMatch(/registration_number/);
  });

  it('constrains logo size and patient preset', () => {
    expect(sql).toMatch(/logo_size IN \('small', 'medium', 'large'\)/);
    expect(sql).toMatch(
      /patient_identity_preset IN \('open_letter', 'compact', 'minimal'\)/
    );
  });

  it('documents a reverse migration', () => {
    expect(sql).toMatch(/Reverse migration/);
    expect(sql).toMatch(/DROP COLUMN IF EXISTS hide_halo_credit/);
    expect(sql).toMatch(/DROP COLUMN IF EXISTS page_margin_top_mm/);
  });
});
