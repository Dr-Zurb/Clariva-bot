/**
 * Content-sanity test for migration 107 (text-t2 chat polish).
 *
 * Sub-batch B · task-text-B1 — pins the load-bearing clauses of the schema
 * slice that hard-blocks B3–B9 so an accidental edit dropping the RLS guards,
 * the soft-delete view projection, the auto-unpin trigger, or the
 * idempotent-publication wrapper fails in review.
 *
 * Pattern mirrors `consultation-messages-migration.test.ts` and
 * `modality-history-migration.test.ts`: pure file-content inspection via
 * regex, no live Postgres. The repo has no live-Supabase test harness today
 * (`tests/integration/` are stand-alone scripts run via `npx ts-node`). The
 * full RLS behaviour is verified manually in the smoke step documented in
 * the task file (`scripts/diagnose-text-consult-jwt.ts` re-run + manual
 * forward/reverse apply against local Supabase).
 *
 * @see backend/migrations/107_text_t2_chat_polish.sql
 * @see docs/Work/Daily-plans/April 2026/28-04-2026/Tasks/text/task-text-B1-t2-chat-polish-migration.md
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../../migrations/107_text_t2_chat_polish.sql',
);

const sql = readFileSync(MIGRATION_PATH, 'utf8');

/**
 * Strip SQL line comments (`-- ...` to EOL) so the "no raw auth.uid()" check
 * doesn't trip on header narration that legitimately mentions `auth.uid()`
 * as the anti-pattern this migration avoids. Block comments are not used
 * in this migration; if a future edit adds them, extend this stripper.
 */
const sqlCodeOnly = sql.replace(/--[^\n]*/g, '');

describe('107_text_t2_chat_polish.sql', () => {
  // --------------------------------------------------------------------------
  // Plan F04 invariants — safe_uuid_sub + status='live' must be load-bearing.
  // --------------------------------------------------------------------------

  describe('Plan F04 invariants', () => {
    it('uses public.safe_uuid_sub() and never raw auth.uid()', () => {
      // Multiple references expected (reactions SELECT/INSERT/DELETE,
      // update_recent, pin_doctor_only). At least 3 keeps the test cheap
      // while still failing if a contributor accidentally swaps one for
      // auth.uid().
      const safeUuidSubMatches = sql.match(/public\.safe_uuid_sub\(\)/g) ?? [];
      expect(safeUuidSubMatches.length).toBeGreaterThanOrEqual(3);

      // No raw auth.uid() anywhere in this migration's executable SQL.
      // (Other migrations are free to use it; this one MUST NOT, because
      // the policies here run on consultation_messages, which is hit by
      // patient JWTs with synthetic non-UUID `sub`.) Comments are
      // stripped first so the header narration that names the
      // anti-pattern is not flagged.
      expect(sqlCodeOnly).not.toMatch(/\bauth\.uid\(\)/);
    });

    it('enforces consultation_sessions.status = \'live\' in both INSERT and UPDATE policies', () => {
      // Pin the literal so a future refactor to a CHECK-via-function
      // doesn't silently drop the Decision-5 guard.
      const liveGuardMatches = sql.match(/status\s*=\s*'live'/g) ?? [];
      // At minimum: reactions INSERT + update_recent + pin_doctor_only.
      expect(liveGuardMatches.length).toBeGreaterThanOrEqual(3);
    });
  });

  // --------------------------------------------------------------------------
  // 1. consultation_message_reactions table + RLS
  // --------------------------------------------------------------------------

  describe('consultation_message_reactions table', () => {
    it('creates the table idempotently', () => {
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS consultation_message_reactions/);
    });

    it('FKs message_id to consultation_messages(id) with ON DELETE CASCADE', () => {
      expect(sql).toMatch(
        /message_id\s+UUID\s+NOT NULL REFERENCES consultation_messages\(id\) ON DELETE CASCADE/,
      );
    });

    it('whitelists the five reaction emojis via CHECK', () => {
      expect(sql).toMatch(/CHECK \(emoji IN \([^)]*'👍'[^)]*'❤️'[^)]*'✓'[^)]*'❓'[^)]*'😮'[^)]*\)\)/);
    });

    it('enforces (message_id, user_id, emoji) uniqueness for toggle-off semantics', () => {
      expect(sql).toMatch(/UNIQUE \(message_id, user_id, emoji\)/);
    });

    it('creates the message_id index for the per-message reaction lookup', () => {
      expect(sql).toMatch(
        /CREATE INDEX IF NOT EXISTS idx_message_reactions_message\s+ON consultation_message_reactions\(message_id\)/,
      );
    });

    it('enables RLS on the table', () => {
      expect(sql).toMatch(
        /ALTER TABLE consultation_message_reactions ENABLE ROW LEVEL SECURITY/,
      );
    });

    it('declares the three reactions policies (SELECT, INSERT, DELETE)', () => {
      expect(sql).toMatch(
        /CREATE POLICY consultation_message_reactions_select_participants\s+ON consultation_message_reactions\s+FOR SELECT/,
      );
      expect(sql).toMatch(
        /CREATE POLICY consultation_message_reactions_insert_live_self\s+ON consultation_message_reactions\s+FOR INSERT/,
      );
      expect(sql).toMatch(
        /CREATE POLICY consultation_message_reactions_delete_own\s+ON consultation_message_reactions\s+FOR DELETE/,
      );
    });

    it('drops each reactions policy before recreating (re-run safety)', () => {
      expect(sql).toMatch(/DROP POLICY IF EXISTS consultation_message_reactions_select_participants/);
      expect(sql).toMatch(/DROP POLICY IF EXISTS consultation_message_reactions_insert_live_self/);
      expect(sql).toMatch(/DROP POLICY IF EXISTS consultation_message_reactions_delete_own/);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Additive nullable columns on consultation_messages
  // --------------------------------------------------------------------------

  describe('additive columns on consultation_messages', () => {
    it('adds reply_to_id with ON DELETE SET NULL self-FK', () => {
      expect(sql).toMatch(
        /ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES consultation_messages\(id\) ON DELETE SET NULL/,
      );
    });

    it('adds all five remaining nullable cols (edited_at / deleted_at / pinned_at / pinned_by / batch_id)', () => {
      expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS edited_at\s+TIMESTAMPTZ/);
      expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS deleted_at\s+TIMESTAMPTZ/);
      expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS pinned_at\s+TIMESTAMPTZ/);
      expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS pinned_by\s+UUID/);
      expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS batch_id\s+UUID/);
    });

    it('creates the partial pinned-index keyed on (session_id, pinned_at)', () => {
      expect(sql).toMatch(
        /CREATE INDEX IF NOT EXISTS idx_consultation_messages_pinned\s+ON consultation_messages\(session_id,\s*pinned_at\)\s+WHERE pinned_at IS NOT NULL/,
      );
    });
  });

  // --------------------------------------------------------------------------
  // 3. consultation_messages_view — soft-delete projection
  // --------------------------------------------------------------------------

  describe('consultation_messages_view', () => {
    it('creates the view WITH security_invoker = true (PG 15+; delegates RLS to caller)', () => {
      expect(sql).toMatch(
        /CREATE OR REPLACE VIEW consultation_messages_view\s+WITH \(security_invoker = true\)/,
      );
    });

    it('NULL-s body for soft-deleted rows', () => {
      expect(sql).toMatch(/CASE WHEN deleted_at IS NOT NULL THEN NULL ELSE body\s+END AS body/);
    });

    it('NULL-s all attachment metadata cols for soft-deleted rows (task draft said attachment_id; actual schema uses attachment_url/mime/byte_size)', () => {
      expect(sql).toMatch(/CASE WHEN deleted_at IS NOT NULL THEN NULL ELSE attachment_url\s+END AS attachment_url/);
      expect(sql).toMatch(/CASE WHEN deleted_at IS NOT NULL THEN NULL ELSE attachment_mime_type\s+END AS attachment_mime_type/);
      expect(sql).toMatch(/CASE WHEN deleted_at IS NOT NULL THEN NULL ELSE attachment_byte_size\s+END AS attachment_byte_size/);
    });

    it('NULL-s metadata for soft-deleted rows so the snapshot-visibility discriminant from 084 does not leak', () => {
      expect(sql).toMatch(/CASE WHEN deleted_at IS NOT NULL THEN NULL ELSE metadata\s+END AS metadata/);
    });

    it('projects the six new context cols (reply_to_id / edited_at / deleted_at / pinned_at / pinned_by / batch_id)', () => {
      // After the CASE WHEN block, the bare-column projections continue.
      expect(sql).toMatch(/reply_to_id,\s+edited_at,\s+deleted_at,\s+pinned_at,\s+pinned_by,\s+batch_id/);
    });

    it('grants SELECT to authenticated + anon + service_role roles', () => {
      expect(sql).toMatch(/GRANT SELECT ON consultation_messages_view TO authenticated/);
      expect(sql).toMatch(/GRANT SELECT ON consultation_messages_view TO anon/);
      expect(sql).toMatch(/GRANT SELECT ON consultation_messages_view TO service_role/);
    });
  });

  // --------------------------------------------------------------------------
  // 4. UPDATE policies — update_recent + pin_doctor_only
  // --------------------------------------------------------------------------

  describe('consultation_messages_update_recent policy', () => {
    it('declares the policy with the 60 s edit-window literal', () => {
      expect(sql).toMatch(
        /CREATE POLICY consultation_messages_update_recent\s+ON consultation_messages\s+FOR UPDATE/,
      );
      // Literal `interval '60 seconds'` appears in BOTH USING and WITH CHECK
      // so a future refactor cannot widen the window in one without the other.
      const intervalMatches = sql.match(/interval '60 seconds'/g) ?? [];
      expect(intervalMatches.length).toBeGreaterThanOrEqual(2);
    });

    it('keys sender on safe_uuid_sub OR a patient-claim branch (sender_role=\'patient\' + consult_role + session_id)', () => {
      expect(sql).toMatch(/sender_id = public\.safe_uuid_sub\(\)/);
      expect(sql).toMatch(/sender_role\s*=\s*'patient'/);
      expect(sql).toMatch(/auth\.jwt\(\)\s*->>\s*'consult_role'\s*=\s*'patient'/);
      expect(sql).toMatch(/auth\.jwt\(\)\s*->>\s*'session_id'/);
    });

    it('drops update_recent before recreating (re-run safety)', () => {
      expect(sql).toMatch(/DROP POLICY IF EXISTS consultation_messages_update_recent/);
    });
  });

  describe('consultation_messages_pin_doctor_only policy', () => {
    it('declares the policy', () => {
      expect(sql).toMatch(
        /CREATE POLICY consultation_messages_pin_doctor_only\s+ON consultation_messages\s+FOR UPDATE/,
      );
    });

    it('keys USING on doctor_id + live session', () => {
      // The USING clause must constrain by both doctor identity and live status.
      expect(sql).toMatch(
        /USING \(\s*session_id IN \(\s*SELECT id FROM consultation_sessions\s+WHERE doctor_id = public\.safe_uuid_sub\(\)\s+AND status = 'live'/,
      );
    });

    it('caps simultaneously-pinned messages at 3 via COUNT(*) subquery with table alias', () => {
      // The 3-cap is the load-bearing limit on the pin feature. The
      // aliased self-reference is required to disambiguate the
      // outer-table column reference inside the subquery.
      expect(sql).toMatch(
        /SELECT COUNT\(\*\) FROM consultation_messages cm\s+WHERE cm\.session_id = consultation_messages\.session_id\s+AND cm\.pinned_at IS NOT NULL\s*\)\s*<=\s*3/,
      );
    });

    it('permits unpinning (NEW.pinned_at IS NULL AND NEW.pinned_by IS NULL)', () => {
      // Without this branch the policy would block unpinning entirely,
      // making the 3-cap unreachable for any session that ever hit it.
      expect(sql).toMatch(/pinned_at IS NULL AND pinned_by IS NULL/);
    });

    it('drops pin_doctor_only before recreating (re-run safety)', () => {
      expect(sql).toMatch(/DROP POLICY IF EXISTS consultation_messages_pin_doctor_only/);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Auto-unpin trigger
  // --------------------------------------------------------------------------

  describe('auto-unpin trigger', () => {
    it('defines the auto_unpin_on_delete() function in plpgsql', () => {
      expect(sql).toMatch(
        /CREATE OR REPLACE FUNCTION auto_unpin_on_delete\(\)\s+RETURNS TRIGGER AS \$\$/,
      );
      expect(sql).toMatch(/LANGUAGE plpgsql/);
    });

    it('NULL-s pinned_at + pinned_by when deleted_at is set on a previously-pinned row', () => {
      expect(sql).toMatch(
        /IF NEW\.deleted_at IS NOT NULL AND OLD\.pinned_at IS NOT NULL THEN\s+NEW\.pinned_at := NULL;\s+NEW\.pinned_by := NULL;/,
      );
    });

    it('installs the trigger BEFORE UPDATE on consultation_messages and drops the old one first', () => {
      expect(sql).toMatch(
        /DROP TRIGGER IF EXISTS trg_auto_unpin_on_delete ON consultation_messages/,
      );
      expect(sql).toMatch(
        /CREATE TRIGGER trg_auto_unpin_on_delete\s+BEFORE UPDATE ON consultation_messages\s+FOR EACH ROW EXECUTE FUNCTION auto_unpin_on_delete\(\)/,
      );
    });
  });

  // --------------------------------------------------------------------------
  // 6. Realtime publication
  // --------------------------------------------------------------------------

  describe('Realtime publication', () => {
    it('adds the reactions table to supabase_realtime inside an idempotent DO block', () => {
      expect(sql).toMatch(
        /ALTER PUBLICATION supabase_realtime ADD TABLE consultation_message_reactions/,
      );
    });

    it('re-asserts consultation_messages is in the publication (idempotent DO block)', () => {
      // Migration 051 already added it; UPDATE events from this migration's
      // new policies must fan out. The DO block catches duplicate_object
      // for the expected re-add path.
      expect(sql).toMatch(
        /ALTER PUBLICATION supabase_realtime ADD TABLE consultation_messages/,
      );
    });

    it('wraps both ADDs with EXCEPTION handlers for duplicate_object AND undefined_object', () => {
      // duplicate_object: table already in publication (idempotent re-run).
      // undefined_object: publication absent (non-Supabase deployment).
      const duplicateMatches = sql.match(/WHEN duplicate_object THEN/g) ?? [];
      const undefinedMatches = sql.match(/WHEN undefined_object THEN/g) ?? [];
      expect(duplicateMatches.length).toBeGreaterThanOrEqual(2);
      expect(undefinedMatches.length).toBeGreaterThanOrEqual(2);
    });

    it('forces PostgREST to reload schema after applying the migration', () => {
      expect(sql).toMatch(/NOTIFY pgrst,\s*'reload schema'/);
    });
  });

  // --------------------------------------------------------------------------
  // 7. Reverse-migration documentation
  // --------------------------------------------------------------------------

  describe('reverse-migration documentation', () => {
    it('documents the manual reverse-migration steps in a trailing comment block', () => {
      expect(sql).toMatch(/Reverse migration/i);

      // Each reverse step must be present so a future contributor can
      // copy-paste the block to roll back the migration cleanly.
      expect(sql).toMatch(/DROP TRIGGER\s+IF EXISTS trg_auto_unpin_on_delete/);
      expect(sql).toMatch(/DROP FUNCTION IF EXISTS auto_unpin_on_delete\(\)/);
      expect(sql).toMatch(/DROP POLICY IF EXISTS consultation_messages_pin_doctor_only/);
      expect(sql).toMatch(/DROP POLICY IF EXISTS consultation_messages_update_recent/);
      expect(sql).toMatch(/DROP VIEW IF EXISTS consultation_messages_view/);
      expect(sql).toMatch(/DROP INDEX IF EXISTS idx_consultation_messages_pinned/);
      expect(sql).toMatch(/DROP COLUMN IF EXISTS reply_to_id/);
      expect(sql).toMatch(/DROP COLUMN IF EXISTS batch_id/);
      expect(sql).toMatch(/DROP TABLE IF EXISTS consultation_message_reactions/);
    });
  });

  // --------------------------------------------------------------------------
  // 8. Numbering note — the task draft cited 083; that slot was taken.
  // --------------------------------------------------------------------------

  describe('numbering provenance', () => {
    it('documents why this migration is 107 (draft cited 083; slot taken)', () => {
      expect(sql).toMatch(/Task draft cited migration `083`/);
      expect(sql).toMatch(/next free number/i);
    });
  });
});
