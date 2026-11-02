-- ============================================================================
-- 267_social_card_make_at.sql
-- social-assist
-- Date: 2026-10-30
-- ============================================================================
-- Purpose:
--   A time to start making a Chosen or Making card. It is not the publish
--   time. Ready still uses scheduled_at, and this time does not send anything.
--
-- Reverse migration (document only):
--   ALTER TABLE social_cards DROP CONSTRAINT IF EXISTS social_cards_make_at_stage;
--   ALTER TABLE social_cards DROP COLUMN IF EXISTS make_at;
-- ============================================================================

ALTER TABLE social_cards
  ADD COLUMN IF NOT EXISTS make_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN social_cards.make_at IS
  'When to start making a Chosen or Making card. Not a publish. Do not log the title.';

ALTER TABLE social_cards
  DROP CONSTRAINT IF EXISTS social_cards_make_at_stage;

ALTER TABLE social_cards
  ADD CONSTRAINT social_cards_make_at_stage
  CHECK (
    make_at IS NULL
    OR stage IN ('chosen', 'making')
  );
