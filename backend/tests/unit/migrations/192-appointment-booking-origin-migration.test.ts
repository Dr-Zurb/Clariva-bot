/**
 * Content-sanity test for migration 192 (appointments.booking_origin).
 *
 * @see docs/Work/Daily-plans/August 2026/11-08-2026/opd-status-model/Tasks/task-osm-01-migration-booking-origin.md
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ORIGIN_VALUES = [
  'booked',
  'walk_in',
  'overflow',
  'return_after_completed',
  'rebooked',
] as const;

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/192_appointment_booking_origin.sql'
);

describe('192_appointment_booking_origin.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  describe('column', () => {
    it('adds booking_origin TEXT NOT NULL DEFAULT booked with IF NOT EXISTS', () => {
      expect(sql).toMatch(
        /ADD COLUMN IF NOT EXISTS booking_origin TEXT NOT NULL DEFAULT 'booked'/
      );
    });

    it('documents non-PHI operational label', () => {
      expect(sql).toMatch(/COMMENT ON COLUMN appointments\.booking_origin IS/);
      expect(sql).toMatch(/not PHI/i);
    });
  });

  describe('CHECK constraint', () => {
    it('adds appointments_booking_origin_check guarded by pg_constraint', () => {
      expect(sql).toMatch(/appointments_booking_origin_check/);
      expect(sql).toMatch(/FROM pg_constraint/);
      expect(sql).toMatch(/conname = 'appointments_booking_origin_check'/);
    });

    it('CHECK IN list matches the locked origin set', () => {
      const match = sql.match(/booking_origin IN\s*\(([^)]+)\)/s);
      expect(match).not.toBeNull();
      const listed = (match![1].match(/'([^']+)'/g) ?? []).map((s) =>
        s.replace(/'/g, '')
      );
      expect(listed.sort()).toEqual([...ORIGIN_VALUES].sort());
    });
  });

  describe('backfill (OSM-D9)', () => {
    it('backfills only from opd_event_type = return_after_completed', () => {
      expect(sql).toMatch(
        /SET booking_origin = 'return_after_completed'/
      );
      expect(sql).toMatch(
        /opd_event_type = 'return_after_completed'/
      );
      expect(sql).toMatch(/booking_origin = 'booked'/);
    });

    it('does not backfill from created_at or appended-after-day logic', () => {
      // Explanatory comments may name the heuristic; the UPDATE must not use it.
      const updateBlock = sql.match(
        /UPDATE appointments[\s\S]*?(?=COMMENT ON COLUMN)/
      )?.[0] ?? '';
      expect(updateBlock).toMatch(/opd_event_type = 'return_after_completed'/);
      expect(updateBlock).not.toMatch(/created_at/);
      expect(updateBlock).not.toMatch(/isAppendedAfterDay/);
      expect(updateBlock).not.toMatch(/appended_after/i);
    });
  });

  describe('scope', () => {
    it('does not touch RLS or auth.uid()', () => {
      expect(sql).not.toMatch(/ROW LEVEL SECURITY/);
      expect(sql).not.toMatch(/auth\.uid\(\)/);
      expect(sql).not.toMatch(/CREATE POLICY/);
    });

    it('documents rollback dropping constraint then column', () => {
      expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS appointments_booking_origin_check/);
      expect(sql).toMatch(/DROP COLUMN IF EXISTS booking_origin/);
    });
  });
});
