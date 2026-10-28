-- ============================================================================
-- 266_social_card_posted_by_hand.sql
-- social-assist
-- Date: 2026-10-26
-- ============================================================================
-- Purpose:
--   A card the doctor posts from the phone can leave the board without an
--   Instagram URL. The file and the time stay on the row.
--
-- Safety:
--   Relaxes the posted-URL check only. A non-posted card still cannot
--   store a URL.
--
-- Reverse migration (document only):
--   ALTER TABLE social_cards DROP CONSTRAINT IF EXISTS social_cards_posted_has_url;
--   ALTER TABLE social_cards ADD CONSTRAINT social_cards_posted_has_url
--     CHECK (
--       (stage = 'posted' AND instagram_url IS NOT NULL AND char_length(instagram_url) BETWEEN 1 AND 500)
--       OR (stage <> 'posted' AND instagram_url IS NULL)
--     );
-- ============================================================================

ALTER TABLE social_cards
  DROP CONSTRAINT IF EXISTS social_cards_posted_has_url;

ALTER TABLE social_cards
  ADD CONSTRAINT social_cards_posted_has_url
  CHECK (
    (
      stage = 'posted'
      AND (
        instagram_url IS NULL
        OR char_length(instagram_url) BETWEEN 1 AND 500
      )
    )
    OR (stage <> 'posted' AND instagram_url IS NULL)
  );
