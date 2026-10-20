-- ============================================================================
-- 260_social_card_links.sql
-- social-assist
-- Date: 2026-10-14
-- ============================================================================
-- Purpose:
--   A thought can keep up to ten inspiration links beside its files.
--   The values stay out of the logs. The first link is also source_url
--   so the board mark still works.
--
-- Reverse migration (document only):
--   ALTER TABLE social_cards DROP COLUMN IF EXISTS resource_links;
-- ============================================================================

ALTER TABLE social_cards
  ADD COLUMN IF NOT EXISTS resource_links JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN social_cards.resource_links IS
  'Inspiration links on a social card. Do not log the values.';
