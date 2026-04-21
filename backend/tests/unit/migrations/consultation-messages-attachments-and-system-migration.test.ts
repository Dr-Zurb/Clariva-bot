/**
 * Content-sanity test for migrations 062 + 063 (consultation_messages · Plan 06 · Task 39).
 *
 * Plan:  docs/Development/Daily-plans/April 2026/19-04-2026/Plans/plan-06-companion-text-channel.md
 * Task:  docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-39-consultation-messages-attachments-and-system-rows.md
 *
 * Why a content-sanity test?
 *
 *   The repo has no live-Supabase test harness for jest (see migration
 *   051's test for the same doctrine). This test pins the load-bearing
 *   clauses so a future edit that silently drops the `NOT VALID` dance,
 *   the row-shape CHECK branches, or the reverse-migration block fails
 *   loudly in review. Behavioural verification is done via the
 *   `text-session-supabase.ts#sendMessage` service-layer unit tests
 *   (happy + sad paths for 'system') and the manual smoke step
 *   documented on task-39.
 *
 * Why two files?
 *
 *   Postgres raises `55P04 unsafe use of new value` when a newly-ADD-ed
 *   ENUM value is referenced by another statement in the SAME transaction
 *   (including Supabase SQL-editor's implicit wrapper). The row-shape
 *   CHECK in 063 references `kind = 'attachment'` / `kind = 'system'`,
 *   which are added in 062 — so 062 must COMMIT before 063 can run.
 *   This test pins the split so a future "let's fold them back into one
 *   file" edit fails loudly rather than silently breaking the rollout.
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_062_PATH = resolve(
  __dirname,
  '../../../migrations/062_consultation_messages_attachments_and_system.sql',
);
const MIGRATION_063_PATH = resolve(
  __dirname,
  '../../../migrations/063_consultation_messages_attachment_system_columns_and_checks.sql',
);

const sql062 = readFileSync(MIGRATION_062_PATH, 'utf8');
const sql063 = readFileSync(MIGRATION_063_PATH, 'utf8');

describe('062_consultation_messages_attachments_and_system.sql — ENUM additions only', () => {
  describe('ENUM additions (additive, idempotent)', () => {
    it("adds 'attachment' via ADD VALUE IF NOT EXISTS", () => {
      expect(sql062).toMatch(
        /ALTER TYPE consultation_message_kind ADD VALUE IF NOT EXISTS 'attachment'/,
      );
    });

    it("adds 'system' via ADD VALUE IF NOT EXISTS", () => {
      expect(sql062).toMatch(
        /ALTER TYPE consultation_message_kind ADD VALUE IF NOT EXISTS 'system'/,
      );
    });
  });

  describe('separation-of-migrations contract', () => {
    it('does NOT reference the new ENUM values outside the ALTER TYPE lines (they cannot be used in the same transaction that ADD-ed them — PG 55P04)', () => {
      // Only the ALTER TYPE ... ADD VALUE lines may mention the literals;
      // any non-comment reference (e.g. in a CHECK) would trigger the
      // 55P04 error that split the migration in the first place. Strip
      // `--` line comments before counting so header/reverse-migration
      // prose doesn't skew the match.
      const sqlNoComments = sql062
        .split(/\r?\n/)
        .map((line) => line.replace(/--.*$/, ''))
        .join('\n');
      const attachmentRefs = sqlNoComments.match(/'attachment'/g) ?? [];
      const systemRefs     = sqlNoComments.match(/'system'/g) ?? [];
      expect(attachmentRefs).toHaveLength(1);
      expect(systemRefs).toHaveLength(1);
    });

    it('does NOT add any columns or CHECK constraints (those live in 063)', () => {
      expect(sql062).not.toMatch(/ADD COLUMN/);
      expect(sql062).not.toMatch(/ADD CONSTRAINT/);
      expect(sql062).not.toMatch(/VALIDATE CONSTRAINT/);
    });

    it('documents the 55P04 root cause + the 062→063 run order', () => {
      expect(sql062).toMatch(/55P04/);
      expect(sql062).toMatch(/063_consultation_messages_attachment_system_columns_and_checks\.sql/);
    });
  });
});

describe('063_consultation_messages_attachment_system_columns_and_checks.sql — columns + CHECKs', () => {
  describe('new columns', () => {
    it('adds attachment_url as TEXT with ADD COLUMN IF NOT EXISTS', () => {
      expect(sql063).toMatch(/ADD COLUMN IF NOT EXISTS attachment_url\s+TEXT/);
    });

    it('adds attachment_mime_type as TEXT with ADD COLUMN IF NOT EXISTS', () => {
      expect(sql063).toMatch(/ADD COLUMN IF NOT EXISTS attachment_mime_type\s+TEXT/);
    });

    it('adds attachment_byte_size as INTEGER with non-negative CHECK and IF NOT EXISTS', () => {
      // INTEGER (not BIGINT) is deliberate — v1 cap is 10 MB per Migration 051.
      // The non-negative CHECK must permit NULL (per-kind presence is enforced
      // by the row-shape CHECK below, not by per-column NOT NULL).
      expect(sql063).toMatch(
        /ADD COLUMN IF NOT EXISTS attachment_byte_size\s+INTEGER\s+CHECK \(attachment_byte_size IS NULL OR attachment_byte_size >= 0\)/,
      );
    });

    it('adds system_event as TEXT with ADD COLUMN IF NOT EXISTS (deliberately NOT an ENUM)', () => {
      // Per Notes #4: plain TEXT so Plans 07/08/09 don't have to coordinate
      // `ALTER TYPE` migration ordering. TypeScript is the source of truth.
      expect(sql063).toMatch(/ADD COLUMN IF NOT EXISTS system_event\s+TEXT/);
      // No `consultation_message_system_event` ENUM type gets created here.
      expect(sql063).not.toMatch(/CREATE TYPE consultation_message_system_event/);
    });

    it('all four new columns are nullable (enforced by the row-shape CHECK, not column NOT NULL)', () => {
      expect(sql063).not.toMatch(/ADD COLUMN IF NOT EXISTS attachment_url\s+TEXT\s+NOT NULL/);
      expect(sql063).not.toMatch(/ADD COLUMN IF NOT EXISTS attachment_mime_type\s+TEXT\s+NOT NULL/);
      expect(sql063).not.toMatch(/ADD COLUMN IF NOT EXISTS attachment_byte_size\s+INTEGER[^,]*NOT NULL/);
      expect(sql063).not.toMatch(/ADD COLUMN IF NOT EXISTS system_event\s+TEXT\s+NOT NULL/);
    });
  });

  describe('sender_role CHECK widening (drop + recreate)', () => {
    it('drops the old CHECK by name first (safe re-run)', () => {
      expect(sql063).toMatch(
        /DROP CONSTRAINT IF EXISTS consultation_messages_sender_role_check/,
      );
    });

    it("recreates the CHECK with the widened ('doctor','patient','system') set", () => {
      expect(sql063).toMatch(
        /ADD CONSTRAINT consultation_messages_sender_role_check\s+CHECK \(sender_role IN \('doctor', 'patient', 'system'\)\)/,
      );
    });
  });

  describe('row-shape CHECK (per-kind required-fields contract)', () => {
    it('is added as NOT VALID first (zero full-table scan under ACCESS EXCLUSIVE)', () => {
      expect(sql063).toMatch(
        /ADD CONSTRAINT consultation_messages_kind_shape_check[\s\S]+?\)\s+NOT VALID\s*;/,
      );
    });

    it('is VALIDATE-d in a separate statement after the ADD', () => {
      expect(sql063).toMatch(
        /VALIDATE CONSTRAINT consultation_messages_kind_shape_check/,
      );
    });

    it('includes the text-kind branch (body NOT NULL, attachment/system fields NULL)', () => {
      expect(sql063).toMatch(/kind = 'text'/);
      const textBlock = /kind = 'text'[\s\S]+?attachment_url IS NULL[\s\S]+?attachment_mime_type IS NULL[\s\S]+?attachment_byte_size IS NULL[\s\S]+?system_event IS NULL/;
      expect(sql063).toMatch(textBlock);
    });

    it('includes the attachment-kind branch (attachment_url + mime NOT NULL, system_event NULL)', () => {
      expect(sql063).toMatch(
        /kind = 'attachment'[\s\S]+?attachment_url IS NOT NULL[\s\S]+?attachment_mime_type IS NOT NULL[\s\S]+?system_event IS NULL/,
      );
    });

    it("includes the system-kind branch (body + system_event NOT NULL, sender_role = 'system', attachment fields NULL)", () => {
      expect(sql063).toMatch(
        /kind = 'system'[\s\S]+?body IS NOT NULL[\s\S]+?system_event IS NOT NULL[\s\S]+?sender_role = 'system'[\s\S]+?attachment_url IS NULL/,
      );
    });

    it('drops the row-shape CHECK before recreating it (re-run safety)', () => {
      expect(sql063).toMatch(
        /DROP CONSTRAINT IF EXISTS consultation_messages_kind_shape_check/,
      );
    });
  });

  describe('RLS — deliberately unchanged in this migration', () => {
    it('does NOT declare an INSERT policy named consultation_messages_insert_system (service-role bypass is the v1 path)', () => {
      expect(sql063).not.toMatch(/CREATE POLICY\s+consultation_messages_insert_system/);
    });

    it('does NOT touch the existing consultation_messages_insert_live_participants policy', () => {
      expect(sql063).not.toMatch(
        /DROP POLICY IF EXISTS consultation_messages_insert_live_participants/,
      );
    });
  });

  describe('reverse-migration documentation', () => {
    it('documents the manual reverse steps in a trailing comment', () => {
      expect(sql063).toMatch(/Reverse migration/i);
    });

    it('documents dropping the four new columns (in any order, all four present)', () => {
      expect(sql063).toMatch(/DROP COLUMN IF EXISTS attachment_url/);
      expect(sql063).toMatch(/DROP COLUMN IF EXISTS attachment_mime_type/);
      expect(sql063).toMatch(/DROP COLUMN IF EXISTS attachment_byte_size/);
      expect(sql063).toMatch(/DROP COLUMN IF EXISTS system_event/);
    });

    it('documents the sender_role CHECK restore to the original two-value set', () => {
      expect(sql063).toMatch(
        /CHECK \(sender_role IN \('doctor', 'patient'\)\)/,
      );
    });

    it('documents the known limitation that ENUM values cannot be dropped in PG', () => {
      expect(sql063).toMatch(/ENUM values cannot be[\s\S]+?drop/i);
    });
  });
});
