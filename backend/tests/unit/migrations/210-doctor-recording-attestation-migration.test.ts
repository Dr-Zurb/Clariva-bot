/**
 * Content-sanity test for migration 210 (doctor_recording_attestation).
 *
 * Pins the load-bearing clauses so an accidental edit that:
 *   - drops the (doctor_id, policy_version) unique constraint,
 *   - loosens the FK away from ON DELETE CASCADE,
 *   - adds an auth.uid() / auth.jwt() policy (REC2-D4),
 *   - adds an IP / user-agent / free-text column (REC2-D3),
 * fails in review.
 *
 * @see docs/Work/Daily-plans/August 2026/17-08-2026/recording-governance-v2/p2-mandatory-audio/Tasks/task-rec-07-migration-doctor-recording-attestation.md
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/210_doctor_recording_attestation.sql',
);

describe('210_doctor_recording_attestation.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  describe('table + columns', () => {
    it('creates the table idempotently keyed on auth.users with CASCADE', () => {
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS doctor_recording_attestation/);
      expect(sql).toMatch(
        /doctor_id\s+UUID NOT NULL REFERENCES auth\.users\(id\) ON DELETE CASCADE/,
      );
    });

    it('uniques (doctor_id, policy_version)', () => {
      expect(sql).toMatch(
        /UNIQUE\s*\(\s*doctor_id\s*,\s*policy_version\s*\)/,
      );
    });

    it('requires policy_version with no default and no pinned CHECK', () => {
      expect(sql).toMatch(/policy_version\s+TEXT NOT NULL/);
      expect(sql).not.toMatch(/policy_version\s+TEXT NOT NULL DEFAULT/i);
      expect(sql).not.toMatch(/CHECK\s*\(\s*policy_version/i);
    });

    it('stamps accepted_at from the database clock', () => {
      expect(sql).toMatch(/accepted_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/);
    });

    it('adds no redundant index beyond the unique constraint', () => {
      expect(sql).not.toMatch(/CREATE INDEX/i);
    });
  });

  describe('REC2-D3 — no forensic PII columns', () => {
    it('contains no ip, ip_address or user_agent column', () => {
      expect(sql).not.toMatch(/\bip_address\b/i);
      expect(sql).not.toMatch(/\buser_agent\b/i);
      expect(sql).not.toMatch(/^\s*ip\s+/im);
    });
  });

  describe('RLS — REC2-D4', () => {
    it('enables row level security', () => {
      expect(sql).toMatch(
        /ALTER TABLE doctor_recording_attestation ENABLE ROW LEVEL SECURITY/,
      );
    });

    it('adds no auth.uid() or auth.jwt() expression', () => {
      expect(sql).not.toMatch(/auth\.uid\s*\(/);
      expect(sql).not.toMatch(/auth\.jwt\s*\(/);
    });

    it('adds no CREATE POLICY', () => {
      expect(sql).not.toMatch(/CREATE POLICY/i);
    });
  });

  describe('triggers + reverse', () => {
    it('reuses the shared updated_at trigger function', () => {
      expect(sql).toMatch(/EXECUTE FUNCTION update_updated_at_column\(\)/);
    });

    it('documents a reverse migration and warns against reverting live rows', () => {
      expect(sql).toMatch(/Reverse migration/i);
      expect(sql).toMatch(/Do NOT\s+revert once attestation rows exist/i);
      expect(sql).toMatch(/DROP TABLE\s+IF EXISTS doctor_recording_attestation/);
    });
  });
});
