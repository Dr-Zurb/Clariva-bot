/**
 * Content-sanity test for migration 182 (alerts-v2 event_kind widen + dedupe_key).
 *
 * Pins the load-bearing clauses so an accidental edit that drops:
 *   - the full 5-kind CHECK list (or reintroduces a Postgres ENUM),
 *   - the additive DROP/ADD constraint pattern,
 *   - the partial unique dedupe index (NULL keys must not collide),
 *   - the explicit RLS-unchanged statement,
 * fails in review. Live CHECK / unique-index behavior is verified when
 * the migration is applied on a scratch DB (task alr2-01 §4.1).
 *
 * @see docs/Work/Daily-plans/July 2026/21-07-2026/alerts-v2/Tasks/task-alr2-01-migration-event-kind-and-dedupe.md
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/182_alerts_v2_event_kind_widen_and_dedupe.sql',
);

const LEGAL_KINDS = [
  'patient_replayed_recording',
  'patient_revoked_video_mid_session',
  'patient_replayed_video',
  'booking_review_sla_breach',
  'appointment_no_show',
] as const;

describe('182_alerts_v2_event_kind_widen_and_dedupe.sql', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  describe('event_kind CHECK widen', () => {
    it('drops then re-adds the CHECK (idempotent DROP/ADD pattern)', () => {
      expect(sql).toMatch(
        /DROP CONSTRAINT IF EXISTS doctor_dashboard_events_event_kind_check/,
      );
      expect(sql).toMatch(
        /ADD CONSTRAINT doctor_dashboard_events_event_kind_check CHECK/,
      );
    });

    it('lists all five legal kinds (legacy three + two v2)', () => {
      for (const kind of LEGAL_KINDS) {
        expect(sql).toContain(`'${kind}'`);
      }
    });

    it('does not invent a Postgres ENUM for event_kind', () => {
      expect(sql).not.toMatch(/CREATE TYPE.*event_kind/i);
    });

    it('does not narrow or drop legacy kinds from the CHECK list', () => {
      // The three pre-v2 kinds must appear in the ADD CONSTRAINT block.
      const addBlock = sql.match(
        /ADD CONSTRAINT doctor_dashboard_events_event_kind_check CHECK\s*\(([\s\S]*?)\)\s*;/,
      );
      expect(addBlock).not.toBeNull();
      const list = addBlock![1]!;
      expect(list).toContain("'patient_replayed_recording'");
      expect(list).toContain("'patient_revoked_video_mid_session'");
      expect(list).toContain("'patient_replayed_video'");
      expect(list).toContain("'booking_review_sla_breach'");
      expect(list).toContain("'appointment_no_show'");
    });
  });

  describe('dedupe_key', () => {
    it('adds dedupe_key as nullable TEXT with IF NOT EXISTS', () => {
      expect(sql).toMatch(
        /ADD COLUMN IF NOT EXISTS dedupe_key\s+TEXT/,
      );
    });

    it('creates a partial unique index on (doctor_id, dedupe_key) WHERE NOT NULL', () => {
      expect(sql).toMatch(
        /CREATE UNIQUE INDEX IF NOT EXISTS uq_doctor_dashboard_events_dedupe\s+ON doctor_dashboard_events\(doctor_id, dedupe_key\)\s+WHERE dedupe_key IS NOT NULL/,
      );
    });

    it('comments the dedupe_key column', () => {
      expect(sql).toMatch(/COMMENT ON COLUMN doctor_dashboard_events\.dedupe_key IS/);
    });
  });

  describe('RLS + reverse', () => {
    it('explicitly states RLS is unchanged', () => {
      expect(sql).toMatch(/RLS[\s\S]*?(unchanged|No policy change)/i);
      expect(sql).not.toMatch(/CREATE POLICY/i);
      expect(sql).not.toMatch(/DROP POLICY/i);
      expect(sql).not.toMatch(/ENABLE ROW LEVEL SECURITY/i);
    });

    it('documents a reverse that narrows CHECK back to the three legacy kinds', () => {
      expect(sql).toMatch(/Reverse migration/i);
      expect(sql).toMatch(/Do NOT revert once Alerts v2 rows exist/i);
      expect(sql).toMatch(/DROP INDEX IF EXISTS uq_doctor_dashboard_events_dedupe/);
      expect(sql).toMatch(/DROP COLUMN IF EXISTS dedupe_key/);
      // Reverse CHECK must restore only the three pre-v2 kinds.
      expect(sql).toMatch(
        /--\s+ADD CONSTRAINT doctor_dashboard_events_event_kind_check CHECK \([\s\S]*?'patient_replayed_recording'[\s\S]*?'patient_revoked_video_mid_session'[\s\S]*?'patient_replayed_video'[\s\S]*?\)/,
      );
    });
  });
});
