-- ============================================================================
-- 249_social_card_link.sql
-- social-assist · soc-10
-- Date: 2026-10-11
-- ============================================================================
-- Purpose:
--   A durable code on the doctor's own card. It is not a chat code.
--   Chat codes stay on visit_page_links and still expire. This column
--   has no expiry and no conversation. Deleting the card retires the code.
--
-- Safety:
--   Additive. The value is a capability. Do not log it.
--
-- Reverse migration (document only):
--   DROP INDEX IF EXISTS social_cards_link_code_idx;
--   ALTER TABLE social_cards DROP COLUMN IF EXISTS link_code;
-- ============================================================================

ALTER TABLE social_cards
  ADD COLUMN IF NOT EXISTS link_code TEXT NULL;

COMMENT ON COLUMN social_cards.link_code IS
  'soc-10: durable page code for this card. Capability. Do not log this value.';

CREATE UNIQUE INDEX IF NOT EXISTS social_cards_link_code_idx
  ON social_cards (link_code)
  WHERE link_code IS NOT NULL;
