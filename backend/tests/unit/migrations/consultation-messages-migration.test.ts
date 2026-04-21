/**
 * Content-sanity test for migration 051 (consultation_messages).
 *
 * Plan:  docs/Development/Daily-plans/April 2026/19-04-2026/Plans/plan-04-text-consultation-supabase.md
 * Task:  docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-17-consultation-messages-table-rls-storage.md
 *
 * Why a content-sanity test, not a live-DB RLS integration test?
 *
 *   The repo has no live-Supabase test harness today. `tests/integration/`
 *   contains stand-alone scripts run via `npx ts-node` against a running
 *   server, not jest tests. Bootstrapping a Supabase test container +
 *   migration runner + auth.users seeding for a single migration is a
 *   separate harness-bootstrap concern out of scope for Task 17.
 *
 *   This test pins the **load-bearing clauses** of the migration so a
 *   future edit that accidentally removes the live-only RLS guard, the
 *   sender_id spoof check, or the storage path convention will fail in
 *   review. The full RLS behavior is verified manually in the smoke step
 *   documented on task-17 and gets programmatic coverage when Plan 04
 *   Task 18's adapter tests exercise the table via a mocked Supabase
 *   client.
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/051_consultation_messages.sql',
);

describe('051_consultation_messages.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  describe('ENUM consultation_message_kind', () => {
    it('declares the ENUM with only the v1 value `text`', () => {
      expect(sql).toMatch(/CREATE TYPE consultation_message_kind AS ENUM \('text'\)/);
    });

    it('guards CREATE TYPE behind a pg_type existence check (idempotent)', () => {
      // Mirrors the 049 pattern; re-running the migration must not error.
      expect(sql).toMatch(/IF NOT EXISTS \(SELECT 1 FROM pg_type WHERE typname = 'consultation_message_kind'\)/);
    });
  });

  describe('table consultation_messages', () => {
    it('creates the table with IF NOT EXISTS', () => {
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS consultation_messages/);
    });

    it('FKs session_id to consultation_sessions(id) with ON DELETE CASCADE', () => {
      expect(sql).toMatch(
        /session_id\s+UUID NOT NULL REFERENCES consultation_sessions\(id\) ON DELETE CASCADE/,
      );
    });

    it('constrains sender_role to doctor | patient (Plan 06 widens additively)', () => {
      expect(sql).toMatch(/CHECK \(sender_role IN \('doctor', 'patient'\)\)/);
    });

    it('defaults kind to `text` and uses the new ENUM type', () => {
      expect(sql).toMatch(/kind\s+consultation_message_kind NOT NULL DEFAULT 'text'/);
    });

    it('keeps body nullable (Plan 06 attachment-only rows need NULL)', () => {
      // Body column declared as TEXT with no NOT NULL.
      expect(sql).toMatch(/body\s+TEXT,/);
      expect(sql).not.toMatch(/body\s+TEXT NOT NULL/);
    });

    it('creates the (session_id, created_at) index for chronological reads', () => {
      expect(sql).toMatch(
        /CREATE INDEX IF NOT EXISTS idx_consultation_messages_session_time\s+ON consultation_messages\(session_id, created_at\)/,
      );
    });
  });

  describe('Row-Level Security on consultation_messages', () => {
    it('enables RLS on the table', () => {
      expect(sql).toMatch(/ALTER TABLE consultation_messages ENABLE ROW LEVEL SECURITY/);
    });

    it('declares the SELECT participants policy keyed on session membership', () => {
      expect(sql).toMatch(
        /CREATE POLICY consultation_messages_select_participants\s+ON consultation_messages\s+FOR SELECT/,
      );
      expect(sql).toMatch(
        /SELECT id FROM consultation_sessions[\s\S]+?WHERE doctor_id = auth\.uid\(\)\s*\n\s*OR \(patient_id IS NOT NULL AND patient_id = auth\.uid\(\)\)/,
      );
    });

    it('declares the INSERT live-participants policy with all three guards', () => {
      // Three doors that must ALL be enforced:
      //   1. sender_id = auth.uid()  (spoof guard)
      //   2. session participant     (membership guard)
      //   3. status = 'live'         (Decision 5 live-only doctrine guard)
      expect(sql).toMatch(
        /CREATE POLICY consultation_messages_insert_live_participants\s+ON consultation_messages\s+FOR INSERT/,
      );
      expect(sql).toMatch(/WITH CHECK \([\s\S]+?sender_id = auth\.uid\(\)/);
      expect(sql).toMatch(/AND session_id IN \(/);
      expect(sql).toMatch(/AND status = 'live'/);
    });

    it('does NOT declare any UPDATE or DELETE policies (messages immutable from client)', () => {
      expect(sql).not.toMatch(/CREATE POLICY[^;]*\sFOR UPDATE\s/);
      expect(sql).not.toMatch(/CREATE POLICY[^;]*\sFOR DELETE\s/);
    });

    it('drops policies before recreating them (re-run safety)', () => {
      expect(sql).toMatch(/DROP POLICY IF EXISTS consultation_messages_select_participants/);
      expect(sql).toMatch(/DROP POLICY IF EXISTS consultation_messages_insert_live_participants/);
    });
  });

  describe('Realtime publication', () => {
    it('adds the table to supabase_realtime inside an idempotent guard', () => {
      expect(sql).toMatch(/ALTER PUBLICATION supabase_realtime ADD TABLE consultation_messages/);
      // Wrapped in DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL.
      expect(sql).toMatch(/EXCEPTION[\s\S]*WHEN duplicate_object THEN/);
    });

    it('survives instances where supabase_realtime publication is missing', () => {
      // Self-hosted Postgres without the Supabase Realtime extension must
      // not fail this migration. We trap undefined_object too.
      expect(sql).toMatch(/WHEN undefined_object THEN/);
    });
  });

  describe('Storage bucket consultation-attachments', () => {
    it('creates the bucket as private via the standard 027 INSERT pattern', () => {
      expect(sql).toMatch(
        /INSERT INTO storage\.buckets \(id, name, public\)[\s\S]+?'consultation-attachments',[\s\S]+?'consultation-attachments',[\s\S]+?false[\s\S]+?ON CONFLICT \(id\) DO NOTHING/,
      );
    });
  });

  describe('Row-Level Security on storage.objects (consultation-attachments bucket)', () => {
    it('declares the SELECT policy keyed on session membership', () => {
      expect(sql).toMatch(
        /CREATE POLICY consultation_attachments_select_participants\s+ON storage\.objects\s+FOR SELECT/,
      );
      expect(sql).toMatch(/bucket_id = 'consultation-attachments'/);
    });

    it('declares the INSERT policy with the live-only guard', () => {
      expect(sql).toMatch(
        /CREATE POLICY consultation_attachments_insert_live_participants\s+ON storage\.objects\s+FOR INSERT/,
      );
      // Same Decision 5 enforcement as the messages table.
      const insertSection = sql.split(
        /CREATE POLICY consultation_attachments_insert_live_participants/,
      )[1] ?? '';
      expect(insertSection).toMatch(/AND status = 'live'/);
    });

    it('keys storage RLS on the first folder segment (path convention)', () => {
      // Path convention is consultation-attachments/{session_id}/{uuid}.{ext};
      // RLS keys on storage.foldername(name)[1] = session_id.
      // Plan 06 + 07 must follow this — pin it here.
      expect(sql).toMatch(/\(storage\.foldername\(name\)\)\[1\]/);
    });

    it('drops storage policies before recreating them (re-run safety)', () => {
      expect(sql).toMatch(/DROP POLICY IF EXISTS consultation_attachments_select_participants/);
      expect(sql).toMatch(/DROP POLICY IF EXISTS consultation_attachments_insert_live_participants/);
    });
  });

  describe('reverse-migration documentation', () => {
    it('documents the manual reverse-migration steps in a trailing comment', () => {
      // The repo has no down-migration runner; reverse steps live in comments.
      // Pin that they are present so a future contributor doesn't accidentally
      // delete the documentation.
      expect(sql).toMatch(/Reverse migration/i);
      expect(sql).toMatch(/DROP TABLE\s+IF EXISTS consultation_messages/);
      expect(sql).toMatch(/DROP TYPE\s+IF EXISTS consultation_message_kind/);
    });
  });
});
