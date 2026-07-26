/**
 * Content-sanity test for migration 185 (verification-v2 status widen).
 *
 * Pins the load-bearing clauses so an accidental edit that drops:
 *   - the full 5-status CHECK list (or reintroduces a Postgres ENUM),
 *   - the additive DROP/ADD constraint pattern,
 *   - the reuse of reject_reason (no new column),
 * fails in review. Live CHECK behavior is verified when the migration
 * is applied on a scratch DB (task verv2-01).
 *
 * @see docs/Work/Daily-plans/July 2026/22-07-2026/verification-v2/Tasks/task-verv2-01-migration-changes-requested.md
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/185_doctor_verification_changes_requested.sql',
);

const LEGAL_STATUSES = [
  'unverified',
  'pending_review',
  'verified',
  'rejected',
  'changes_requested',
] as const;

describe('185_doctor_verification_changes_requested.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  describe('status CHECK widen', () => {
    it('drops then re-adds the CHECK (idempotent DROP/ADD pattern)', () => {
      expect(sql).toMatch(
        /DROP CONSTRAINT IF EXISTS doctor_verification_status_check/,
      );
      expect(sql).toMatch(
        /ADD CONSTRAINT doctor_verification_status_check CHECK/,
      );
    });

    it('lists all five legal statuses (legacy four + changes_requested)', () => {
      for (const status of LEGAL_STATUSES) {
        expect(sql).toContain(`'${status}'`);
      }
    });

    it('includes changes_requested in the ADD CONSTRAINT block', () => {
      const addBlock = sql.match(
        /ADD CONSTRAINT doctor_verification_status_check CHECK\s*\(([\s\S]*?)\)\s*;/,
      );
      expect(addBlock).not.toBeNull();
      expect(addBlock![1]).toContain("'changes_requested'");
      for (const status of LEGAL_STATUSES) {
        expect(addBlock![1]).toContain(`'${status}'`);
      }
    });

    it('does not invent a Postgres ENUM for status', () => {
      expect(sql).not.toMatch(/CREATE TYPE/i);
    });

    it('does not add a new column (reuses reject_reason)', () => {
      expect(sql).not.toMatch(/ADD COLUMN/i);
    });
  });

  describe('comments + reverse', () => {
    it('documents the changes_requested lifecycle branch', () => {
      expect(sql).toMatch(/changes_requested/i);
      expect(sql).toMatch(/COMMENT ON TABLE doctor_verification/i);
      expect(sql).toMatch(/COMMENT ON COLUMN doctor_verification\.reject_reason/i);
    });

    it('documents a reverse migration', () => {
      expect(sql).toMatch(/Reverse migration/i);
      expect(sql).toMatch(
        /status IN \('unverified', 'pending_review', 'verified', 'rejected'\)/,
      );
    });
  });
});
