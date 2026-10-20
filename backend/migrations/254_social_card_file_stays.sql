-- ============================================================================
-- 254_social_card_file_stays.sql
-- social-assist
-- Date: 2026-10-13
-- ============================================================================
-- Purpose:
--   One file stays on the card in every column. Ready still requires a file.
--   source_url is an inspiration link. It is not the Instagram post.
--   Do not log the object key or the link.
--
-- Reverse migration (document only):
--   ALTER TABLE social_cards DROP CONSTRAINT IF EXISTS social_cards_ready_has_file;
--   ALTER TABLE social_cards DROP CONSTRAINT IF EXISTS social_cards_source_url_len;
--   ALTER TABLE social_cards DROP COLUMN IF EXISTS source_url;
--   -- Restoring the old check needs every non-Ready file cleared first.
-- ============================================================================

ALTER TABLE social_cards
  DROP CONSTRAINT IF EXISTS social_cards_ready_has_file;

ALTER TABLE social_cards
  ADD CONSTRAINT social_cards_ready_has_file
  CHECK (
    (file_path IS NULL OR char_length(file_path) BETWEEN 1 AND 300)
    AND (stage <> 'ready' OR file_path IS NOT NULL)
  );

ALTER TABLE social_cards
  ADD COLUMN IF NOT EXISTS source_url TEXT NULL;

COMMENT ON COLUMN social_cards.source_url IS
  'Inspiration link on the card. Not the Instagram post. Do not log this value.';

ALTER TABLE social_cards
  DROP CONSTRAINT IF EXISTS social_cards_source_url_len;

ALTER TABLE social_cards
  ADD CONSTRAINT social_cards_source_url_len
  CHECK (source_url IS NULL OR char_length(source_url) BETWEEN 1 AND 500);
