/**
 * Content-sanity test for migration 183 (doctor_verification table + RLS).
 *
 * Pins the load-bearing clauses so an accidental edit that:
 *   - drops the 4-state status CHECK (or reintroduces a Postgres ENUM),
 *   - loosens the FK away from ON DELETE CASCADE,
 *   - grants doctors a write policy (the privilege-escalation guard — a
 *     doctor must NOT be able to self-set status='verified'),
 *   - drops the admin role-claim policies or the SELECT-own policy,
 * fails in review. Live CHECK / RLS behavior is verified when the migration
 * is applied on a scratch DB (task ver-01 §4).
 *
 * @see docs/Work/Daily-plans/July 2026/22-07-2026/doctor-verification-v1/Tasks/task-ver-01-migration-table-and-rls.md
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/183_doctor_verification.sql',
);

const LEGAL_STATUSES = [
  'unverified',
  'pending_review',
  'verified',
  'rejected',
] as const;

describe('183_doctor_verification.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  describe('table + columns', () => {
    it('creates the table idempotently keyed on auth.users with CASCADE', () => {
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS doctor_verification/);
      expect(sql).toMatch(
        /doctor_id\s+UUID PRIMARY KEY REFERENCES auth\.users\(id\) ON DELETE CASCADE/,
      );
    });

    it('defaults status to unverified and CHECKs the four legal states', () => {
      expect(sql).toMatch(/status\s+TEXT NOT NULL DEFAULT 'unverified'/);
      for (const status of LEGAL_STATUSES) {
        expect(sql).toContain(`'${status}'`);
      }
    });

    it('does not invent a Postgres ENUM for status', () => {
      expect(sql).not.toMatch(/CREATE TYPE/i);
    });

    it('stores document references as storage path columns, not blobs', () => {
      expect(sql).toMatch(/certificate_path\s+TEXT/);
      expect(sql).toMatch(/gov_id_path\s+TEXT/);
      expect(sql).not.toMatch(/BYTEA/i);
    });

    it('carries the review audit-trail columns', () => {
      expect(sql).toMatch(/submitted_at\s+TIMESTAMPTZ/);
      expect(sql).toMatch(/reviewed_at\s+TIMESTAMPTZ/);
      expect(sql).toMatch(/reviewed_by\s+TEXT/);
      expect(sql).toMatch(/reject_reason\s+TEXT/);
    });

    it('indexes status for the admin pending-review scan', () => {
      expect(sql).toMatch(
        /CREATE INDEX IF NOT EXISTS idx_doctor_verification_status\s+ON doctor_verification\(status\)/,
      );
    });
  });

  describe('RLS — privilege-escalation guard', () => {
    it('enables row level security', () => {
      expect(sql).toMatch(/ALTER TABLE doctor_verification ENABLE ROW LEVEL SECURITY/);
    });

    it('lets doctors read ONLY their own row', () => {
      expect(sql).toMatch(
        /CREATE POLICY "Doctors can read own verification"\s+ON doctor_verification FOR SELECT\s+USING \(doctor_id = auth\.uid\(\)\)/,
      );
    });

    it('grants NO write policy to doctors (no doctor INSERT/UPDATE)', () => {
      // A doctor-scoped write policy would let a doctor PATCH status='verified'
      // via direct PostgREST. Assert no such policy exists.
      expect(sql).not.toMatch(/FOR INSERT[\s\S]*?doctor_id = auth\.uid\(\)/);
      expect(sql).not.toMatch(
        /CREATE POLICY "Doctors can (insert|update)[\s\S]*?doctor_verification/i,
      );
    });

    it('gates admin policies on a server-minted role claim only', () => {
      expect(sql).toMatch(
        /CREATE POLICY "Admins can read all verifications"[\s\S]*?auth\.jwt\(\) ->> 'role' = 'admin'/,
      );
      expect(sql).toMatch(
        /CREATE POLICY "Admins can update all verifications"[\s\S]*?auth\.jwt\(\) ->> 'role' = 'admin'/,
      );
    });
  });

  describe('triggers + reverse', () => {
    it('reuses the shared updated_at trigger function', () => {
      expect(sql).toMatch(/EXECUTE FUNCTION update_updated_at_column\(\)/);
    });

    it('documents a reverse migration', () => {
      expect(sql).toMatch(/Reverse migration/i);
      expect(sql).toMatch(/DROP TABLE\s+IF EXISTS doctor_verification/);
    });
  });
});
