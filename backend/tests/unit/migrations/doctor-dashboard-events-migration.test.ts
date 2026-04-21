/**
 * Content-sanity test for migration 066 (doctor_dashboard_events).
 *
 * Plan: docs/Development/Daily-plans/April 2026/19-04-2026/Plans/plan-07-recording-replay-and-mutual-accountability.md
 * Task: docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-30-mutual-replay-notifications.md
 *
 * Why a content-sanity test instead of a live-DB integration test?
 *
 *   The repo has no live-Supabase test harness today (see the
 *   `051_consultation_messages.sql` test for the same rationale). This
 *   test pins the **load-bearing clauses** of the migration so an
 *   accidental edit that drops:
 *
 *     - the ON DELETE CASCADE / SET NULL semantics (regulatory survival),
 *     - the `acknowledged_at NULLS FIRST` index (UI hot-read order),
 *     - the RLS policies (doctor-only read + ack),
 *     - the `event_kind` CHECK list (Plan 08/09 widens this additively),
 *     - the `payload JSONB NOT NULL DEFAULT '{}'::jsonb` shape,
 *
 *   will fail in review. Live RLS behavior is verified manually in the
 *   smoke step on task-30 and gets programmatic coverage when the
 *   service helpers are exercised by their unit tests.
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/066_doctor_dashboard_events.sql',
);

describe('066_doctor_dashboard_events.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  describe('table doctor_dashboard_events', () => {
    it('creates the table with IF NOT EXISTS (idempotent re-run)', () => {
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS doctor_dashboard_events/);
    });

    it('FKs doctor_id to auth.users(id) with ON DELETE CASCADE', () => {
      expect(sql).toMatch(
        /doctor_id\s+UUID NOT NULL REFERENCES auth\.users\(id\) ON DELETE CASCADE/,
      );
    });

    it('declares event_kind as TEXT + CHECK so Plans 08/09 can widen additively', () => {
      // CHECK list must include the v1 value verbatim.
      expect(sql).toMatch(/event_kind\s+TEXT NOT NULL CHECK \(event_kind IN/);
      expect(sql).toMatch(/'patient_replayed_recording'/);
      // Critically: NOT a Postgres ENUM. Widening an ENUM needs an
      // ALTER TYPE round-trip; widening a CHECK is DROP + ADD.
      expect(sql).not.toMatch(/CREATE TYPE.*event_kind/i);
    });

    it('FKs session_id to consultation_sessions(id) with ON DELETE SET NULL (not CASCADE)', () => {
      // Set-null preserves the doctor's "I was notified" history after
      // a regulatory retention purge of the session row. Cascade would
      // erase the event silently.
      expect(sql).toMatch(
        /session_id\s+UUID REFERENCES consultation_sessions\(id\) ON DELETE SET NULL/,
      );
      expect(sql).not.toMatch(
        /session_id\s+UUID REFERENCES consultation_sessions\(id\) ON DELETE CASCADE/,
      );
    });

    it("declares payload as JSONB NOT NULL with a default empty-object", () => {
      expect(sql).toMatch(/payload\s+JSONB NOT NULL DEFAULT '\{\}'::jsonb/);
    });

    it('keeps acknowledged_at nullable (NULL = unread)', () => {
      expect(sql).toMatch(/acknowledged_at TIMESTAMPTZ(?!\s+NOT NULL)/);
    });
  });

  describe('indexes', () => {
    it('creates the doctor-unread-first index with NULLS FIRST', () => {
      // NULLS FIRST is the load-bearing clause — Postgres btree default
      // is NULLS LAST for ascending order, which would invert the UI's
      // unread-first feed semantics.
      expect(sql).toMatch(
        /CREATE INDEX IF NOT EXISTS idx_doctor_dashboard_events_doctor_unread\s+ON doctor_dashboard_events\(doctor_id, acknowledged_at NULLS FIRST, created_at DESC\)/,
      );
    });
  });

  describe('Row-Level Security', () => {
    it('enables RLS on the table', () => {
      expect(sql).toMatch(/ALTER TABLE doctor_dashboard_events ENABLE ROW LEVEL SECURITY/);
    });

    it('declares the doctor-self SELECT policy gated on auth.uid()', () => {
      expect(sql).toMatch(/CREATE POLICY doctor_dashboard_events_select_self/);
      expect(sql).toMatch(/FOR SELECT[\s\S]*?USING \(doctor_id = auth\.uid\(\)\)/);
    });

    it('declares the doctor-self UPDATE policy with both USING and WITH CHECK', () => {
      // Both clauses are required: USING gates the row visibility for
      // the UPDATE; WITH CHECK prevents a doctor from re-assigning
      // doctor_id to themselves (or anyone else) via UPDATE SET doctor_id.
      expect(sql).toMatch(/CREATE POLICY doctor_dashboard_events_update_self/);
      expect(sql).toMatch(/FOR UPDATE[\s\S]*?USING \(doctor_id = auth\.uid\(\)\)[\s\S]*?WITH CHECK \(doctor_id = auth\.uid\(\)\)/);
    });

    it('does NOT declare an INSERT policy (service-role-only insert path)', () => {
      // The notification helper writes via the admin client which
      // bypasses RLS. A FOR INSERT policy would invite client-direct
      // inserts; we deliberately omit one.
      expect(sql).not.toMatch(/CREATE POLICY[\s\S]*?FOR INSERT/);
    });

    it('drops policies before re-creating them (idempotent re-run)', () => {
      expect(sql).toMatch(/DROP POLICY IF EXISTS doctor_dashboard_events_select_self/);
      expect(sql).toMatch(/DROP POLICY IF EXISTS doctor_dashboard_events_update_self/);
    });
  });

  describe('comments', () => {
    it('comments the table with the plan + task reference', () => {
      expect(sql).toMatch(/COMMENT ON TABLE doctor_dashboard_events IS/);
      expect(sql).toMatch(/Plan 07 Task 30/);
    });
  });
});
