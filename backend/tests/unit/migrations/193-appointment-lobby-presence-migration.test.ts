/**
 * Content-sanity test for migration 193 (appointments lobby presence).
 *
 * @see docs/Work/Daily-plans/August 2026/12-08-2026/consult-room-checkin/p1-lobby-presence/Tasks/task-crc-01-migration-lobby-presence.md
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/193_appointment_lobby_presence.sql'
);

describe('193_appointment_lobby_presence.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  describe('columns', () => {
    it('adds patient_checked_in_at TIMESTAMPTZ NULL with IF NOT EXISTS', () => {
      expect(sql).toMatch(
        /ADD COLUMN IF NOT EXISTS patient_checked_in_at TIMESTAMPTZ NULL/
      );
    });

    it('adds patient_lobby_last_seen_at TIMESTAMPTZ NULL with IF NOT EXISTS', () => {
      expect(sql).toMatch(
        /ADD COLUMN IF NOT EXISTS patient_lobby_last_seen_at TIMESTAMPTZ NULL/
      );
    });

    it('adds patient_checkin_notified_at TIMESTAMPTZ NULL with IF NOT EXISTS', () => {
      expect(sql).toMatch(
        /ADD COLUMN IF NOT EXISTS patient_checkin_notified_at TIMESTAMPTZ NULL/
      );
    });

    it('documents non-PHI operational comments', () => {
      expect(sql).toMatch(/COMMENT ON COLUMN appointments\.patient_checked_in_at IS/);
      expect(sql).toMatch(/COMMENT ON COLUMN appointments\.patient_lobby_last_seen_at IS/);
      expect(sql).toMatch(/COMMENT ON COLUMN appointments\.patient_checkin_notified_at IS/);
      expect(sql).toMatch(/not PHI/i);
    });
  });

  describe('scope', () => {
    it('does not touch RLS or auth.uid()', () => {
      expect(sql).not.toMatch(/ROW LEVEL SECURITY/);
      expect(sql).not.toMatch(/auth\.uid\(\)/);
      expect(sql).not.toMatch(/CREATE POLICY/);
    });

    it('documents rollback dropping the three columns', () => {
      expect(sql).toMatch(/DROP COLUMN IF EXISTS patient_checkin_notified_at/);
      expect(sql).toMatch(/DROP COLUMN IF EXISTS patient_lobby_last_seen_at/);
      expect(sql).toMatch(/DROP COLUMN IF EXISTS patient_checked_in_at/);
    });

    it('does not backfill presence timestamps', () => {
      expect(sql).not.toMatch(/UPDATE appointments/i);
    });
  });
});
