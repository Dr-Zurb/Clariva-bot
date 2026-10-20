-- ============================================================================
-- 266_social_card_scrap_pile.sql
-- social-assist · thoughts pile
-- Date: 2026-10-20
-- ============================================================================
-- Purpose:
--   A thought holds ten files of each kind (photo, video, audio, document).
--   The old check allowed ten scrap rows in total, so a photo pile plus a
--   PDF could not be stored.
--
-- Safety:
--   Widens a check. Existing rows already satisfy position >= 0 AND position < 40.
--
-- Reverse migration (document only — do not run if any card has position >= 10):
--   ALTER TABLE social_card_scraps DROP CONSTRAINT IF EXISTS social_card_scraps_position_check;
--   ALTER TABLE social_card_scraps
--     ADD CONSTRAINT social_card_scraps_position_check
--     CHECK (position >= 0 AND position < 10);
-- ============================================================================

ALTER TABLE social_card_scraps
  DROP CONSTRAINT IF EXISTS social_card_scraps_position_check;

ALTER TABLE social_card_scraps
  ADD CONSTRAINT social_card_scraps_position_check
  CHECK (position >= 0 AND position < 40);
