-- ============================================================================
-- 247_social_card_files.sql
-- social-assist · soc-05
-- Date: 2026-10-11
-- ============================================================================
-- Purpose:
--   A marketing file on a social card. Ready means the file is attached.
--   The object lives in its own private bucket. It is not a visit
--   document and not a clinic logo. The object key is ids only. Do not store the
--   original file name. Do not log the key.
--
-- Pattern:
--   Same as clinic-branding (212): private bucket, doctor_id as the first
--   folder, SELECT-own, no write policies. The service role mints the
--   signed upload URL.
--
-- Safety:
--   Additive column. Existing Ready rows have no file, so they move to
--   Making before the check is added.
--
-- Reverse migration (document only):
--   ALTER TABLE social_cards DROP CONSTRAINT IF EXISTS social_cards_ready_has_file;
--   ALTER TABLE social_cards DROP COLUMN IF EXISTS file_path;
--   DROP POLICY IF EXISTS social_card_files_select_own ON storage.objects;
--   -- DELETE FROM storage.buckets WHERE id = 'social-card-files';
-- ============================================================================

ALTER TABLE social_cards
  ADD COLUMN IF NOT EXISTS file_path TEXT NULL;

COMMENT ON COLUMN social_cards.file_path IS
  'soc-05: object key in social-card-files. Ids only. Do not log this value.';

UPDATE social_cards
SET stage = 'making'
WHERE stage = 'ready'
  AND file_path IS NULL;

ALTER TABLE social_cards
  DROP CONSTRAINT IF EXISTS social_cards_ready_has_file;

ALTER TABLE social_cards
  ADD CONSTRAINT social_cards_ready_has_file
  CHECK (
    (
      stage = 'ready'
      AND file_path IS NOT NULL
      AND char_length(file_path) BETWEEN 1 AND 300
    )
    OR (stage <> 'ready' AND file_path IS NULL)
  );

INSERT INTO storage.buckets (id, name, public)
VALUES ('social-card-files', 'social-card-files', false)
ON CONFLICT (id) DO NOTHING;

-- Size and MIME are also checked in the service before the signed URL.
--   UPDATE storage.buckets
--      SET file_size_limit = 52428800,
--          allowed_mime_types = ARRAY[
--            'image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime'
--          ]
--    WHERE id = 'social-card-files';

DROP POLICY IF EXISTS social_card_files_select_own ON storage.objects;
CREATE POLICY social_card_files_select_own
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'social-card-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
