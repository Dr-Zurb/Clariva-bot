/**
 * Content-sanity test for migration 212 (clinic-branding Storage bucket).
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/212_clinic_branding_bucket.sql',
);

describe('212_clinic_branding_bucket.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  it('provisions a PRIVATE bucket idempotently', () => {
    expect(sql).toMatch(/INSERT INTO storage\.buckets \(id, name, public\)/);
    expect(sql).toMatch(/'clinic-branding',\s*'clinic-branding',\s*false/);
    expect(sql).toMatch(/ON CONFLICT \(id\) DO NOTHING/);
  });

  it('does not create a public bucket', () => {
    expect(sql).not.toMatch(/true\s*\)\s*ON CONFLICT/);
  });

  it('lets the owning doctor read only their own folder prefix', () => {
    expect(sql).toMatch(
      /CREATE POLICY clinic_branding_select_own\s+ON storage\.objects FOR SELECT/,
    );
    expect(sql).toMatch(/\(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/);
  });

  it('grants NO non-service-role write policy', () => {
    expect(sql).not.toMatch(/FOR INSERT/i);
    expect(sql).not.toMatch(/FOR UPDATE/i);
    expect(sql).not.toMatch(/FOR DELETE/i);
  });
});
