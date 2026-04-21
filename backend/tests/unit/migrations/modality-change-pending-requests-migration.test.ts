/**
 * Content-sanity tests for Plan 09 · Task 47 — modality-change pending
 * requests migration (Migration 076).
 *
 * Pins the load-bearing schema bits so an accidental edit that drops a
 * CHECK / RLS / index / terminal-response-shape invariant gets caught
 * in review. Mirrors the regex content-inspection pattern from
 * `modality-history-migration.test.ts` (Task 46) — no live Postgres
 * required.
 *
 * @see backend/migrations/076_modality_change_pending_requests.sql
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-47-request-modality-change-state-machine.md
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/076_modality_change_pending_requests.sql',
);

const sql = readFileSync(MIGRATION_PATH, 'utf8');

describe('076_modality_change_pending_requests.sql', () => {
  it('cites Plan 09 · Task 47 in the header', () => {
    expect(sql).toMatch(/Plan 09 · Task 47/);
  });

  it('mentions Decision 11 LOCKED in the header', () => {
    expect(sql).toMatch(/Decision 11 LOCKED|single-entry `requestModalityChange/);
  });

  // --------------------------------------------------------------------------
  // Table structure
  // --------------------------------------------------------------------------

  describe('table structure', () => {
    it('creates modality_change_pending_requests idempotently', () => {
      expect(sql).toMatch(
        /CREATE TABLE IF NOT EXISTS modality_change_pending_requests/,
      );
    });

    it('primary key is id UUID DEFAULT gen_random_uuid()', () => {
      expect(sql).toMatch(/id\s+UUID PRIMARY KEY DEFAULT gen_random_uuid\(\)/);
    });

    it('session_id FKs consultation_sessions with ON DELETE CASCADE', () => {
      expect(sql).toMatch(
        /session_id\s+UUID NOT NULL REFERENCES consultation_sessions\(id\) ON DELETE CASCADE/,
      );
    });

    it('initiated_by uses the modality_initiator ENUM introduced in Migration 075', () => {
      expect(sql).toMatch(/initiated_by\s+modality_initiator NOT NULL/);
    });

    it('requested_modality uses the consultation_modality ENUM', () => {
      expect(sql).toMatch(/requested_modality\s+consultation_modality NOT NULL/);
    });

    it('reason column bounds 5..200 codepoints via char_length', () => {
      expect(sql).toMatch(
        /reason\s+TEXT CHECK \(reason IS NULL OR char_length\(reason\) BETWEEN 5 AND 200\)/,
      );
    });

    it('preset_reason_code enumerates the seven v1 values (doctor + patient taxonomy)', () => {
      expect(sql).toMatch(/preset_reason_code\s+TEXT CHECK/);
      for (const preset of [
        'visible_symptom',
        'need_to_hear_voice',
        'patient_request',
        'network_or_equipment',
        'case_doesnt_need_modality',
        'patient_environment',
        'other',
      ]) {
        expect(sql).toContain(`'${preset}'`);
      }
    });

    it('amount_paise column CHECK enforces positivity when set', () => {
      expect(sql).toMatch(/amount_paise\s+INT CHECK \(amount_paise IS NULL OR amount_paise > 0\)/);
    });

    it('razorpay_order_id is TEXT (nullable by default)', () => {
      expect(sql).toMatch(/razorpay_order_id\s+TEXT/);
    });

    it('requested_at defaults to now()', () => {
      expect(sql).toMatch(/requested_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/);
    });

    it('expires_at is NOT NULL (caller-supplied — service computes 60s / 90s)', () => {
      expect(sql).toMatch(/expires_at\s+TIMESTAMPTZ NOT NULL[\s,]*$/m);
    });

    it('response enumerates all seven terminal values', () => {
      for (const resp of [
        'approved_paid',
        'approved_free',
        'allowed',
        'declined',
        'timeout',
        'checkout_cancelled',
        'provider_failure',
      ]) {
        expect(sql).toContain(`'${resp}'`);
      }
    });

    it('correlation_id column exists for end-to-end request tracing', () => {
      expect(sql).toMatch(/correlation_id\s+UUID/);
    });
  });

  // --------------------------------------------------------------------------
  // CHECK: response shape — responded_at + response move together
  // --------------------------------------------------------------------------

  describe('response shape CHECK', () => {
    it('defines modality_change_pending_response_shape CHECK', () => {
      expect(sql).toMatch(/CONSTRAINT modality_change_pending_response_shape CHECK/);
    });

    it('asserts both-null or both-not-null semantics', () => {
      expect(sql).toMatch(
        /\(response IS NULL AND responded_at IS NULL\)[\s\S]*?OR\s*\(response IS NOT NULL AND responded_at IS NOT NULL\)/,
      );
    });
  });

  // --------------------------------------------------------------------------
  // Indexes
  // --------------------------------------------------------------------------

  describe('indexes', () => {
    it('partial index for active pending rows (Step 7 guard)', () => {
      expect(sql).toMatch(
        /CREATE INDEX IF NOT EXISTS idx_modality_pending_session_active\s+ON modality_change_pending_requests\(session_id, expires_at DESC\)\s+WHERE response IS NULL/,
      );
    });

    it('partial ordered index for the timeout worker expiry scan', () => {
      expect(sql).toMatch(
        /CREATE INDEX IF NOT EXISTS idx_modality_pending_expiry_scan\s+ON modality_change_pending_requests\(expires_at\)\s+WHERE response IS NULL/,
      );
    });

    it('partial index on razorpay_order_id for the mid-consult webhook reverse lookup', () => {
      expect(sql).toMatch(
        /CREATE INDEX IF NOT EXISTS idx_modality_pending_razorpay_order\s+ON modality_change_pending_requests\(razorpay_order_id\)\s+WHERE razorpay_order_id IS NOT NULL/,
      );
    });
  });

  // --------------------------------------------------------------------------
  // Row-Level Security
  // --------------------------------------------------------------------------

  describe('row-level security', () => {
    it('enables RLS on the new table', () => {
      expect(sql).toMatch(/ALTER TABLE modality_change_pending_requests ENABLE ROW LEVEL SECURITY/);
    });

    it('drops the SELECT policy before recreating it (idempotent)', () => {
      expect(sql).toMatch(
        /DROP POLICY IF EXISTS modality_change_pending_select_participants\s+ON modality_change_pending_requests/,
      );
    });

    it('creates the participant-scoped SELECT policy', () => {
      expect(sql).toMatch(
        /CREATE POLICY modality_change_pending_select_participants\s+ON modality_change_pending_requests\s+FOR SELECT/,
      );
      expect(sql).toMatch(/doctor_id = auth\.uid\(\)\s+OR \(patient_id IS NOT NULL AND patient_id = auth\.uid\(\)\)/);
    });

    it('does NOT grant client-side INSERT / UPDATE / DELETE policies', () => {
      expect(sql).not.toMatch(
        /CREATE POLICY[^;]*ON modality_change_pending_requests[\s\S]*?FOR (INSERT|UPDATE|DELETE)/,
      );
    });
  });

  // --------------------------------------------------------------------------
  // Documentation
  // --------------------------------------------------------------------------

  describe('documentation', () => {
    it('documents the reverse migration in-file', () => {
      expect(sql).toMatch(/DROP TABLE IF EXISTS modality_change_pending_requests/);
    });

    it('warns against reverting once Task 47 has landed in production', () => {
      expect(sql).toMatch(/Do NOT revert once Task 47 has landed in production/);
    });

    it('references Migration 075 as a hard dependency', () => {
      expect(sql).toMatch(/Migration 075|MUST run after 075/);
    });
  });
});
