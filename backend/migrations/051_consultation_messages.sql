-- ============================================================================
-- Consultation messages: chat backbone for text + companion-channel modalities
-- (Plan 04 · Task 17 · Decision 1 LOCKED · Decision 5 LOCKED)
-- ============================================================================
-- Migration: 051_consultation_messages.sql
-- Date:      2026-04-19
-- Description:
--   Lands the base shape of the chat layer that Decision 1 LOCKED on
--   Supabase Realtime + Postgres (instead of Twilio Conversations or
--   WhatsApp). Three deliverables in one migration:
--
--     1. `consultation_messages` table FK'd to `consultation_sessions(id)`
--        with the `consultation_message_kind` ENUM (initial value: 'text').
--        Plan 06 will additively widen the ENUM with 'attachment' + 'system'
--        and the `sender_role` CHECK with 'system'.
--
--     2. RLS policies that enforce Decision 5 (live-only sync) at the DB
--        layer:
--          · SELECT: any session participant (doctor or patient) can read,
--                    even after the session ends — needed for Plan 07's
--                    post-consult chat history.
--          · INSERT: only the session participant who sent it
--                    (`sender_id = auth.uid()`) AND only while the parent
--                    session is `status = 'live'`. Pre-session and post-
--                    session writes are physically rejected by RLS — no
--                    application code needed to enforce the doctrine.
--          · No UPDATE / DELETE policies — messages are immutable from the
--                    client. Service role bypass handles backend admin
--                    inserts (Plan 06 system messages, Plan 04 prescription
--                    delivery posts via `text-session-supabase.sendMessage`).
--
--     3. Storage bucket `consultation-attachments` (provisioned now even
--        though Plan 04 v1 doesn't use attachments — keeps Plan 06 small)
--        with matching session-membership RLS on `storage.objects`. Path
--        convention: `consultation-attachments/{session_id}/{uuid}.{ext}`.
--        Plan 06 must follow this — RLS keys on the first folder segment.
--
--     4. Realtime publication entry so Task 19's `<TextConsultRoom>` can
--        subscribe to INSERT events on `consultation_messages`.
--
-- Safety:
--   · Additive only — no existing column dropped, no constraint tightened.
--   · ENUM creation guarded with idempotent DO block (matches 049 pattern).
--   · Storage bucket INSERT uses `ON CONFLICT (id) DO NOTHING` (matches
--     migration 027 pattern).
--   · Realtime publication ADD wrapped in idempotent DO block — Postgres
--     errors with `duplicate_object` if the table is already published, and
--     this DDL has no `IF NOT EXISTS` form.
--   · Reverse migration:
--         DROP PUBLICATION-MEMBERSHIP for consultation_messages;
--         DROP TABLE consultation_messages;
--         DROP TYPE consultation_message_kind;
--         storage RLS policies dropped by name;
--         bucket left in place (manual cleanup — buckets may have orphan
--         objects whose deletion is a separate operational decision).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ENUM (idempotent guard — Postgres has no `CREATE TYPE IF NOT EXISTS`)
-- ----------------------------------------------------------------------------
-- Plan 06 will additively `ALTER TYPE consultation_message_kind ADD VALUE
-- 'attachment'` and `ADD VALUE 'system'`. Adding values is a one-shot
-- operation — `ADD VALUE IF NOT EXISTS` was added in PG 12+ so the additive
-- migration in Plan 06 should use the IF NOT EXISTS form.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'consultation_message_kind') THEN
    CREATE TYPE consultation_message_kind AS ENUM ('text');
  END IF;
END$$;

-- ----------------------------------------------------------------------------
-- 2. Table
-- ----------------------------------------------------------------------------
-- `body` is nullable so Plan 06 attachment-only rows (kind='attachment',
-- body NULL, attachment metadata in a sibling table) don't need a schema
-- change.
--
-- `sender_id` is intentionally NOT FK'd to `doctors` or `patients` — two
-- reasons:
--   (a) `auth.uid()` is the source of truth for RLS; FK to physical user
--       tables creates impedance mismatch with Supabase auth.
--   (b) Account deletion (Plan 02 Task 33) may scrub the patient row but
--       messages must persist under the medical-record carve-out. The
--       `sender_role` column tells us "was this a patient or a doctor"
--       without needing the row to exist.
--
-- `sender_role` is TEXT + CHECK rather than ENUM so Plan 06 can additively
-- widen the CHECK to include 'system' without an `ALTER TYPE` migration.
--
-- ON DELETE CASCADE on `session_id`: if a session row is hard-deleted at
-- regulatory retention end (Plan 02 Task 34's archival worker), the
-- messages go with it. Messages are part of the recording artifact under
-- Decision 12 — they share retention doctrine.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS consultation_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID NOT NULL REFERENCES consultation_sessions(id) ON DELETE CASCADE,
  sender_id    UUID NOT NULL,
  sender_role  TEXT NOT NULL CHECK (sender_role IN ('doctor', 'patient')),
  kind         consultation_message_kind NOT NULL DEFAULT 'text',
  body         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consultation_messages_session_time
  ON consultation_messages(session_id, created_at);

-- ----------------------------------------------------------------------------
-- 3. RLS — three policies, two doors:
--      SELECT door  : session-membership only.
--      INSERT door  : session-membership AND sender_id = auth.uid()
--                     AND parent session status = 'live'.
--    No UPDATE / DELETE policies (messages are immutable from the client).
--    Service role bypasses RLS by default in Supabase — backend admin
--    inserts (Plan 04 `sendMessage`, Plan 06 system messages) use that
--    path.
-- ----------------------------------------------------------------------------
ALTER TABLE consultation_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS consultation_messages_select_participants
  ON consultation_messages;
CREATE POLICY consultation_messages_select_participants
  ON consultation_messages
  FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM consultation_sessions
      WHERE doctor_id = auth.uid()
         OR (patient_id IS NOT NULL AND patient_id = auth.uid())
    )
  );

-- INSERT policy enforces Decision 5 (live-only sync) at the DB layer.
-- Pre-session (status='scheduled') and post-session (status='ended' /
-- 'cancelled' / 'no_show') inserts are physically rejected.
DROP POLICY IF EXISTS consultation_messages_insert_live_participants
  ON consultation_messages;
CREATE POLICY consultation_messages_insert_live_participants
  ON consultation_messages
  FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND session_id IN (
      SELECT id FROM consultation_sessions
      WHERE (
              doctor_id = auth.uid()
              OR (patient_id IS NOT NULL AND patient_id = auth.uid())
            )
        AND status = 'live'
    )
  );

-- ----------------------------------------------------------------------------
-- 4. Realtime publication — idempotent ADD.
--    `ALTER PUBLICATION ... ADD TABLE` has no IF NOT EXISTS form; trap the
--    duplicate_object SQLSTATE so re-runs are safe.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE consultation_messages;
EXCEPTION
  WHEN duplicate_object THEN
    -- Already in the publication; nothing to do.
    NULL;
  WHEN undefined_object THEN
    -- The supabase_realtime publication doesn't exist on this instance
    -- (e.g. self-hosted Postgres without the Supabase Realtime extension).
    -- Skip silently so non-Supabase deployments don't fail this migration.
    RAISE NOTICE 'supabase_realtime publication not found; skipping ADD TABLE consultation_messages';
END$$;

-- ----------------------------------------------------------------------------
-- 5. Storage bucket — `consultation-attachments`
--    Provisioned now even though Plan 04 v1 doesn't write attachments
--    (keeps Plan 06 small). Bucket is private; access via signed URLs
--    minted by the backend with the patient's session-scoped JWT
--    (Plan 04 Task 18).
--
--    Path convention (load-bearing — Plan 06 + 07 must follow):
--        consultation-attachments/{session_id}/{uuid}.{ext}
--
--    The storage RLS keys on the first folder segment via
--    `storage.foldername(name)[1]` — change the convention here and the
--    policy stops working.
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES (
  'consultation-attachments',
  'consultation-attachments',
  false
)
ON CONFLICT (id) DO NOTHING;

-- File-size limit + MIME whitelist live on `storage.buckets` columns whose
-- presence depends on the Supabase version. Apply via dashboard or via:
--   UPDATE storage.buckets
--   SET    file_size_limit    = 10485760,                            -- 10 MB
--          allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','application/pdf']
--   WHERE  id = 'consultation-attachments';
-- (Documented here, not run automatically — different Supabase versions
-- have different schemas and this migration must apply across all of them.)

-- ----------------------------------------------------------------------------
-- 6. Storage RLS — session-membership read; live-session-membership write.
--    Mirrors the consultation_messages RLS shape so attachments and chat
--    rows share one mental model.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS consultation_attachments_select_participants
  ON storage.objects;
CREATE POLICY consultation_attachments_select_participants
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'consultation-attachments'
    AND (
      (storage.foldername(name))[1] IN (
        SELECT id::text FROM consultation_sessions
        WHERE doctor_id = auth.uid()
           OR (patient_id IS NOT NULL AND patient_id = auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS consultation_attachments_insert_live_participants
  ON storage.objects;
CREATE POLICY consultation_attachments_insert_live_participants
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'consultation-attachments'
    AND (
      (storage.foldername(name))[1] IN (
        SELECT id::text FROM consultation_sessions
        WHERE (
                doctor_id = auth.uid()
                OR (patient_id IS NOT NULL AND patient_id = auth.uid())
              )
          AND status = 'live'
      )
    )
  );

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- Reverse migration (manual; no automated down-migration tooling in this
-- repo today):
--
--   -- 1. Realtime publication
--   DO $$ BEGIN
--     ALTER PUBLICATION supabase_realtime DROP TABLE consultation_messages;
--   EXCEPTION WHEN undefined_object THEN NULL;
--   END$$;
--
--   -- 2. Storage RLS
--   DROP POLICY IF EXISTS consultation_attachments_insert_live_participants ON storage.objects;
--   DROP POLICY IF EXISTS consultation_attachments_select_participants      ON storage.objects;
--
--   -- 3. Table-level RLS + table + index + ENUM
--   DROP POLICY IF EXISTS consultation_messages_insert_live_participants ON consultation_messages;
--   DROP POLICY IF EXISTS consultation_messages_select_participants      ON consultation_messages;
--   DROP INDEX  IF EXISTS idx_consultation_messages_session_time;
--   DROP TABLE  IF EXISTS consultation_messages;
--   DROP TYPE   IF EXISTS consultation_message_kind;
--
--   -- 4. Bucket left in place — drop manually only after confirming zero
--   --    objects remain:
--   --      DELETE FROM storage.buckets WHERE id = 'consultation-attachments';
-- ============================================================================
