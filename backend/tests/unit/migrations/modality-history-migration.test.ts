/**
 * Content-sanity tests for Plan 09 · Task 46 — modality-history schema
 * + counters migration (Migration 075).
 *
 * Pins the load-bearing bits of the migration so an accidental edit
 * that drops a CHECK / RLS / index / back-fill step gets caught in
 * review. Mirrors the content-sanity pattern from
 * `video-recording-audit-extensions-migration.test.ts` and
 * `consultation-messages-migration.test.ts` — pure file-content
 * inspection via regex, no live Postgres required.
 *
 * The enum-ordering dependency (`modality_history_reason_required`
 * CHECK relies on `consultation_modality` ENUM ordered text < voice <
 * video) is ALSO pinned here by asserting the `from_modality >
 * to_modality` fragment inside the CHECK — if someone rewrites to
 * enumerated pairs, the assertion fails and forces a deliberate
 * review.
 *
 * @see backend/migrations/075_consultation_modality_history.sql
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-46-modality-history-schema-and-counters-migration.md
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/075_consultation_modality_history.sql',
);

const sql = readFileSync(MIGRATION_PATH, 'utf8');

describe('075_consultation_modality_history.sql', () => {
  it('cites Plan 09 · Task 46 in the header', () => {
    expect(sql).toMatch(/Plan 09 · Task 46/);
  });

  // --------------------------------------------------------------------------
  // ENUMs
  // --------------------------------------------------------------------------

  describe('ENUM definitions', () => {
    it('guards modality_billing_action creation idempotently', () => {
      expect(sql).toMatch(
        /IF NOT EXISTS \(\s*SELECT 1 FROM pg_type WHERE typname = 'modality_billing_action'\s*\)/,
      );
    });

    it('creates modality_billing_action with the four values in the documented order', () => {
      expect(sql).toMatch(
        /CREATE TYPE modality_billing_action AS ENUM\s*\(\s*'paid_upgrade',\s*'free_upgrade',\s*'no_refund_downgrade',\s*'auto_refund_downgrade'\s*\)/,
      );
    });

    it('guards modality_initiator creation idempotently', () => {
      expect(sql).toMatch(
        /IF NOT EXISTS \(\s*SELECT 1 FROM pg_type WHERE typname = 'modality_initiator'\s*\)/,
      );
    });

    it('creates modality_initiator with patient, doctor', () => {
      expect(sql).toMatch(
        /CREATE TYPE modality_initiator AS ENUM\s*\(\s*'patient',\s*'doctor'\s*\)/,
      );
    });
  });

  // --------------------------------------------------------------------------
  // consultation_sessions column adds
  // --------------------------------------------------------------------------

  describe('ALTER TABLE consultation_sessions', () => {
    it('adds current_modality as nullable first (Step 1)', () => {
      expect(sql).toMatch(
        /ALTER TABLE consultation_sessions\s+ADD COLUMN IF NOT EXISTS current_modality consultation_modality\s*;/,
      );
    });

    it('adds upgrade_count NOT NULL DEFAULT 0', () => {
      expect(sql).toMatch(
        /ADD COLUMN IF NOT EXISTS upgrade_count\s+INT NOT NULL DEFAULT 0/,
      );
    });

    it('adds downgrade_count NOT NULL DEFAULT 0', () => {
      expect(sql).toMatch(
        /ADD COLUMN IF NOT EXISTS downgrade_count\s+INT NOT NULL DEFAULT 0/,
      );
    });

    it('backfills current_modality from modality for existing rows (Step 2)', () => {
      expect(sql).toMatch(
        /UPDATE consultation_sessions\s+SET\s+current_modality = modality\s+WHERE\s+current_modality IS NULL/,
      );
    });

    it('locks current_modality NOT NULL (Step 3)', () => {
      expect(sql).toMatch(/ALTER COLUMN current_modality SET NOT NULL/);
    });

    it('applies the three steps in the correct order (nullable → backfill → lock)', () => {
      const addIdx = sql.search(/ADD COLUMN IF NOT EXISTS current_modality/);
      const backfillIdx = sql.search(
        /UPDATE consultation_sessions\s+SET\s+current_modality = modality/,
      );
      const notNullIdx = sql.search(/ALTER COLUMN current_modality SET NOT NULL/);
      expect(addIdx).toBeGreaterThan(-1);
      expect(backfillIdx).toBeGreaterThan(addIdx);
      expect(notNullIdx).toBeGreaterThan(backfillIdx);
    });

    it('pins upgrade_count rate-limit CHECK at 0..1', () => {
      expect(sql).toMatch(
        /ADD\s+CONSTRAINT consultation_sessions_upgrade_count_max_check\s+CHECK \(upgrade_count BETWEEN 0 AND 1\)/,
      );
    });

    it('pins downgrade_count rate-limit CHECK at 0..1', () => {
      expect(sql).toMatch(
        /ADD\s+CONSTRAINT consultation_sessions_downgrade_count_max_check\s+CHECK \(downgrade_count BETWEEN 0 AND 1\)/,
      );
    });

    it('uses NOT VALID + VALIDATE pattern to avoid ACCESS EXCLUSIVE on add', () => {
      // Match count — both CHECKs go through the same pattern.
      const notValidMatches = sql.match(/\)\s*NOT VALID\s*;/g) ?? [];
      const validateMatches = sql.match(/VALIDATE CONSTRAINT consultation_sessions_/g) ?? [];
      expect(notValidMatches.length).toBeGreaterThanOrEqual(2);
      expect(validateMatches.length).toBeGreaterThanOrEqual(2);
    });
  });

  // --------------------------------------------------------------------------
  // consultation_modality_history shape
  // --------------------------------------------------------------------------

  describe('CREATE TABLE consultation_modality_history', () => {
    it('creates the table idempotently', () => {
      expect(sql).toMatch(
        /CREATE TABLE IF NOT EXISTS consultation_modality_history/,
      );
    });

    it('keys by id UUID DEFAULT gen_random_uuid()', () => {
      expect(sql).toMatch(/id\s+UUID PRIMARY KEY DEFAULT gen_random_uuid\(\)/);
    });

    it('FK-joins session_id to consultation_sessions with CASCADE', () => {
      expect(sql).toMatch(
        /session_id\s+UUID NOT NULL REFERENCES consultation_sessions\(id\) ON DELETE CASCADE/,
      );
    });

    it('types from_modality + to_modality via consultation_modality ENUM', () => {
      expect(sql).toMatch(/from_modality\s+consultation_modality NOT NULL/);
      expect(sql).toMatch(/to_modality\s+consultation_modality NOT NULL/);
    });

    it('types initiated_by via modality_initiator ENUM', () => {
      expect(sql).toMatch(/initiated_by\s+modality_initiator NOT NULL/);
    });

    it('types billing_action via modality_billing_action ENUM', () => {
      expect(sql).toMatch(/billing_action\s+modality_billing_action NOT NULL/);
    });

    it('pins amount_paise column-level CHECK (NULL OR > 0)', () => {
      expect(sql).toMatch(
        /amount_paise\s+INT CHECK \(amount_paise IS NULL OR amount_paise > 0\)/,
      );
    });

    it('pins reason CHECK at 5..200 chars via char_length', () => {
      expect(sql).toMatch(
        /reason\s+TEXT CHECK \(reason IS NULL OR char_length\(reason\) BETWEEN 5 AND 200\)/,
      );
    });

    it('pins preset_reason_code CHECK to the seven documented values', () => {
      expect(sql).toMatch(
        /preset_reason_code\s+TEXT CHECK \(preset_reason_code IS NULL OR preset_reason_code IN \([^)]*'visible_symptom'[^)]*'need_to_hear_voice'[^)]*'patient_request'[^)]*'network_or_equipment'[^)]*'case_doesnt_need_modality'[^)]*'patient_environment'[^)]*'other'[^)]*\)\)/s,
      );
    });

    it('defaults occurred_at to now()', () => {
      expect(sql).toMatch(/occurred_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/);
    });

    // ------------------------------------------------------------------------
    // CHECK constraints
    // ------------------------------------------------------------------------

    it('pins the direction-invariant CHECK (from_modality != to_modality)', () => {
      expect(sql).toMatch(/CONSTRAINT modality_history_from_to_differ/);
      expect(sql).toMatch(/CHECK \(from_modality <> to_modality\)/);
    });

    it('pins the billing-shape CHECK across the four legal billing actions', () => {
      expect(sql).toMatch(/CONSTRAINT modality_history_billing_shape CHECK/);
      // paid_upgrade branch — all three key fields.
      expect(sql).toMatch(
        /billing_action = 'paid_upgrade'[\s\S]*?amount_paise\s+IS NOT NULL[\s\S]*?razorpay_payment_id IS NOT NULL[\s\S]*?razorpay_refund_id\s+IS NULL/,
      );
      // auto_refund_downgrade branch — amount set, payment id null.
      expect(sql).toMatch(
        /billing_action = 'auto_refund_downgrade'[\s\S]*?amount_paise\s+IS NOT NULL[\s\S]*?razorpay_payment_id IS NULL/,
      );
      // free_upgrade branch — all null.
      expect(sql).toMatch(
        /billing_action = 'free_upgrade'[\s\S]*?amount_paise\s+IS NULL[\s\S]*?razorpay_payment_id IS NULL[\s\S]*?razorpay_refund_id\s+IS NULL/,
      );
      // no_refund_downgrade branch — all null.
      expect(sql).toMatch(
        /billing_action = 'no_refund_downgrade'[\s\S]*?amount_paise\s+IS NULL[\s\S]*?razorpay_payment_id IS NULL[\s\S]*?razorpay_refund_id\s+IS NULL/,
      );
    });

    it('pins the reason-required CHECK using the enum-ordering doctrine', () => {
      expect(sql).toMatch(/CONSTRAINT modality_history_reason_required CHECK/);
      // Doctor branch: reason must be present.
      expect(sql).toMatch(
        /WHEN initiated_by = 'doctor'\s+THEN reason IS NOT NULL/,
      );
      // Patient-downgrade branch: uses `from_modality > to_modality`. This
      // is the load-bearing enum-ordering dependency — pinned here so any
      // refactor to enumerated pairs trips the test and forces review.
      expect(sql).toMatch(
        /WHEN initiated_by = 'patient' AND from_modality > to_modality\s+THEN reason IS NOT NULL/,
      );
      // Patient-upgrade default: reason optional.
      expect(sql).toMatch(/ELSE TRUE/);
    });

    it('documents the enum-ordering dependency in the header comment', () => {
      expect(sql).toMatch(/ENUM-ordering dependency/i);
      expect(sql).toMatch(/text\s*<\s*voice\s*<\s*video/);
      expect(sql).toMatch(/ADD VALUE BEFORE/);
    });
  });

  // --------------------------------------------------------------------------
  // Indexes
  // --------------------------------------------------------------------------

  describe('indexes', () => {
    it('adds the (session_id, occurred_at) timeline index', () => {
      expect(sql).toMatch(
        /CREATE INDEX IF NOT EXISTS idx_modality_history_session_time\s+ON consultation_modality_history\(session_id,\s*occurred_at\)/,
      );
    });

    it('adds the partial refund-pending index keyed by occurred_at', () => {
      expect(sql).toMatch(
        /CREATE INDEX IF NOT EXISTS idx_modality_history_refund_pending\s+ON consultation_modality_history\(occurred_at\)\s+WHERE billing_action = 'auto_refund_downgrade' AND razorpay_refund_id IS NULL/,
      );
    });
  });

  // --------------------------------------------------------------------------
  // RLS
  // --------------------------------------------------------------------------

  describe('Row-Level Security', () => {
    it('enables RLS on the new table', () => {
      expect(sql).toMatch(
        /ALTER TABLE consultation_modality_history ENABLE ROW LEVEL SECURITY/,
      );
    });

    it('installs the participant-scoped SELECT policy', () => {
      expect(sql).toMatch(
        /DROP POLICY IF EXISTS modality_history_select_participants\s+ON consultation_modality_history/,
      );
      expect(sql).toMatch(
        /CREATE POLICY modality_history_select_participants\s+ON consultation_modality_history\s+FOR SELECT/,
      );
      expect(sql).toMatch(/doctor_id = auth\.uid\(\)/);
      expect(sql).toMatch(/patient_id IS NOT NULL AND patient_id = auth\.uid\(\)/);
    });

    it('does NOT create client-driven INSERT / UPDATE / DELETE policies on the history table', () => {
      // Service-role-only write doctrine. None of `FOR INSERT / UPDATE /
      // DELETE` should appear anywhere in the migration.
      expect(sql).not.toMatch(/\bFOR\s+INSERT\b/i);
      expect(sql).not.toMatch(/\bFOR\s+UPDATE\b/i);
      expect(sql).not.toMatch(/\bFOR\s+DELETE\b/i);
    });
  });

  // --------------------------------------------------------------------------
  // Reverse migration
  // --------------------------------------------------------------------------

  describe('reverse migration block', () => {
    it('documents the reverse migration at the file foot', () => {
      expect(sql).toMatch(/Reverse migration/i);
      expect(sql).toMatch(/DROP TABLE IF EXISTS consultation_modality_history/);
      expect(sql).toMatch(
        /DROP CONSTRAINT IF EXISTS consultation_sessions_upgrade_count_max_check/,
      );
      expect(sql).toMatch(
        /DROP CONSTRAINT IF EXISTS consultation_sessions_downgrade_count_max_check/,
      );
      expect(sql).toMatch(/DROP COLUMN IF EXISTS current_modality/);
      expect(sql).toMatch(/DROP COLUMN IF EXISTS upgrade_count/);
      expect(sql).toMatch(/DROP COLUMN IF EXISTS downgrade_count/);
      expect(sql).toMatch(/DROP TYPE IF EXISTS modality_billing_action/);
      expect(sql).toMatch(/DROP TYPE IF EXISTS modality_initiator/);
    });
  });
});
