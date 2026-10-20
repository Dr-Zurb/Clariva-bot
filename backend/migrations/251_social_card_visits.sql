-- ============================================================================
-- 251_social_card_visits.sql
-- social-assist · soc-12
-- Date: 2026-10-11
-- ============================================================================
-- Purpose:
--   How many bookings started from this card's page code. The count is a
--   number. The card does not store a patient, a phone, or an appointment.
--
-- Safety:
--   Additive. Existing cards start at 0. Deleting an appointment does not
--   rewind the count.
--
-- Reverse migration (document only):
--   ALTER TABLE social_cards DROP CONSTRAINT IF EXISTS social_cards_visit_count_nonnegative;
--   ALTER TABLE social_cards DROP COLUMN IF EXISTS visit_count;
-- ============================================================================

ALTER TABLE social_cards
  ADD COLUMN IF NOT EXISTS visit_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN social_cards.visit_count IS
  'soc-12: bookings from this card code. A number. No patient and no appointment id.';

ALTER TABLE social_cards
  DROP CONSTRAINT IF EXISTS social_cards_visit_count_nonnegative;

ALTER TABLE social_cards
  ADD CONSTRAINT social_cards_visit_count_nonnegative
  CHECK (visit_count >= 0);
