-- ============================================================================
-- Plan 06 · Task 39 — companion-channel columns + row-shape CHECK (part 2 of 2)
-- ============================================================================
-- Migration: 063_consultation_messages_attachment_system_columns_and_checks.sql
-- Date:      2026-04-19
-- Description:
--   Second half of the Task 39 schema change. Depends on migration 062
--   having committed (062 ships the `consultation_message_kind` ENUM
--   additions `'attachment'` + `'system'`; Postgres refuses to reference
--   newly-ADD-ed ENUM values in the same transaction that added them —
--   error 55P04 unsafe use of new value).
--
--   This migration adds:
--     1. Attachment metadata + system_event columns (all nullable; per-
--        kind presence enforced by the row-shape CHECK below).
--     2. Widens the existing `sender_role` CHECK to allow `'system'`.
--     3. Installs a row-shape CHECK (`consultation_messages_kind_shape_check`)
--        that pins the per-kind required-fields contract:
--          kind='text'       → body NOT NULL, attachment_* NULL, system_event NULL
--          kind='attachment' → attachment_url + mime NOT NULL, system_event NULL
--                              (body optional caption)
--          kind='system'     → body + system_event NOT NULL, sender_role='system',
--                              attachment_* NULL.
--
-- Safety:
--   · Additive only — no existing row is altered, no constraint is
--     tightened on existing rows.
--   · The row-shape CHECK uses the NOT VALID + VALIDATE pattern so the
--     ALTER does NOT scan existing rows under ACCESS EXCLUSIVE. Existing
--     rows are all kind='text' with body NOT NULL (Plan 04 enforced this
--     at the application layer in `text-session-supabase.ts#sendMessage`
--     pre-Task-39), so VALIDATE will succeed.
--   · The `sender_role` CHECK widening drops + recreates the constraint
--     under the same name — Postgres cannot ALTER a CHECK in place. The
--     drop is safe because the new constraint is strictly broader than
--     the old one (every value the old allowed, the new one also allows).
--
-- PREREQUISITE: run `062_consultation_messages_attachments_and_system.sql`
-- first AND commit it. This migration references the ENUM values added
-- there.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Attachment metadata + system_event columns (all nullable; per-kind
--    presence enforced by the row-shape CHECK below).
--
--    `system_event` is deliberately TEXT (not an ENUM) so Plans 07, 08, 09
--    can each ADD tags without coordinating an `ALTER TYPE` migration
--    ordering. The TypeScript `SystemEvent` union in consultation-message-
--    service.ts / Task 37's emitter is the actual source of truth; the
--    row-shape CHECK below only enforces "non-NULL when kind='system'".
--
--    `attachment_byte_size` is INTEGER (not BIGINT) — max file size in v1
--    is 10 MB per Migration 051's documented bucket cap, and INTEGER
--    (32-bit signed, max ~2.1 GB) is plenty. Widen to BIGINT in a one-line
--    additive ALTER if a future plan needs 100 MB+ attachments.
-- ----------------------------------------------------------------------------
ALTER TABLE consultation_messages
  ADD COLUMN IF NOT EXISTS attachment_url        TEXT,
  ADD COLUMN IF NOT EXISTS attachment_mime_type  TEXT,
  ADD COLUMN IF NOT EXISTS attachment_byte_size  INTEGER CHECK (attachment_byte_size IS NULL OR attachment_byte_size >= 0),
  ADD COLUMN IF NOT EXISTS system_event          TEXT;

-- ----------------------------------------------------------------------------
-- 2. Widen sender_role CHECK to allow 'system'.
--    Drop + recreate under the same name. The new constraint is strictly
--    broader than the old one, so existing rows (all 'doctor' | 'patient')
--    pass it trivially; no NOT VALID dance needed for this one.
-- ----------------------------------------------------------------------------
ALTER TABLE consultation_messages
  DROP CONSTRAINT IF EXISTS consultation_messages_sender_role_check;
ALTER TABLE consultation_messages
  ADD CONSTRAINT consultation_messages_sender_role_check
  CHECK (sender_role IN ('doctor', 'patient', 'system'));

-- ----------------------------------------------------------------------------
-- 3. Row-shape CHECK — pins the per-kind required-fields contract.
--
--    Added NOT VALID first to avoid a full-table scan on rollout, then
--    VALIDATE-d separately. Existing rows are all kind='text' with body
--    NOT NULL (Plan 04 enforced this at the application layer in
--    text-session-supabase.ts#sendMessage), so VALIDATE will succeed.
--
--    The application-layer guards (`text-session-supabase.ts#sendMessage`
--    post-Task-39 + Task 37's `emitSystemMessage`) produce clearer errors
--    before the DB sees the row; this CHECK is defense-in-depth that
--    catches any future caller that routes around the helpers.
-- ----------------------------------------------------------------------------
ALTER TABLE consultation_messages
  DROP CONSTRAINT IF EXISTS consultation_messages_kind_shape_check;

ALTER TABLE consultation_messages
  ADD CONSTRAINT consultation_messages_kind_shape_check
  CHECK (
    (kind = 'text'       AND body IS NOT NULL
                          AND attachment_url IS NULL
                          AND attachment_mime_type IS NULL
                          AND attachment_byte_size IS NULL
                          AND system_event IS NULL)
    OR
    (kind = 'attachment' AND attachment_url IS NOT NULL
                          AND attachment_mime_type IS NOT NULL
                          AND system_event IS NULL)
    OR
    (kind = 'system'     AND body IS NOT NULL
                          AND system_event IS NOT NULL
                          AND sender_role = 'system'
                          AND attachment_url IS NULL
                          AND attachment_mime_type IS NULL
                          AND attachment_byte_size IS NULL)
  )
  NOT VALID;

ALTER TABLE consultation_messages
  VALIDATE CONSTRAINT consultation_messages_kind_shape_check;

-- ----------------------------------------------------------------------------
-- 4. RLS — intentionally NOT extended for system rows.
--
--    The existing consultation_messages_insert_live_participants policy
--    (Migration 051) blocks system rows from any non-service-role caller
--    because (a) the patient JWT branch from Migration 052 enforces
--    sender_role='patient', and (b) the doctor branch enforces
--    sender_id = auth.uid() which won't match the synthetic 'system'
--    sender. Service-role inserts bypass RLS entirely, so the backend
--    `emitSystemMessage` path (Task 37) works unchanged.
--
--    No new INSERT policy is added in this migration. Service-role
--    bypass is the v1 path. If a future caller needs to insert system
--    rows under a non-service-role JWT (no current use case), an
--    additive policy can ship in a follow-up migration.
--
--    Documented as part of Task 37's contract: system rows MUST be
--    written via the service-role Supabase client.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 5. Index hint — no new indexes in this migration. The existing
--    `idx_consultation_messages_session_time` covers the canonical
--    `WHERE session_id = ? ORDER BY created_at` query that the
--    <TextConsultRoom> renders for all kinds. A `WHERE kind = 'system'`
--    workload is not anticipated in v1; revisit if Plan 10's AI
--    pipeline starts filtering by kind at query time.
-- ----------------------------------------------------------------------------

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- Reverse migration (manual; no automated down-migration tooling):
--
--   -- 1. Row-shape CHECK
--   ALTER TABLE consultation_messages
--     DROP CONSTRAINT IF EXISTS consultation_messages_kind_shape_check;
--
--   -- 2. sender_role CHECK narrowing (drop + restore the original)
--   ALTER TABLE consultation_messages
--     DROP CONSTRAINT IF EXISTS consultation_messages_sender_role_check;
--   ALTER TABLE consultation_messages
--     ADD  CONSTRAINT consultation_messages_sender_role_check
--     CHECK (sender_role IN ('doctor', 'patient'));
--
--   -- 3. Drop the four new columns (in reverse-add order)
--   ALTER TABLE consultation_messages
--     DROP COLUMN IF EXISTS system_event,
--     DROP COLUMN IF EXISTS attachment_byte_size,
--     DROP COLUMN IF EXISTS attachment_mime_type,
--     DROP COLUMN IF EXISTS attachment_url;
--
--   -- 4. ENUM values cannot be DROP-ed in Postgres without recreating the
--   --    type. Leaving 'attachment' + 'system' in the ENUM after rollback
--   --    is harmless — no rows reference them (the row-shape CHECK is gone,
--   --    and the application layer stops writing non-text kinds).
--   --    Reverse of migration 062 is also a no-op for the same reason.
-- ============================================================================
