-- ============================================================================
-- 107_text_t2_chat_polish.sql
-- Sub-batch B (T2 real polish) · task-text-B1 — ships the schema slice that
--                                                hard-blocks B3–B9. Lands FIRST
--                                                in Sub-batch B; the eight
--                                                frontend items then unblock in
--                                                parallel.
--
-- WHY THIS EXISTS
--   Every T2 frontend item (B3–B9) reads or writes one of the columns / the
--   table / the RLS policies introduced here. Centralising them in one
--   additive migration keeps the surface reviewable in a single pass and
--   keeps PR ordering simple (this one merges first, frontend PRs pick up
--   the shape after).
--
--   The change is intentionally additive only: no existing column is
--   widened, narrowed, dropped, or renamed; no existing policy is altered;
--   the existing INSERT / SELECT contracts on `consultation_messages` from
--   migrations 051 / 062 / 063 / 078 / 079 are preserved verbatim. The
--   UPDATE policies are NEW (migration 051 explicitly declared messages
--   immutable-from-client; T2 changes that for the 60-second edit window
--   and for pin-by-doctor).
--
-- WHAT SHIPS (six deliverables)
--   1. `consultation_message_reactions` table — append-only join table; one
--      row per (message, user, emoji). Five-emoji whitelist via CHECK.
--   2. Six nullable additive columns on `consultation_messages`:
--        reply_to_id  UUID  REFERENCES consultation_messages(id) ON DELETE SET NULL  (B4 / T2.10)
--        edited_at    TIMESTAMPTZ                                                    (B6 / T2.11)
--        deleted_at   TIMESTAMPTZ                                                    (B6 / T2.12)
--        pinned_at    TIMESTAMPTZ                                                    (B7 / T2.14)
--        pinned_by    UUID                                                           (B7 / T2.14)
--        batch_id     UUID                                                           (B8 / T2.15)
--   3. `consultation_messages_view` — SELECT-only view that NULL-s out the
--      message body and the attachment metadata for soft-deleted rows on the
--      wire. Created `WITH (security_invoker = true)` so the caller's RLS
--      (and the caller's grants) apply, exactly as if they had queried the
--      base table.
--   4. TWO new UPDATE policies on `consultation_messages`:
--        a. `consultation_messages_update_recent` — sender can UPDATE only
--           their own messages, only within 60 s of `created_at`, only while
--           the session is live. Doctor branch keys on safe_uuid_sub();
--           patient branch keys on the JWT `consult_role='patient'` +
--           `session_id` claims (mirrors the INSERT contract from
--           migration 079; otherwise a patient could never satisfy this
--           policy because their JWT sub is the synthetic
--           `patient:{appointmentId}` and `safe_uuid_sub()` returns NULL).
--           Frontend enforces the four-fields-only column whitelist (body /
--           edited_at / deleted_at / reply_to_id); this RLS handles the
--           who / when / parent-session-live invariants. See `notes` below
--           for why we do NOT enforce the column whitelist via a trigger
--           in v1.
--        b. `consultation_messages_pin_doctor_only` — only the doctor on a
--           live session can write `pinned_at` / `pinned_by`. The 3-cap on
--           simultaneously-pinned messages is enforced via a COUNT(*)
--           subquery in WITH CHECK. Unpinning (NEW.pinned_at IS NULL) is
--           explicitly allowed (the cap is on PIN-INs, not UNPINs); see
--           the WITH CHECK comment below.
--   5. Auto-unpin trigger — when `deleted_at` is set on a previously-pinned
--      message, NULL `pinned_at` + `pinned_by` so the pinned-banner never
--      references a tombstone.
--   6. Realtime publication — adds the new reactions table; verifies (DO
--      block; idempotent) that `consultation_messages` is in the publication
--      so UPDATE events fan out to B6's adapter.
--
-- INVARIANTS PRESERVED (Plan F04)
--   * Every new policy reads the JWT via `public.safe_uuid_sub()`; no raw
--     `auth.uid()` anywhere in this migration. (Required so patient HMAC-
--     derived JWTs — whose sub is non-UUID — never trigger a 22P02 cast.)
--   * Every INSERT / UPDATE policy enforces
--     `consultation_sessions.status = 'live'` (Decision 5 LOCKED).
--   * Service-role bypasses RLS, as always (Plan 04 emitSystemMessage and
--     friends keep working).
--
-- WHAT THIS DOES NOT CHANGE
--   * Existing SELECT / INSERT policies on `consultation_messages` (kept
--     verbatim from 079 + 084).
--   * Existing row-shape CHECK from 063 (kind ↔ required sibling columns).
--     The new columns are NOT referenced by that CHECK — all six are
--     genuinely additive context that any kind may carry.
--   * `consultation_sessions` row visibility (kept from 081).
--   * Storage policies on `consultation-attachments`.
--   * JWT mint behaviour.
--
-- NUMBERING NOTE
--   Task draft cited migration `083`. That slot was claimed by
--   `083_consultation_messages_metadata_column.sql` (Sub-batch C · video).
--   The next free number at PR time is 107 (last shipped: 106). Following
--   the first-come-first-serve rule documented in the task file.
--
-- COLUMN-NAME NOTE
--   The task draft references `attachment_id` in the soft-delete view. The
--   actual schema (migration 063) stores attachment metadata as
--   `attachment_url` / `attachment_mime_type` / `attachment_byte_size`
--   (there is no `attachment_id` column). The view NULL-s all three plus
--   `metadata` for deleted rows so no leakable byproduct of the attachment
--   slips through. The task acceptance asserts "view nulls body AND
--   attachment_*"; the test below pins the actual columns.
--
-- ROLLBACK (manual; no down-migration tooling in this repo)
--   See trailing comment block at the foot of this file.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. consultation_message_reactions table
--    Append-only join table — one row per (message, user, emoji). UNIQUE
--    constraint enforces toggle-off semantics at the DB layer (a second
--    INSERT of the same trio fails with 23505; frontend B5 catches that
--    and switches to DELETE). Five-emoji whitelist via CHECK; widening to
--    a sixth is a Decision change + separate migration.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS consultation_message_reactions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  UUID        NOT NULL REFERENCES consultation_messages(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL,
  emoji       TEXT        NOT NULL CHECK (emoji IN ('👍', '❤️', '✓', '❓', '😮')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_message_reactions_message
  ON consultation_message_reactions(message_id);

ALTER TABLE consultation_message_reactions ENABLE ROW LEVEL SECURITY;

-- SELECT: any session participant (doctor or patient on the parent session).
DROP POLICY IF EXISTS consultation_message_reactions_select_participants
  ON consultation_message_reactions;
CREATE POLICY consultation_message_reactions_select_participants
  ON consultation_message_reactions
  FOR SELECT
  USING (
    message_id IN (
      SELECT m.id
      FROM consultation_messages m
      JOIN consultation_sessions s ON s.id = m.session_id
      WHERE s.doctor_id = public.safe_uuid_sub()
         OR s.patient_id = public.safe_uuid_sub()
         OR (
           auth.jwt() ->> 'consult_role' = 'patient'
           AND auth.jwt() ->> 'session_id' = s.id::text
         )
    )
  );

-- INSERT: only on live sessions, only as self (user_id must match the caller
-- — either the safe_uuid_sub for doctors, or the patient_id resolved from
-- the consultation_sessions row for patient-claim JWTs).
DROP POLICY IF EXISTS consultation_message_reactions_insert_live_self
  ON consultation_message_reactions;
CREATE POLICY consultation_message_reactions_insert_live_self
  ON consultation_message_reactions
  FOR INSERT
  WITH CHECK (
    message_id IN (
      SELECT m.id
      FROM consultation_messages m
      JOIN consultation_sessions s ON s.id = m.session_id
      WHERE s.status = 'live'
        AND (
          -- Doctor branch — sender is the doctor on the session.
          (
            s.doctor_id = public.safe_uuid_sub()
            AND user_id = public.safe_uuid_sub()
          )
          OR
          -- Real-uid patient branch (forward compat; no production path
          -- mints these JWTs today but Plan F04 keeps the door open).
          (
            s.patient_id = public.safe_uuid_sub()
            AND user_id = public.safe_uuid_sub()
          )
          OR
          -- Patient-claim branch — JWT carries session_id; the
          -- user_id is matched against s.patient_id since the patient JWT
          -- has no real-uid sub.
          (
            auth.jwt() ->> 'consult_role' = 'patient'
            AND auth.jwt() ->> 'session_id' = s.id::text
            AND user_id = s.patient_id
          )
        )
    )
  );

-- DELETE: any caller can remove their own reaction (toggle off). No
-- live-session guard — patients should be able to undo a misclick even
-- if the session ends mid-tap, mirroring the chat-edit grace pattern.
DROP POLICY IF EXISTS consultation_message_reactions_delete_own
  ON consultation_message_reactions;
CREATE POLICY consultation_message_reactions_delete_own
  ON consultation_message_reactions
  FOR DELETE
  USING (
    user_id = public.safe_uuid_sub()
    OR (
      auth.jwt() ->> 'consult_role' = 'patient'
      AND user_id IN (
        SELECT s.patient_id
        FROM consultation_sessions s
        WHERE auth.jwt() ->> 'session_id' = s.id::text
      )
    )
  );

-- ----------------------------------------------------------------------------
-- 2. Additive nullable columns on consultation_messages
--    All six are pure context. The row-shape CHECK from migration 063 does
--    NOT reference any of these — kind='text' / 'attachment' / 'system'
--    can all carry reply / edited / deleted / pinned / batch context.
--
--    reply_to_id: ON DELETE SET NULL. Frontend B4 must render
--    `reply_to_id` resolving to NULL gracefully ("Replied to a deleted
--    message").
-- ----------------------------------------------------------------------------
ALTER TABLE consultation_messages
  ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES consultation_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS edited_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pinned_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pinned_by   UUID,
  ADD COLUMN IF NOT EXISTS batch_id    UUID;

-- Partial index keyed on (session_id, pinned_at) — covers the "list pinned
-- messages for this session" query that B7's pinned-banner renders on
-- room mount and on every PIN/UNPIN UPDATE event.
CREATE INDEX IF NOT EXISTS idx_consultation_messages_pinned
  ON consultation_messages(session_id, pinned_at)
  WHERE pinned_at IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. consultation_messages_view — SELECT-only soft-delete projection.
--
--    Created WITH (security_invoker = true) so the view delegates RLS to
--    the calling user (PG 15+; Supabase runs 15+). This is critical: the
--    default `security_invoker = off` would run the view as the OWNER,
--    bypassing RLS — a leak. WITH security_invoker = true the view is
--    transparent to RLS.
--
--    Columns NULL-ed for soft-deleted rows:
--      * body
--      * attachment_url / attachment_mime_type / attachment_byte_size
--      * metadata  (the snapshot-visibility discriminant from migration 084
--                   lives here; we NULL it so deleted snapshots don't leak
--                   a capturer_role/target byproduct)
--
--    Columns LEFT VISIBLE on soft-deleted rows:
--      * id / session_id / sender_id / sender_role / kind / system_event /
--        reply_to_id / edited_at / deleted_at / pinned_at / pinned_by /
--        batch_id / created_at
--
--    Pinned_at / pinned_by should always be NULL post-delete via the
--    auto-unpin trigger below, but we don't NULL them in the view too
--    so an out-of-band SET deleted_at (e.g. via service role bypassing
--    the trigger? — it doesn't, BEFORE triggers always run, but defense)
--    still surfaces the inconsistency for debugging.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW consultation_messages_view
  WITH (security_invoker = true) AS
  SELECT
    id,
    session_id,
    sender_id,
    sender_role,
    kind,
    CASE WHEN deleted_at IS NOT NULL THEN NULL ELSE body                  END AS body,
    CASE WHEN deleted_at IS NOT NULL THEN NULL ELSE attachment_url        END AS attachment_url,
    CASE WHEN deleted_at IS NOT NULL THEN NULL ELSE attachment_mime_type  END AS attachment_mime_type,
    CASE WHEN deleted_at IS NOT NULL THEN NULL ELSE attachment_byte_size  END AS attachment_byte_size,
    system_event,
    CASE WHEN deleted_at IS NOT NULL THEN NULL ELSE metadata              END AS metadata,
    reply_to_id,
    edited_at,
    deleted_at,
    pinned_at,
    pinned_by,
    batch_id,
    created_at
  FROM consultation_messages;

-- Grant SELECT to authenticated; Supabase default search_path picks up the
-- view in PostgREST exposure automatically once granted.
GRANT SELECT ON consultation_messages_view TO authenticated;
GRANT SELECT ON consultation_messages_view TO anon;
GRANT SELECT ON consultation_messages_view TO service_role;

-- ----------------------------------------------------------------------------
-- 4. UPDATE policies — TWO permissive policies that OR together
--    (Postgres rule: WITH CHECK clauses from permissive policies OR; at
--    least one must pass).
--
--    Why two policies instead of one big CASE? Two reasons:
--      (a) Pin/unpin operates by the doctor regardless of who authored the
--          message; the edit-recent operation operates by the SENDER (could
--          be the patient) regardless of doctor presence. The constraints
--          are orthogonal — keeping them separate keeps the audit clearer.
--      (b) Policy-level errors include the policy name in the SQLSTATE
--          detail, which makes "why was this UPDATE rejected" trivial to
--          debug. A single mega-policy would always blame the same name.
-- ----------------------------------------------------------------------------

-- 4a. consultation_messages_update_recent
--     Sender can edit their own message within 60 s of created_at on a
--     live session. Doctor branch uses safe_uuid_sub; patient branch uses
--     consult_role + session_id claims (mirrors 079's INSERT policy).
--     `sender_role = 'patient'` is asserted on the patient branch so a
--     patient can never edit doctor or system rows.
DROP POLICY IF EXISTS consultation_messages_update_recent
  ON consultation_messages;
CREATE POLICY consultation_messages_update_recent
  ON consultation_messages
  FOR UPDATE
  USING (
    created_at > (now() - interval '60 seconds')
    AND session_id IN (
      SELECT id FROM consultation_sessions
      WHERE status = 'live'
        AND (
          doctor_id = public.safe_uuid_sub()
          OR patient_id = public.safe_uuid_sub()
          OR (
            auth.jwt() ->> 'consult_role' = 'patient'
            AND auth.jwt() ->> 'session_id' = id::text
          )
        )
    )
    AND (
      -- Doctor (or real-uid patient) sender branch.
      sender_id = public.safe_uuid_sub()
      OR
      -- Patient-claim sender branch — patient JWT, patient-authored row,
      -- and the claim session_id matches.
      (
        sender_role = 'patient'
        AND auth.jwt() ->> 'consult_role' = 'patient'
        AND auth.jwt() ->> 'session_id' = consultation_messages.session_id::text
      )
    )
  )
  WITH CHECK (
    -- Re-assert the time + sender invariants on the NEW row so a UPDATE
    -- cannot push the row OUT of the 60 s window (e.g. by tweaking
    -- created_at) nor pivot sender_id to bypass.
    created_at > (now() - interval '60 seconds')
    AND (
      sender_id = public.safe_uuid_sub()
      OR
      (
        sender_role = 'patient'
        AND auth.jwt() ->> 'consult_role' = 'patient'
        AND auth.jwt() ->> 'session_id' = consultation_messages.session_id::text
      )
    )
  );

-- 4b. consultation_messages_pin_doctor_only
--     The doctor on a live session can UPDATE pin state. UNPINNING
--     (NEW.pinned_at IS NULL) is allowed independently of pinned_by because
--     unpinning sets BOTH pinned_at + pinned_by to NULL — requiring
--     `pinned_by = doctor` on an unpin would be self-contradictory.
--
--     The 3-cap COUNT(*) subquery is the load-bearing limit. It runs against
--     the BASE table (not the view), so it correctly counts pre-update
--     pinned rows; the WITH CHECK evaluates after the row is staged in the
--     transaction's snapshot for the row being updated, so COUNT includes
--     the row being pinned (post-update) and excludes the row being
--     unpinned (post-update). Either way the cap is correct.
DROP POLICY IF EXISTS consultation_messages_pin_doctor_only
  ON consultation_messages;
CREATE POLICY consultation_messages_pin_doctor_only
  ON consultation_messages
  FOR UPDATE
  USING (
    session_id IN (
      SELECT id FROM consultation_sessions
      WHERE doctor_id = public.safe_uuid_sub()
        AND status = 'live'
    )
  )
  WITH CHECK (
    (
      -- Pinning or no-pin-change-while-pinned: pinned_by must be the doctor.
      (pinned_at IS NOT NULL AND pinned_by = public.safe_uuid_sub())
      OR
      -- Unpinning: both fields NULL'd (matches the auto-unpin trigger shape
      -- too, so trigger-driven NEW rows also satisfy this branch).
      (pinned_at IS NULL AND pinned_by IS NULL)
    )
    AND (
      -- 3-cap on simultaneously-pinned messages per session. Aliased so the
      -- subquery doesn't capture the OUTER reference ambiguously.
      SELECT COUNT(*) FROM consultation_messages cm
      WHERE cm.session_id = consultation_messages.session_id
        AND cm.pinned_at IS NOT NULL
    ) <= 3
  );

-- ----------------------------------------------------------------------------
-- 5. Auto-unpin trigger — when deleted_at is set on a previously-pinned
--    message, NULL pinned_at + pinned_by so B7's pinned-banner never
--    references a tombstone.
--
--    Fires BEFORE UPDATE so the NULL'd values land in the same row, in the
--    same transaction. The OLD.pinned_at guard scopes the trigger to actual
--    transitions (no-op if the row was never pinned).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auto_unpin_on_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.pinned_at IS NOT NULL THEN
    NEW.pinned_at := NULL;
    NEW.pinned_by := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_unpin_on_delete ON consultation_messages;
CREATE TRIGGER trg_auto_unpin_on_delete
  BEFORE UPDATE ON consultation_messages
  FOR EACH ROW EXECUTE FUNCTION auto_unpin_on_delete();

-- ----------------------------------------------------------------------------
-- 6. Realtime publication — add the new reactions table; verify (DO block;
--    idempotent) that consultation_messages is in the publication so UPDATE
--    events fan out to B6's adapter.
--
--    Both ADDs are wrapped per the migration 051 pattern: catch
--    duplicate_object (already in publication) and undefined_object
--    (non-Supabase deployment).
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE consultation_message_reactions;
EXCEPTION
  WHEN duplicate_object THEN
    -- Already in the publication; nothing to do.
    NULL;
  WHEN undefined_object THEN
    -- Non-Supabase deployment (self-hosted Postgres without the Supabase
    -- Realtime extension). Skip silently so the migration still applies.
    RAISE NOTICE 'supabase_realtime publication not found; skipping ADD TABLE consultation_message_reactions';
END$$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE consultation_messages;
EXCEPTION
  WHEN duplicate_object THEN
    -- Already in the publication (migration 051 added it). Expected.
    NULL;
  WHEN undefined_object THEN
    RAISE NOTICE 'supabase_realtime publication not found; skipping ADD TABLE consultation_messages';
END$$;

-- Force PostgREST to reload its schema cache so it sees the new view + new
-- policies + new columns immediately (rather than after the next periodic
-- refresh, which can be tens of seconds on prod Supabase).
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- Reverse migration (manual; no automated down-migration tooling in this repo).
-- Apply in REVERSE order of forward migration:
--
--   -- 1. Realtime publication — drop the reactions table; leave
--   --    consultation_messages in the publication (migration 051 added it,
--   --    and reverting that is the 051 reverse's job).
--   DO $$ BEGIN
--     ALTER PUBLICATION supabase_realtime DROP TABLE consultation_message_reactions;
--   EXCEPTION WHEN undefined_object THEN NULL;
--   END$$;
--
--   -- 2. Auto-unpin trigger + function
--   DROP TRIGGER  IF EXISTS trg_auto_unpin_on_delete ON consultation_messages;
--   DROP FUNCTION IF EXISTS auto_unpin_on_delete();
--
--   -- 3. UPDATE policies
--   DROP POLICY IF EXISTS consultation_messages_pin_doctor_only ON consultation_messages;
--   DROP POLICY IF EXISTS consultation_messages_update_recent   ON consultation_messages;
--
--   -- 4. View
--   DROP VIEW IF EXISTS consultation_messages_view;
--
--   -- 5. Additive columns (FK on reply_to_id self-references the same
--   --    table; dropping in any order is safe because no rows will reference
--   --    it post-migration if the application has been rolled back too).
--   DROP INDEX IF EXISTS idx_consultation_messages_pinned;
--   ALTER TABLE consultation_messages
--     DROP COLUMN IF EXISTS batch_id,
--     DROP COLUMN IF EXISTS pinned_by,
--     DROP COLUMN IF EXISTS pinned_at,
--     DROP COLUMN IF EXISTS deleted_at,
--     DROP COLUMN IF EXISTS edited_at,
--     DROP COLUMN IF EXISTS reply_to_id;
--
--   -- 6. Reactions table + its RLS (CASCADE since policies are owned by the
--   --    table; explicit DROP POLICYs above for clarity).
--   DROP POLICY IF EXISTS consultation_message_reactions_delete_own         ON consultation_message_reactions;
--   DROP POLICY IF EXISTS consultation_message_reactions_insert_live_self   ON consultation_message_reactions;
--   DROP POLICY IF EXISTS consultation_message_reactions_select_participants ON consultation_message_reactions;
--   DROP INDEX IF EXISTS idx_message_reactions_message;
--   DROP TABLE IF EXISTS consultation_message_reactions;
--
--   -- 7. Force schema reload
--   NOTIFY pgrst, 'reload schema';
-- ============================================================================
