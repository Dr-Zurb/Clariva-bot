/**
 * Content-sanity test for migration 221 (letterhead text size tokens).
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/221_doctor_settings_text_size.sql'
);

describe('221_doctor_settings_text_size.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  it('adds header, patient, and body text size columns', () => {
    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS letterhead_header_text_size TEXT NOT NULL DEFAULT 'medium'/
    );
    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS letterhead_patient_text_size TEXT NOT NULL DEFAULT 'medium'/
    );
    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS letterhead_body_text_size TEXT NOT NULL DEFAULT 'medium'/
    );
  });

  it('constrains all three to small | medium | large', () => {
    expect(sql).toMatch(/letterhead_header_text_size IN \('small', 'medium', 'large'\)/);
    expect(sql).toMatch(/letterhead_patient_text_size IN \('small', 'medium', 'large'\)/);
    expect(sql).toMatch(/letterhead_body_text_size IN \('small', 'medium', 'large'\)/);
  });

  it('does not add a registration_number column (BRD-D2)', () => {
    expect(sql).not.toMatch(/registration_number/);
  });

  it('documents a reverse migration', () => {
    expect(sql).toMatch(/Reverse migration/);
    expect(sql).toMatch(/DROP COLUMN IF EXISTS letterhead_header_text_size/);
  });
});
