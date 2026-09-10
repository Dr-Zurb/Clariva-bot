/**
 * Content-sanity tests for rec-21 — video grant bounds + pause state
 * (migration 197).
 *
 * Pins the load-bearing bits so an accidental edit that drops a
 * column, recreates the untouched 073 CHECKs, adds RLS, or widens
 * `reason` gets caught in review.
 *
 * Pure regex against file contents — no live Postgres.
 *
 * @see backend/migrations/197_video_escalation_grant_bounds_and_pause.sql
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/197_video_escalation_grant_bounds_and_pause.sql',
);

describe('197_video_escalation_grant_bounds_and_pause.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  const nonCommentLines = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

  it('cites rec-21 and the live-head derivation in the header', () => {
    expect(sql).toMatch(/rec-21/);
    expect(sql).toMatch(/196_recording_pause_reason_codes_and_auto_resume_stamps/);
    expect(sql).toMatch(/197/);
  });

  it('adds the three nullable grant/pause stamps with no backfill', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS grant_expires_at TIMESTAMPTZ/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS grant_extended_at TIMESTAMPTZ/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS video_paused_at TIMESTAMPTZ/);
    expect(nonCommentLines).not.toMatch(/UPDATE\s+video_escalation_audit/i);
  });

  it('adds initiated_by as NOT NULL DEFAULT doctor with a TEXT CHECK', () => {
    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS initiated_by TEXT NOT NULL DEFAULT 'doctor'/,
    );
    expect(sql).toMatch(/initiated_by IN \('doctor', 'patient'\)/);
    expect(nonCommentLines).not.toMatch(/CREATE TYPE/i);
  });

  it('does not add a pause counter column', () => {
    expect(nonCommentLines).not.toMatch(/pause_count/i);
    expect(nonCommentLines).not.toMatch(/pause_counter/i);
  });

  it('widens revoke_reason with grant_expired and keeps the three 073 values', () => {
    expect(sql).toMatch(
      /DROP CONSTRAINT IF EXISTS video_escalation_audit_revoke_reason_check/,
    );
    expect(sql).toMatch(/'patient_revoked'/);
    expect(sql).toMatch(/'doctor_revert'/);
    expect(sql).toMatch(/'system_error_fallback'/);
    expect(sql).toMatch(/'grant_expired'/);
  });

  it('does not drop or recreate the untouched 073 shape / requires-allow CHECKs', () => {
    expect(nonCommentLines).not.toMatch(
      /DROP CONSTRAINT IF EXISTS video_escalation_audit_revoke_shape/,
    );
    expect(nonCommentLines).not.toMatch(
      /DROP CONSTRAINT IF EXISTS video_escalation_audit_revoke_requires_allow/,
    );
    expect(nonCommentLines).not.toMatch(
      /ADD CONSTRAINT video_escalation_audit_revoke_shape/,
    );
    expect(nonCommentLines).not.toMatch(
      /ADD CONSTRAINT video_escalation_audit_revoke_requires_allow/,
    );
  });

  it('does not touch the reason column CHECK (REC4-D9)', () => {
    expect(nonCommentLines).not.toMatch(/char_length\(reason\)/i);
    expect(nonCommentLines).not.toMatch(/ALTER COLUMN reason/i);
  });

  it('does not add, drop or enable RLS', () => {
    expect(nonCommentLines).not.toMatch(/CREATE POLICY/i);
    expect(nonCommentLines).not.toMatch(/DROP POLICY/i);
    expect(nonCommentLines).not.toMatch(/ENABLE ROW LEVEL SECURITY/i);
    expect(nonCommentLines).not.toMatch(/DISABLE ROW LEVEL SECURITY/i);
  });

  it('documents that pause is not revoke', () => {
    expect(sql).toMatch(/Pause is not revoke/);
    expect(sql).toMatch(/never sets revoked_at/i);
  });

  it('documents the reverse without a second migration file', () => {
    expect(sql).toMatch(/Reverse/i);
    expect(sql).toMatch(/DROP COLUMN IF EXISTS grant_expires_at/);
  });
});
