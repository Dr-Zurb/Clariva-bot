-- ============================================================================
-- 262_social_card_posted_keeps_time.sql
-- social-assist
-- Date: 2026-10-18
-- ============================================================================
-- Purpose:
--   Allow a posted card, and let it keep the time it went out.
--   The older stage check was stored in a form the earlier drop did not match,
--   so "posted" never landed.
--
-- Reverse migration (document only):
--   ALTER TABLE social_cards DROP CONSTRAINT IF EXISTS social_cards_stage_check;
--   ALTER TABLE social_cards ADD CONSTRAINT social_cards_stage_check
--     CHECK (stage IN ('thoughts', 'chosen', 'making', 'ready', 'custom'));
--   ALTER TABLE social_cards DROP CONSTRAINT IF EXISTS social_cards_time_needs_file;
--   ALTER TABLE social_cards ADD CONSTRAINT social_cards_time_needs_file
--     CHECK (scheduled_at IS NULL OR (stage = 'ready' AND file_path IS NOT NULL));
-- ============================================================================

ALTER TABLE social_cards
  DROP CONSTRAINT IF EXISTS social_cards_stage_check;

ALTER TABLE social_cards
  ADD CONSTRAINT social_cards_stage_check
  CHECK (stage IN ('thoughts', 'chosen', 'making', 'ready', 'custom', 'posted'));

ALTER TABLE social_cards
  DROP CONSTRAINT IF EXISTS social_cards_time_needs_file;

ALTER TABLE social_cards
  ADD CONSTRAINT social_cards_time_needs_file
  CHECK (
    scheduled_at IS NULL
    OR (stage = 'ready' AND file_path IS NOT NULL)
    OR stage = 'posted'
  );
