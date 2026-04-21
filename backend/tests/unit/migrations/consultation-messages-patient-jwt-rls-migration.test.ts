/**
 * Content-sanity test for migration 052
 * (consultation_messages_patient_jwt_rls).
 *
 * Plan:  docs/Development/Daily-plans/April 2026/19-04-2026/Plans/plan-04-text-consultation-supabase.md
 * Task:  docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-18-text-session-supabase-adapter.md
 *
 * Why a content-sanity test, not a live-DB integration test?
 *
 *   See the long-form rationale on
 *   tests/unit/migrations/consultation-messages-migration.test.ts. The repo
 *   does not yet have a Supabase test container with `auth.jwt()` shimmed
 *   in, so we instead pin the load-bearing clauses of the migration so a
 *   future edit that accidentally weakens the live-only guard, drops the
 *   doctor-side `sender_id = auth.uid()` spoof check, or removes the
 *   patient JWT custom-claim doors will fail in review.
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/052_consultation_messages_patient_jwt_rls.sql',
);

describe('052_consultation_messages_patient_jwt_rls.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  describe('SELECT policy on consultation_messages', () => {
    it('drops the prior policy before recreating it (re-run safety)', () => {
      expect(sql).toMatch(
        /DROP POLICY IF EXISTS consultation_messages_select_participants\s+ON consultation_messages/,
      );
    });

    it('recreates the SELECT policy', () => {
      expect(sql).toMatch(
        /CREATE POLICY consultation_messages_select_participants\s+ON consultation_messages\s+FOR SELECT/,
      );
    });

    it('preserves the doctor branch keyed on auth.uid() = doctor_id', () => {
      expect(sql).toMatch(
        /SELECT id FROM consultation_sessions[\s\S]+?WHERE doctor_id = auth\.uid\(\)/,
      );
    });

    it('adds a patient branch using auth.jwt() custom claims', () => {
      // Both claims must be present together — `consult_role = 'patient'`
      // alone, or `session_id` alone, must not pass.
      expect(sql).toMatch(
        /auth\.jwt\(\)\s*->>\s*'consult_role'\s*=\s*'patient'\s+AND\s+auth\.jwt\(\)\s*->>\s*'session_id'\s*=\s*consultation_messages\.session_id::text/,
      );
    });
  });

  describe('INSERT policy on consultation_messages', () => {
    it('drops the prior policy before recreating it (re-run safety)', () => {
      expect(sql).toMatch(
        /DROP POLICY IF EXISTS consultation_messages_insert_live_participants\s+ON consultation_messages/,
      );
    });

    it('recreates the INSERT policy', () => {
      expect(sql).toMatch(
        /CREATE POLICY consultation_messages_insert_live_participants\s+ON consultation_messages\s+FOR INSERT/,
      );
    });

    it('keeps doctor-side sender_id = auth.uid() spoof guard', () => {
      // Doctor branch must enforce sender_id = auth.uid(); otherwise any
      // doctor on the session could impersonate another participant.
      expect(sql).toMatch(/sender_id = auth\.uid\(\)/);
    });

    it('keeps doctor-side status = live live-only guard (Decision 5)', () => {
      // Decision 5 LOCKED — text consults are live-only. The doctor branch
      // INSERT must reject messages when the session isn't live.
      const insertSection =
        sql.split(/CREATE POLICY consultation_messages_insert_live_participants/)[1] ?? '';
      // Doctor branch is everything between WITH CHECK ( and the first OR (.
      const doctorBranch = insertSection.split(/\n\s*OR \(/)[0];
      expect(doctorBranch).toMatch(/AND status = 'live'/);
    });

    it('adds a patient branch using auth.jwt() custom claims', () => {
      expect(sql).toMatch(
        /auth\.jwt\(\)\s*->>\s*'consult_role'\s*=\s*'patient'\s+AND\s+auth\.jwt\(\)\s*->>\s*'session_id'\s*=\s*consultation_messages\.session_id::text/,
      );
    });

    it('keeps patient-side status = live live-only guard (Decision 5)', () => {
      // The patient branch must ALSO enforce status='live'. Otherwise a
      // patient with a still-valid post-end JWT (we keep them valid for a
      // configurable window for read-after-end UX) could send messages
      // after the session ended — violating Decision 5.
      const insertSection =
        sql.split(/CREATE POLICY consultation_messages_insert_live_participants/)[1] ?? '';
      // Patient branch is everything from the first "\n  OR (" onwards
      // within the INSERT policy body.
      const patientBranch = insertSection.split(/\n\s*OR \(/)[1] ?? '';
      expect(patientBranch).toMatch(/AND status = 'live'/);
    });

    it('does NOT require sender_id = auth.uid() on the patient branch', () => {
      // Synthetic patient JWTs use a `sub` like `patient:{appointmentId}`
      // (not a UUID), so `sender_id = auth.uid()` would always fail. The
      // patient branch INSERT must rely solely on the JWT custom claims +
      // status guard.
      const insertSection =
        sql.split(/CREATE POLICY consultation_messages_insert_live_participants/)[1] ?? '';
      const patientBranch = insertSection.split(/\n\s*OR \(/)[1] ?? '';
      expect(patientBranch).not.toMatch(/sender_id\s*=\s*auth\.uid\(\)/);
    });

    it('does NOT declare any UPDATE or DELETE policies (messages stay immutable)', () => {
      // 052 must not weaken 051's immutability stance. Messages are
      // append-only from the client; doctor edits/deletes happen via the
      // service-role admin client only.
      expect(sql).not.toMatch(/CREATE POLICY[^;]*\sFOR UPDATE\s/);
      expect(sql).not.toMatch(/CREATE POLICY[^;]*\sFOR DELETE\s/);
    });
  });

  describe('Storage RLS on storage.objects (consultation-attachments)', () => {
    it('drops + recreates the SELECT policy (re-run safety)', () => {
      expect(sql).toMatch(
        /DROP POLICY IF EXISTS consultation_attachments_select_participants\s+ON storage\.objects/,
      );
      expect(sql).toMatch(
        /CREATE POLICY consultation_attachments_select_participants\s+ON storage\.objects\s+FOR SELECT/,
      );
    });

    it('drops + recreates the INSERT policy (re-run safety)', () => {
      expect(sql).toMatch(
        /DROP POLICY IF EXISTS consultation_attachments_insert_participants\s+ON storage\.objects/,
      );
      expect(sql).toMatch(
        /CREATE POLICY consultation_attachments_insert_participants\s+ON storage\.objects\s+FOR INSERT/,
      );
    });

    it('scopes both storage policies to the consultation-attachments bucket', () => {
      // bucket_id = 'consultation-attachments' must appear at least twice
      // (once per policy). Without it the policies could leak access into
      // adjacent buckets.
      const matches = sql.match(/bucket_id = 'consultation-attachments'/g) ?? [];
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });

    it('keys storage RLS on the first folder segment of the path', () => {
      // Path convention is consultation-attachments/{session_id}/{uuid}.{ext}.
      // 052 must keep using storage.foldername(name)[1] to extract the
      // session id. Plan 06 + 07 will follow the same convention.
      expect(sql).toMatch(/\(storage\.foldername\(name\)\)\[1\]/);
    });

    it('adds a patient branch on storage SELECT keyed on JWT claims', () => {
      const selectSection = sql
        .split(/CREATE POLICY consultation_attachments_select_participants/)[1]
        ?.split(/CREATE POLICY consultation_attachments_insert_participants/)[0] ?? '';
      expect(selectSection).toMatch(
        /auth\.jwt\(\)\s*->>\s*'consult_role'\s*=\s*'patient'/,
      );
      expect(selectSection).toMatch(
        /auth\.jwt\(\)\s*->>\s*'session_id'\s*=\s*\(storage\.foldername\(name\)\)\[1\]/,
      );
    });

    it('adds a patient branch on storage INSERT with status=live guard', () => {
      const insertSection = sql.split(
        /CREATE POLICY consultation_attachments_insert_participants/,
      )[1] ?? '';
      expect(insertSection).toMatch(
        /auth\.jwt\(\)\s*->>\s*'consult_role'\s*=\s*'patient'/,
      );
      expect(insertSection).toMatch(/AND status = 'live'/);
    });
  });

  describe('header documentation', () => {
    it('documents the rollback steps in a trailing comment block', () => {
      // The repo has no down-migration runner; reverse steps live in
      // comments. Pin that they are present so a future contributor
      // doesn't accidentally delete the documentation.
      expect(sql).toMatch(/ROLLBACK/i);
      // The rollback block lives inside `--` comment lines, so the line
      // continuation between policy name and ON has `--` interspersed.
      expect(sql).toMatch(
        /DROP POLICY consultation_messages_select_participants[\s\S]+?ON consultation_messages/i,
      );
      expect(sql).toMatch(
        /DROP POLICY consultation_messages_insert_live_participants[\s\S]+?ON consultation_messages/i,
      );
    });

    it('references the doctrine that justifies option (b) — custom-claim RLS', () => {
      // Future maintainers should be able to find the option (a) vs
      // option (b) trade-off summary right at the top of the file.
      expect(sql).toMatch(/Custom-claim RLS/i);
      expect(sql).toMatch(/SUPABASE_JWT_SECRET/);
    });
  });
});
