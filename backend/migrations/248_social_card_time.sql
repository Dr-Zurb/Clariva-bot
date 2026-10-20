-- ============================================================================
-- 248_social_card_time.sql
-- social-assist · soc-07
-- Date: 2026-10-11
-- ============================================================================
-- Purpose:
--   A time on a Ready card that already has a file. Halo Aid stores the
--   time. It does not publish. Clearing the time leaves the card Ready.
--
-- Safety:
--   Additive column. A time with no file is rejected by the check.
--
-- Reverse migration (document only):
--   ALTER TABLE social_cards DROP CONSTRAINT IF EXISTS social_cards_time_needs_file;
--   ALTER TABLE social_cards DROP COLUMN IF EXISTS scheduled_at;
-- ============================================================================

ALTER TABLE social_cards
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN social_cards.scheduled_at IS
  'soc-07: when the doctor posts from the phone. Not a publish. Do not log the title.';

ALTER TABLE social_cards
  DROP CONSTRAINT IF EXISTS social_cards_time_needs_file;

ALTER TABLE social_cards
  ADD CONSTRAINT social_cards_time_needs_file
  CHECK (
    scheduled_at IS NULL
    OR (stage = 'ready' AND file_path IS NOT NULL)
  );
