/**
 * Content-sanity test for migration 068 (consultation-transcripts Storage
 * bucket).
 *
 * Plan: docs/Development/Daily-plans/April 2026/19-04-2026/Plans/plan-07-recording-replay-and-history.md
 * Task: docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-32-transcript-pdf-export.md
 *
 * Pins the load-bearing bits of the migration so an accidental edit that
 * drops:
 *   - the `ON CONFLICT (id) DO NOTHING` (re-runnability),
 *   - the private-by-default `false` flag (public-bucket leak),
 *   - the participant-scoped SELECT policy (cross-session leak),
 *   - absence of an INSERT/UPDATE/DELETE policy (client-side write),
 * will fail in review.
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/068_consultation_transcripts_bucket.sql',
);

describe('068_consultation_transcripts_bucket.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  it('provisions the consultation-transcripts bucket (private)', () => {
    expect(sql).toMatch(
      /INSERT INTO storage\.buckets \(id, name, public\)\s+VALUES\s*\(\s*'consultation-transcripts',\s*'consultation-transcripts',\s*false\s*\)/,
    );
  });

  it('uses ON CONFLICT (id) DO NOTHING for idempotent re-runs', () => {
    expect(sql).toMatch(/ON CONFLICT \(id\) DO NOTHING/);
  });

  it('installs participant-scoped SELECT policy on storage.objects', () => {
    expect(sql).toMatch(/CREATE POLICY consultation_transcripts_select_participants/);
    expect(sql).toMatch(/bucket_id = 'consultation-transcripts'/);
    expect(sql).toMatch(/storage\.foldername\(name\)\)\[1\]/);
    expect(sql).toMatch(/FROM consultation_sessions/);
    expect(sql).toMatch(/doctor_id = auth\.uid\(\)/);
    expect(sql).toMatch(/patient_id = auth\.uid\(\)/);
  });

  it('DROPs the SELECT policy before CREATE so re-runs are safe', () => {
    expect(sql).toMatch(
      /DROP POLICY IF EXISTS consultation_transcripts_select_participants[\s\S]*?CREATE POLICY consultation_transcripts_select_participants/,
    );
  });

  it('does NOT create an INSERT / UPDATE / DELETE policy (service-role only)', () => {
    // The whole point of this bucket is that only the service-role backend
    // writes to it. An additive CREATE POLICY ... FOR INSERT / UPDATE / DELETE
    // would open the door for client-side tampering with cached PDFs.
    expect(sql).not.toMatch(/CREATE POLICY [^\n]*FOR\s+INSERT/i);
    expect(sql).not.toMatch(/CREATE POLICY [^\n]*FOR\s+UPDATE/i);
    expect(sql).not.toMatch(/CREATE POLICY [^\n]*FOR\s+DELETE/i);
  });

  it('documents the reverse migration block', () => {
    // Pinned so a future edit that removes the block gets caught in review.
    expect(sql).toMatch(/Reverse migration/i);
    expect(sql).toMatch(
      /DROP POLICY IF EXISTS consultation_transcripts_select_participants/,
    );
  });

  it('cites Plan 07 · Task 32 in the header', () => {
    expect(sql).toMatch(/Plan 07 · Task 32/);
  });
});
