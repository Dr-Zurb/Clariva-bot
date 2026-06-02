-- ============================================================================
-- 082_consultation_messages_attachment_mime_size_guards.sql
-- Plan 06 follow-up — pin the attachment MIME allowlist + max byte size
--                     at the DB layer.
--
-- WHY THIS EXISTS
--   Plan 06's Task 39 (migrations 062 + 063) shipped the schema for
--   attachment rows: `kind='attachment'`, `attachment_url`,
--   `attachment_mime_type`, `attachment_byte_size`. The row-shape CHECK
--   in 063 only pins which sibling columns must be populated per kind;
--   it doesn't constrain *what* mime types are allowed or *how large*
--   an attachment can be.
--
--   Two product decisions feed the constraints below:
--
--   1. **No voice notes.** Per the 26-Apr-2026 chat-features
--      conversation, audio attachments are deferred indefinitely (the
--      "voice note bypasses voice-consult pricing" cannibalisation
--      argument). Without a DB-layer guard, a future frontend bug or
--      malicious client could insert an `audio/*` attachment row and
--      the chat would happily render a 📎 download link to it. The
--      MIME allowlist below is the defense-in-depth fence: even if the
--      frontend mime-allowlist is bypassed, the DB rejects the row.
--
--   2. **10 MB max attachment size.** Migration 051's bucket comment
--      already documented this cap, but the row had no upper bound
--      check (only `>= 0`). A 100 MB PDF would currently be accepted
--      and would burn Storage egress + frontend bandwidth on every
--      message render. Cap matches the storage bucket's expected
--      ceiling; widen with an additive ALTER if a future plan needs
--      large lab reports.
--
-- ALLOWLIST (image + document, intentionally NO audio):
--   image/jpeg, image/png, image/webp, image/heic, image/heif, image/gif
--   application/pdf
--
--   HEIC/HEIF allowed despite poor browser native rendering — iPhones
--   default to HEIC and forcing a client-side conversion in v1 would
--   gate too much patient flow. Doctor falls back to tap-to-download
--   when the browser can't render. Client-side HEIC→JPEG conversion
--   is a Plan-11 polish follow-up (logged in inbox).
--
-- WHAT CHANGES
--   1. Adds `consultation_messages_attachment_mime_allowlist_check` —
--      kind='attachment' rows must carry a mime in the allowlist above.
--   2. Adds `consultation_messages_attachment_max_byte_size_check` —
--      kind='attachment' rows with a byte_size populated must be
--      <= 10 MiB (10 * 1024 * 1024 bytes).
--   3. Both use NOT VALID + VALIDATE — no ACCESS EXCLUSIVE table scan
--      on rollout. Existing rows are all kind='text' (Plan 04 only
--      shipped text inserts; the attachment frontend hasn't shipped
--      yet at the time of this migration), so VALIDATE is a no-op.
--
-- WHAT DOESN'T CHANGE
--   * `attachment_url` shape (still TEXT — could be a storage path or
--     a full URL; v1 stores the storage path and the frontend mints a
--     signed URL on render).
--   * The row-shape CHECK from 063 (which-columns-must-be-NOT-NULL).
--   * `attachment_byte_size IS NULL` is still allowed for forward
--     compatibility with backfill paths; the size cap only applies
--     when a value is supplied.
--   * Storage bucket policies (079's safe_uuid_sub() rewrites stand).
--
-- ROLLBACK
--   ALTER TABLE consultation_messages
--     DROP CONSTRAINT IF EXISTS consultation_messages_attachment_max_byte_size_check;
--   ALTER TABLE consultation_messages
--     DROP CONSTRAINT IF EXISTS consultation_messages_attachment_mime_allowlist_check;
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. MIME allowlist for attachment rows.
--    NOT VALID first so the ALTER doesn't take ACCESS EXCLUSIVE for the
--    duration of a full table scan; existing rows are all kind='text'
--    so VALIDATE is a fast metadata flip.
-- ----------------------------------------------------------------------------
ALTER TABLE consultation_messages
  DROP CONSTRAINT IF EXISTS consultation_messages_attachment_mime_allowlist_check;

ALTER TABLE consultation_messages
  ADD CONSTRAINT consultation_messages_attachment_mime_allowlist_check
  CHECK (
    kind <> 'attachment'
    OR attachment_mime_type IN (
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
      'image/gif',
      'application/pdf'
    )
  )
  NOT VALID;

ALTER TABLE consultation_messages
  VALIDATE CONSTRAINT consultation_messages_attachment_mime_allowlist_check;

-- ----------------------------------------------------------------------------
-- 2. Max byte size for attachment rows (10 MiB cap).
--    NULL byte_size is still allowed (forward compat); the cap applies
--    only when a value is supplied. The lower-bound `>= 0` constraint
--    in migration 063 stays intact (column-level CHECK on the column).
-- ----------------------------------------------------------------------------
ALTER TABLE consultation_messages
  DROP CONSTRAINT IF EXISTS consultation_messages_attachment_max_byte_size_check;

ALTER TABLE consultation_messages
  ADD CONSTRAINT consultation_messages_attachment_max_byte_size_check
  CHECK (
    kind <> 'attachment'
    OR attachment_byte_size IS NULL
    OR attachment_byte_size <= 10485760
  )
  NOT VALID;

ALTER TABLE consultation_messages
  VALIDATE CONSTRAINT consultation_messages_attachment_max_byte_size_check;

-- ----------------------------------------------------------------------------
-- 3. Force PostgREST to drop cached query plans so subsequent inserts
--    are validated against the new constraints immediately.
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- Migration Complete
-- ============================================================================
