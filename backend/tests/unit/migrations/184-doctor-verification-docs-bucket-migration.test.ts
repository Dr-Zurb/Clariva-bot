/**
 * Content-sanity test for migration 184 (doctor-verification-docs Storage bucket).
 *
 * Pins the load-bearing clauses so an accidental edit that:
 *   - makes the bucket public,
 *   - grants a non-service-role INSERT/UPDATE/DELETE policy (all writes must
 *     go through the service-role backend),
 *   - drops the owner SELECT-own folder-segment RLS,
 * fails in review. Live Storage RLS behavior is verified when the migration is
 * applied on a scratch project (task ver-02 §4).
 *
 * @see docs/Work/Daily-plans/July 2026/22-07-2026/doctor-verification-v1/Tasks/task-ver-02-storage-and-upload.md
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/184_doctor_verification_docs_bucket.sql',
);

describe('184_doctor_verification_docs_bucket.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  describe('bucket', () => {
    it('provisions a PRIVATE bucket idempotently', () => {
      expect(sql).toMatch(/INSERT INTO storage\.buckets \(id, name, public\)/);
      expect(sql).toMatch(/'doctor-verification-docs',\s*'doctor-verification-docs',\s*false/);
      expect(sql).toMatch(/ON CONFLICT \(id\) DO NOTHING/);
    });

    it('does not create a public bucket', () => {
      expect(sql).not.toMatch(/true\s*\)\s*ON CONFLICT/);
    });
  });

  describe('RLS', () => {
    it('lets the owning doctor read only their own folder prefix', () => {
      expect(sql).toMatch(
        /CREATE POLICY doctor_verification_docs_select_own\s+ON storage\.objects FOR SELECT/,
      );
      expect(sql).toMatch(/\(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/);
    });

    it('grants NO non-service-role write policy (escalation guard)', () => {
      expect(sql).not.toMatch(/FOR INSERT/i);
      expect(sql).not.toMatch(/FOR UPDATE/i);
      expect(sql).not.toMatch(/FOR DELETE/i);
    });
  });

  it('documents a reverse migration', () => {
    expect(sql).toMatch(/Reverse migration/i);
    expect(sql).toMatch(
      /DROP POLICY IF EXISTS doctor_verification_docs_select_own ON storage\.objects/,
    );
  });
});
