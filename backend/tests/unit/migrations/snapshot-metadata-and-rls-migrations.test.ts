/**
 * Content-sanity tests for migrations 083 + 084 (Sub-batch C · task-video-C3).
 *
 * Plan:  docs/Work/Daily-plans/April 2026/28-04-2026/Plans/plan-video-consult-selected-features.md
 * Task:  docs/Work/Daily-plans/April 2026/28-04-2026/Tasks/task-video-C3-snapshot-capture.md
 *
 * The repo has no live-Supabase test harness for jest (see migration 051 +
 * migration 062's tests for the same doctrine), so we pin the load-bearing
 * SQL clauses to fail loudly in code review if a future edit silently
 * drops the visibility predicate, the metadata column add, or the
 * idempotency guards.
 *
 * Behavioural verification of the visibility gate happens at manual smoke
 * time (task file Acceptance §) — patient signs in, takes a snapshot, sees
 * own row; doctor takes a snapshot of patient, patient does NOT see the
 * row but DOES see the system banner.
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_083_PATH = resolve(
  __dirname,
  '../../../migrations/083_consultation_messages_metadata_column.sql',
);
const MIGRATION_084_PATH = resolve(
  __dirname,
  '../../../migrations/084_consultation_messages_snapshot_visibility_rls.sql',
);

const sql083 = readFileSync(MIGRATION_083_PATH, 'utf8');
const sql084 = readFileSync(MIGRATION_084_PATH, 'utf8');

describe('083_consultation_messages_metadata_column.sql — additive metadata column', () => {
  it('adds the metadata column via ADD COLUMN IF NOT EXISTS (idempotent rollout)', () => {
    expect(sql083).toMatch(
      /ALTER TABLE consultation_messages\s+ADD COLUMN IF NOT EXISTS metadata jsonb/i,
    );
  });

  it('does NOT touch the row-shape CHECK from migration 063 (additive only)', () => {
    expect(sql083).not.toMatch(/consultation_messages_kind_shape_check/);
    expect(sql083).not.toMatch(/ADD CONSTRAINT/);
    expect(sql083).not.toMatch(/DROP CONSTRAINT/);
  });

  it('does NOT include any RLS work (that lives in migration 084)', () => {
    expect(sql083).not.toMatch(/CREATE POLICY/);
    expect(sql083).not.toMatch(/DROP POLICY/);
  });
});

describe('084_consultation_messages_snapshot_visibility_rls.sql — patient visibility gate', () => {
  it('DROPs and re-CREATEs the canonical SELECT policy (preserving the policy name)', () => {
    expect(sql084).toMatch(
      /DROP POLICY IF EXISTS consultation_messages_select_participants\s+ON consultation_messages/i,
    );
    expect(sql084).toMatch(
      /CREATE POLICY consultation_messages_select_participants\s+ON consultation_messages\s+FOR SELECT/i,
    );
  });

  it('keeps the migration-078 CASE-on-consult_role structure (no regression to OR-with-cast bug)', () => {
    expect(sql084).toMatch(/CASE auth\.jwt\(\) ->> 'consult_role'/);
    expect(sql084).toMatch(/WHEN 'patient' THEN/);
    expect(sql084).toMatch(/ELSE/);
  });

  it('patient branch keys session-membership on the JWT session_id claim (NOT auth.uid())', () => {
    // Both halves of the patient predicate must be present:
    //   - session_id claim equality (membership)
    //   - the new snapshot-visibility AND-NOT clause
    expect(sql084).toMatch(
      /auth\.jwt\(\) ->> 'session_id' = consultation_messages\.session_id::text/,
    );
  });

  it('patient branch hides ONLY rows where metadata marks a doctor-of-patient snapshot', () => {
    // The full predicate must AND together all four clauses; if any is
    // dropped, the gate either over-hides (text rows) or under-hides
    // (doctor-of-self snapshots) — both regressions.
    expect(sql084).toMatch(/AND NOT \(/);
    expect(sql084).toMatch(/metadata IS NOT NULL/);
    expect(sql084).toMatch(/metadata ->> 'snapshot'\s+= 'true'/);
    expect(sql084).toMatch(/metadata ->> 'capturer_role' = 'doctor'/);
    expect(sql084).toMatch(/metadata ->> 'target'\s+= 'remote'/);
  });

  it('doctor branch is unchanged — sees every row in their sessions', () => {
    // The doctor branch must still EXIST against consultation_sessions on
    // doctor_id = auth.uid(); no metadata predicate.
    expect(sql084).toMatch(
      /EXISTS \(\s*SELECT 1\s+FROM consultation_sessions\s+WHERE id = consultation_messages\.session_id\s+AND doctor_id = auth\.uid\(\)\s*\)/i,
    );
    // The visibility AND-NOT must NOT also be in the doctor branch — the
    // ELSE block contains the EXISTS clause and nothing else.
    //
    // Comments inside the ELSE block legitimately mention "snapshot" /
    // "capturer_role" while explaining the policy rationale; we strip
    // SQL line comments (`-- ...`) before the predicate-only assertion
    // so the doctrine doesn't trip on prose.
    const lines = sql084.split(/\r?\n/);
    const elseIdx = lines.findIndex((l) => /^\s*ELSE\s*$/i.test(l));
    expect(elseIdx).toBeGreaterThan(0);
    const doctorBranchCode = lines
      .slice(elseIdx, elseIdx + 12)
      .map((l) => l.replace(/--.*$/, ''))
      .join('\n');
    expect(doctorBranchCode).not.toMatch(/metadata\s*->>/);
    expect(doctorBranchCode).not.toMatch(/capturer_role/);
    expect(doctorBranchCode).not.toMatch(/'snapshot'/);
  });

  it('does NOT touch INSERT / UPDATE / DELETE policies (decision §14 is read-only gating)', () => {
    expect(sql084).not.toMatch(/CREATE POLICY [^\n]*FOR INSERT/);
    expect(sql084).not.toMatch(/CREATE POLICY [^\n]*FOR UPDATE/);
    expect(sql084).not.toMatch(/CREATE POLICY [^\n]*FOR DELETE/);
  });

  it('does NOT touch the storage-bucket RLS (snapshots reuse the chat-attachment bucket policy from 078)', () => {
    expect(sql084).not.toMatch(/storage\.objects/);
    expect(sql084).not.toMatch(/consultation_attachments_select_participants/);
  });
});
