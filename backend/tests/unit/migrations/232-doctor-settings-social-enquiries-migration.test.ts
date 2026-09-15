/**
 * Content-sanity test for migration 232 (social_enquiries).
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/232_doctor_settings_social_enquiries.sql'
);

describe('232_doctor_settings_social_enquiries.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  it('adds social_enquiries defaulting to yes', () => {
    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS social_enquiries TEXT NOT NULL DEFAULT 'yes'/
    );
  });

  it('constrains to yes | not_yet', () => {
    expect(sql).toMatch(/social_enquiries IN \('yes', 'not_yet'\)/);
  });

  it('does not create a new RLS policy', () => {
    expect(sql).not.toMatch(/CREATE POLICY/i);
  });

  it('documents a reverse migration', () => {
    expect(sql).toMatch(/Reverse migration/);
    expect(sql).toMatch(/DROP COLUMN IF EXISTS social_enquiries/);
  });
});
