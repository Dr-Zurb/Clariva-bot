/**
 * Content-sanity tests for Plan 08 · Task 45 — video-recording-audit
 * extensions.
 *
 * Pins the load-bearing bits of migrations 069 (access_type ENUM +
 * column) and 070 (video_escalation_audit + video_otp_window) so an
 * accidental edit that drops a CHECK / RLS / index / back-fill step
 * gets caught in review.
 *
 * This mirrors the content-sanity pattern from
 * `consultation-messages-migration.test.ts` and
 * `doctor-dashboard-events-migration.test.ts` — pure file-content
 * inspection via regex, no live Postgres required.
 *
 * @see backend/migrations/069_recording_access_audit_access_type.sql
 * @see backend/migrations/070_video_escalation_audit_and_otp_window.sql
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-45-video-recording-audit-extensions-migration.md
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ACCESS_TYPE_MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/069_recording_access_audit_access_type.sql',
);
const TABLES_MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/070_video_escalation_audit_and_otp_window.sql',
);

// ============================================================================
// Part 1 — 069_recording_access_audit_access_type.sql
// ============================================================================

describe('069_recording_access_audit_access_type.sql', () => {
  const sql = readFileSync(ACCESS_TYPE_MIGRATION_PATH, 'utf8');

  it('cites Plan 08 · Task 45 in the header', () => {
    expect(sql).toMatch(/Plan 08 · Task 45/);
  });

  it('creates the recording_access_type ENUM with the two values', () => {
    // Idempotent DO-block pattern.
    expect(sql).toMatch(
      /IF NOT EXISTS \(\s*SELECT 1 FROM pg_type WHERE typname = 'recording_access_type'\s*\)/,
    );
    expect(sql).toMatch(
      /CREATE TYPE recording_access_type AS ENUM\s*\(\s*'audio_only',\s*'full_video'\s*\)/,
    );
  });

  it('adds the access_type column nullable first (Step 1)', () => {
    expect(sql).toMatch(
      /ALTER TABLE recording_access_audit\s+ADD COLUMN IF NOT EXISTS access_type recording_access_type\s*;/,
    );
  });

  it('back-fills existing rows to audio_only (Step 2)', () => {
    expect(sql).toMatch(
      /UPDATE recording_access_audit\s+SET\s+access_type = 'audio_only'\s+WHERE\s+access_type IS NULL/,
    );
  });

  it('locks the column down NOT NULL + DEFAULT audio_only (Step 3)', () => {
    expect(sql).toMatch(/ALTER COLUMN access_type SET NOT NULL/);
    expect(sql).toMatch(/ALTER COLUMN access_type SET DEFAULT 'audio_only'/);
  });

  it('applies the three steps in the correct order (nullable → backfill → lock)', () => {
    const addIdx = sql.search(/ADD COLUMN IF NOT EXISTS access_type/);
    const backfillIdx = sql.search(
      /UPDATE recording_access_audit\s+SET\s+access_type = 'audio_only'/,
    );
    const notNullIdx = sql.search(/ALTER COLUMN access_type SET NOT NULL/);
    expect(addIdx).toBeGreaterThan(-1);
    expect(backfillIdx).toBeGreaterThan(addIdx);
    expect(notNullIdx).toBeGreaterThan(backfillIdx);
  });

  it('documents the reverse migration block', () => {
    expect(sql).toMatch(/Reverse migration/i);
    expect(sql).toMatch(/DROP COLUMN IF EXISTS access_type/);
    expect(sql).toMatch(/DROP TYPE IF EXISTS recording_access_type/);
  });

  it('does NOT add an index on access_type alone (low-cardinality enum)', () => {
    // Pinned to catch an accidental micro-optimization that would bloat
    // the write path. A composite `(session_id, access_type)` index may
    // ship later under Task 44 if telemetry demands it.
    expect(sql).not.toMatch(/CREATE INDEX[^\n]*ON recording_access_audit\(access_type\)/);
  });
});

// ============================================================================
// Part 2 — 070_video_escalation_audit_and_otp_window.sql
// ============================================================================

describe('070_video_escalation_audit_and_otp_window.sql', () => {
  const sql = readFileSync(TABLES_MIGRATION_PATH, 'utf8');

  it('cites Plan 08 · Task 45 in the header', () => {
    expect(sql).toMatch(/Plan 08 · Task 45/);
  });

  // --------------------------------------------------------------------------
  // video_escalation_audit
  // --------------------------------------------------------------------------

  describe('video_escalation_audit', () => {
    it('creates the table (idempotent)', () => {
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS video_escalation_audit/);
    });

    it('keys by id UUID DEFAULT gen_random_uuid()', () => {
      expect(sql).toMatch(/id\s+UUID PRIMARY KEY DEFAULT gen_random_uuid\(\)/);
    });

    it('FK-joins session_id to consultation_sessions with CASCADE', () => {
      expect(sql).toMatch(
        /session_id\s+UUID NOT NULL REFERENCES consultation_sessions\(id\) ON DELETE CASCADE/,
      );
    });

    it('carries doctor_id as plain UUID (INTENTIONALLY no FK)', () => {
      // The regex explicitly rejects a `REFERENCES doctors` on the same
      // physical line as the doctor_id declaration.
      expect(sql).toMatch(/doctor_id\s+UUID NOT NULL,/);
      expect(sql).not.toMatch(/doctor_id\s+UUID[^\n]*REFERENCES\s+doctors/);
    });

    it('defaults requested_at to now()', () => {
      expect(sql).toMatch(/requested_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/);
    });

    it('pins reason CHECK at 5..200 chars via char_length', () => {
      expect(sql).toMatch(
        /reason\s+TEXT NOT NULL CHECK \(char_length\(reason\) BETWEEN 5 AND 200\)/,
      );
    });

    it('pins preset_reason_code CHECK to the four modal values', () => {
      expect(sql).toMatch(
        /preset_reason_code\s+TEXT CHECK \(preset_reason_code IN \([^\)]*'visible_symptom'[^\)]*'document_procedure'[^\)]*'patient_request'[^\)]*'other'[^\)]*\)\)/s,
      );
    });

    it('pins patient_response CHECK to the three legal values', () => {
      expect(sql).toMatch(
        /patient_response\s+TEXT CHECK \(patient_response IN \([^\)]*'allow'[^\)]*'decline'[^\)]*'timeout'[^\)]*\)\)/s,
      );
    });

    it('pins the row-shape CHECK on (patient_response, responded_at) co-presence', () => {
      expect(sql).toMatch(/CONSTRAINT video_escalation_audit_response_shape CHECK \(/);
      expect(sql).toMatch(
        /\(patient_response IS NULL AND responded_at IS NULL\)\s+OR\s+\(patient_response IS NOT NULL AND responded_at IS NOT NULL\)/,
      );
    });

    it('adds the (session_id, requested_at DESC) rate-limit index', () => {
      expect(sql).toMatch(
        /CREATE INDEX IF NOT EXISTS idx_video_escalation_audit_session_time\s+ON video_escalation_audit\(session_id,\s*requested_at DESC\)/,
      );
    });

    it('enables RLS', () => {
      expect(sql).toMatch(
        /ALTER TABLE video_escalation_audit ENABLE ROW LEVEL SECURITY/,
      );
    });

    it('installs the participant-scoped SELECT policy', () => {
      expect(sql).toMatch(
        /DROP POLICY IF EXISTS video_escalation_audit_select_participants\s+ON video_escalation_audit/,
      );
      expect(sql).toMatch(
        /CREATE POLICY video_escalation_audit_select_participants\s+ON video_escalation_audit\s+FOR SELECT/,
      );
      expect(sql).toMatch(/doctor_id = auth\.uid\(\)/);
      expect(sql).toMatch(/patient_id IS NOT NULL AND patient_id = auth\.uid\(\)/);
    });

    it('does NOT create client-driven INSERT / UPDATE / DELETE policies', () => {
      // Service-role-only write doctrine — neither new table should
      // expose a FOR INSERT / UPDATE / DELETE policy. Pinned as plain
      // substring rejection (no `FOR INSERT` text appears anywhere in
      // the migration, period).
      expect(sql).not.toMatch(/\bFOR\s+INSERT\b/i);
      expect(sql).not.toMatch(/\bFOR\s+UPDATE\b/i);
      expect(sql).not.toMatch(/\bFOR\s+DELETE\b/i);
    });
  });

  // --------------------------------------------------------------------------
  // video_otp_window
  // --------------------------------------------------------------------------

  describe('video_otp_window', () => {
    it('creates the table (idempotent)', () => {
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS video_otp_window/);
    });

    it('keys by patient_id FK to patients(id) with ON DELETE CASCADE', () => {
      expect(sql).toMatch(
        /patient_id\s+UUID PRIMARY KEY REFERENCES patients\(id\) ON DELETE CASCADE/,
      );
    });

    it('requires last_otp_verified_at NOT NULL', () => {
      expect(sql).toMatch(/last_otp_verified_at\s+TIMESTAMPTZ NOT NULL/);
    });

    it('pins last_otp_verified_via CHECK to the single v1 value sms', () => {
      expect(sql).toMatch(
        /last_otp_verified_via\s+TEXT NOT NULL CHECK \(last_otp_verified_via IN \('sms'\)\)/,
      );
    });

    it('adds the verified_at index for the future eviction worker', () => {
      expect(sql).toMatch(
        /CREATE INDEX IF NOT EXISTS idx_video_otp_window_verified_at\s+ON video_otp_window\(last_otp_verified_at\)/,
      );
    });

    it('enables RLS', () => {
      expect(sql).toMatch(/ALTER TABLE video_otp_window ENABLE ROW LEVEL SECURITY/);
    });

    it('installs the self-scoped SELECT policy', () => {
      expect(sql).toMatch(
        /DROP POLICY IF EXISTS video_otp_window_select_self\s+ON video_otp_window/,
      );
      expect(sql).toMatch(
        /CREATE POLICY video_otp_window_select_self\s+ON video_otp_window\s+FOR SELECT\s+USING \(patient_id = auth\.uid\(\)\)/,
      );
    });
  });

  it('documents the reverse migration block', () => {
    expect(sql).toMatch(/Reverse migration/i);
    expect(sql).toMatch(/DROP TABLE IF EXISTS video_otp_window/);
    expect(sql).toMatch(/DROP TABLE IF EXISTS video_escalation_audit/);
  });
});
