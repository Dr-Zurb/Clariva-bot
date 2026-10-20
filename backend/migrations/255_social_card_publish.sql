-- ============================================================================
-- 255_social_card_publish.sql
-- social-assist
-- Date: 2026-10-13
-- ============================================================================
-- Purpose:
--   Remember the last send attempt for a scheduled card.
--   publish_error is a short code. Do not store or log the file key,
--   the caption, or the Instagram URL.
--
-- Reverse migration (document only):
--   ALTER TABLE social_cards DROP COLUMN IF EXISTS publish_error;
--   ALTER TABLE social_cards DROP COLUMN IF EXISTS publish_attempt_at;
-- ============================================================================

ALTER TABLE social_cards
  ADD COLUMN IF NOT EXISTS publish_attempt_at TIMESTAMPTZ NULL;

ALTER TABLE social_cards
  ADD COLUMN IF NOT EXISTS publish_error TEXT NULL;

COMMENT ON COLUMN social_cards.publish_error IS
  'Short send code: not_connected or meta_rejected. Do not store a URL or a file key.';

ALTER TABLE social_cards
  DROP CONSTRAINT IF EXISTS social_cards_publish_error_code;

ALTER TABLE social_cards
  ADD CONSTRAINT social_cards_publish_error_code
  CHECK (publish_error IS NULL OR publish_error IN ('not_connected', 'meta_rejected'));
