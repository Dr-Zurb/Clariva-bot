/**
 * Content-sanity test for migration 114 (rcp-26 per-doctor placeholder rows).
 *
 * Narrows the legacy global unique index to doctor_id IS NULL so per-doctor
 * rows can share the same platform sender until rcp-29 drops the index.
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/114_perdoctor_placeholder_global_index_narrow.sql',
);

const sql = readFileSync(MIGRATION_PATH, 'utf8');

describe('114_perdoctor_placeholder_global_index_narrow.sql (rcp-26)', () => {
  it('drops and recreates idx_patients_platform_external_id narrowed to legacy rows', () => {
    expect(sql).toMatch(/DROP INDEX IF EXISTS idx_patients_platform_external_id/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_platform_external_id/);
    expect(sql).toMatch(
      /ON patients \(platform, platform_external_id\)\s+WHERE platform IS NOT NULL[\s\S]*?AND doctor_id IS NULL/,
    );
  });

  it('does not drop the per-doctor partial unique from migration 113', () => {
    expect(sql).not.toMatch(/DROP INDEX.*idx_patients_doctor_platform_external_id/);
  });
});
