-- ============================================================================
-- 263_social_card_analytics.sql
-- social-assist · phase 9
-- Date: 2026-10-19
-- ============================================================================
-- Purpose:
--   Remember which Instagram post a send created, keep a small picture after
--   the file is removed, and remember the day of a booking from the card's
--   page link. The day row has no patient, no phone, and is not returned
--   with an appointment id.
--
-- Safety:
--   Additive. Existing cards stay as they are. A missing picture stays missing.
--
-- Reverse migration (document only):
--   DROP TABLE IF EXISTS social_card_link_bookings;
--   ALTER TABLE social_cards DROP COLUMN IF EXISTS thumb_path;
--   ALTER TABLE social_cards DROP COLUMN IF EXISTS instagram_media_id;
-- ============================================================================

ALTER TABLE social_cards
  ADD COLUMN IF NOT EXISTS instagram_media_id TEXT;

ALTER TABLE social_cards
  ADD COLUMN IF NOT EXISTS thumb_path TEXT;

COMMENT ON COLUMN social_cards.instagram_media_id IS
  'Phase 9: Instagram media id for a send. Not logged. Not on the card response.';

COMMENT ON COLUMN social_cards.thumb_path IS
  'Phase 9: object key of the small picture kept after send. Not logged.';

CREATE TABLE IF NOT EXISTS social_card_link_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES social_cards(id) ON DELETE CASCADE,
  booked_on DATE NOT NULL,
  appointment_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS social_card_link_bookings_appointment_idx
  ON social_card_link_bookings (appointment_id)
  WHERE appointment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS social_card_link_bookings_doctor_day_idx
  ON social_card_link_bookings (doctor_id, booked_on);

COMMENT ON TABLE social_card_link_bookings IS
  'Phase 9: one row per booking from a card page link. appointment_id dedupes and is never returned.';

ALTER TABLE social_card_link_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS social_card_link_bookings_select_own ON social_card_link_bookings;
CREATE POLICY social_card_link_bookings_select_own
  ON social_card_link_bookings FOR SELECT
  USING (doctor_id = auth.uid());
