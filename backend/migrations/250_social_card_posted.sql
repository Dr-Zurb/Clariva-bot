-- ============================================================================
-- 250_social_card_posted.sql
-- social-assist · soc-11
-- Date: 2026-10-11
-- ============================================================================
-- Purpose:
--   A phone post comes home when the doctor pastes the Instagram URL.
--   The card leaves Ready and Schedule. Halo Aid does not fetch the post.
--
-- Safety:
--   Additive column. The URL is public, but it can carry words the doctor
--   wrote. Do not log it. Do not call Instagram.
--
-- Reverse migration (document only):
--   ALTER TABLE social_cards DROP CONSTRAINT IF EXISTS social_cards_posted_has_url;
--   ALTER TABLE social_cards DROP COLUMN IF EXISTS instagram_url;
--   ALTER TABLE social_cards DROP CONSTRAINT IF EXISTS social_cards_stage_check;
--   ALTER TABLE social_cards ADD CONSTRAINT social_cards_stage_check
--     CHECK (stage IN ('thoughts', 'chosen', 'making', 'ready'));
-- ============================================================================

DO $$
DECLARE
  existing text;
BEGIN
  FOR existing IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'social_cards'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) LIKE '%stage IN (%'
  LOOP
    EXECUTE format('ALTER TABLE social_cards DROP CONSTRAINT %I', existing);
  END LOOP;
END $$;

ALTER TABLE social_cards
  ADD CONSTRAINT social_cards_stage_check
  CHECK (stage IN ('thoughts', 'chosen', 'making', 'ready', 'posted'));

ALTER TABLE social_cards
  ADD COLUMN IF NOT EXISTS instagram_url TEXT NULL;

COMMENT ON COLUMN social_cards.instagram_url IS
  'soc-11: pasted Instagram URL. Do not log this value. Do not fetch it.';

ALTER TABLE social_cards
  DROP CONSTRAINT IF EXISTS social_cards_posted_has_url;

ALTER TABLE social_cards
  ADD CONSTRAINT social_cards_posted_has_url
  CHECK (
    (
      stage = 'posted'
      AND instagram_url IS NOT NULL
      AND char_length(instagram_url) BETWEEN 1 AND 500
    )
    OR (stage <> 'posted' AND instagram_url IS NULL)
  );
