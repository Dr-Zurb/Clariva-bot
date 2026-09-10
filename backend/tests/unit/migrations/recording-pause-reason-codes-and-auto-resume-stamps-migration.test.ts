/**
 * Content-sanity tests for rec-13 — pause reason codes + auto-resume
 * stamps (migration 196).
 *
 * Pins the load-bearing bits so an accidental edit that drops a preset,
 * validates the historical-exempt CHECK, widens `action_by`, or drops
 * the 064 reason CHECK gets caught in review.
 *
 * Pure regex against file contents — no live Postgres.
 *
 * @see backend/migrations/196_recording_pause_reason_codes_and_auto_resume_stamps.sql
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/196_recording_pause_reason_codes_and_auto_resume_stamps.sql'
);

const PRESET_CODES = [
  'patient_request',
  'sensitive_disclosure',
  'third_party_present',
  'administrative',
  'technical',
] as const;

describe('196_recording_pause_reason_codes_and_auto_resume_stamps.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  const nonCommentLines = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

  it('cites rec-13 in the header', () => {
    expect(sql).toMatch(/rec-13/);
  });

  it('creates recording_pause_reason_code with the pg_type DO-block guard', () => {
    expect(sql).toMatch(
      /IF NOT EXISTS \(\s*SELECT 1 FROM pg_type WHERE typname = 'recording_pause_reason_code'\s*\)/
    );
  });

  it('seeds exactly the five locked preset values and nothing else', () => {
    const enumBlock = sql.match(/CREATE TYPE recording_pause_reason_code AS ENUM\s*\(([\s\S]*?)\)/);
    expect(enumBlock).not.toBeNull();
    const values = [...enumBlock![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(values).toEqual([...PRESET_CODES]);
  });

  it('adds a nullable pause_reason_code column typed to that ENUM', () => {
    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS pause_reason_code recording_pause_reason_code\s*;/
    );
  });

  it('requires the code on new recording_paused rows via a NOT VALID CHECK', () => {
    expect(sql).toMatch(/consultation_recording_audit_pause_reason_code_required/);
    expect(sql).toMatch(/action <> 'recording_paused'\s+OR pause_reason_code IS NOT NULL/);
    expect(sql).toMatch(/NOT VALID/);
  });

  it('does not VALIDATE the historical-exempt pause_reason_code CHECK', () => {
    expect(nonCommentLines).not.toMatch(
      /VALIDATE CONSTRAINT consultation_recording_audit_pause_reason_code_required/i
    );
  });

  it('preserves the 064 5–200 reason CHECK (does not drop it)', () => {
    expect(nonCommentLines).not.toMatch(
      /DROP CONSTRAINT\s+consultation_recording_audit_reason_check/i
    );
    expect(sql).toMatch(/consultation_recording_audit_reason_check/);
  });

  it('adds nullable auto-resume deadline and extension-count columns', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS auto_resume_at TIMESTAMPTZ/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS auto_resume_extensions_used SMALLINT/);
  });

  it('caps auto_resume_extensions_used at the one extension REC-D16 allows', () => {
    expect(sql).toMatch(/auto_resume_extensions_used IN \(0, 1\)/);
  });

  it('adds a partial index for open pauses whose auto-resume deadline has passed', () => {
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_recording_audit_auto_resume_due/);
    expect(sql).toMatch(/pause_closed_as IS NULL/);
    expect(sql).toMatch(/auto_resume_at IS NOT NULL/);
    expect(sql).toMatch(/action = 'recording_paused'/);
  });

  it('closes dangling pauses with a column discriminator, not a new action ENUM', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS pause_closed_as TEXT/);
    expect(sql).toMatch(/'session_ended_while_paused'/);
    expect(sql).toMatch(/'manual_resume'/);
    expect(sql).toMatch(/'auto_resume'/);
    expect(nonCommentLines).not.toMatch(/ALTER\s+TYPE\s+recording_audit_action/i);
  });

  it('does not widen action_by or add RLS', () => {
    expect(nonCommentLines).not.toMatch(/ALTER COLUMN action_by/i);
    expect(nonCommentLines).not.toMatch(
      /ALTER TABLE consultation_recording_audit[\s\S]{0,200}action_by_role/i
    );
    expect(nonCommentLines).not.toMatch(/CREATE POLICY/i);
    expect(nonCommentLines).not.toMatch(/ENABLE ROW LEVEL SECURITY/i);
  });

  it('redacts legacy recording_paused free text with a sentinel and a metadata stamp', () => {
    expect(sql).toMatch(/reason_not_recorded_in_preset_form/);
    expect(sql).toMatch(/reason_redacted/);
    expect(sql).toMatch(/by_migration/);
    expect(sql).toMatch(/metadata->'reason_redacted'\) IS NULL/);
  });

  it('documents the reverse migration without DROP VALUE', () => {
    expect(sql).toMatch(/Reverse/i);
    expect(nonCommentLines).not.toMatch(/DROP\s+VALUE/i);
  });
});
