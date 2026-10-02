/**
 * Content-sanity test for migration 241 (public booking slug).
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/241_doctor_settings_public_slug.sql'
);

describe('241_doctor_settings_public_slug.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  it('adds a nullable public_slug column', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS public_slug TEXT NULL/);
  });

  it('uniques non-null slugs and checks the url-safe shape', () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS doctor_settings_public_slug_uidx/);
    expect(sql).toMatch(/WHERE public_slug IS NOT NULL/);
    expect(sql).toMatch(/doctor_settings_public_slug_check/);
    expect(sql).toContain("public_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'");
  });

  it('does not add an RLS policy', () => {
    expect(sql).not.toMatch(/CREATE POLICY/i);
    expect(sql).not.toMatch(/ENABLE ROW LEVEL SECURITY/i);
  });

  it('documents a reverse migration', () => {
    expect(sql).toMatch(/Reverse migration/);
    expect(sql).toMatch(/DROP COLUMN IF EXISTS public_slug/);
  });
});
