-- ============================================================================
-- 259_social_card_scraps.sql
-- social-assist
-- Date: 2026-10-14
-- ============================================================================
-- Purpose:
--   A thought can hold up to ten reference files. They are not the piece
--   that posts. The object key stays out of the card response and out of
--   the logs. Ready still uses social_cards.file_path.
--
-- Reverse migration (document only):
--   DROP TABLE IF EXISTS social_card_scraps;
-- ============================================================================

CREATE TABLE IF NOT EXISTS social_card_scraps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id     UUID NOT NULL REFERENCES social_cards(id) ON DELETE CASCADE,
  file_path   TEXT NOT NULL CHECK (char_length(file_path) BETWEEN 1 AND 300),
  position    INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0 AND position < 10),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS social_card_scraps_card_idx
  ON social_card_scraps (card_id, position);

COMMENT ON TABLE social_card_scraps IS
  'Reference files on a social card. Do not log file_path.';

ALTER TABLE social_card_scraps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS social_card_scraps_owner_select ON social_card_scraps;
CREATE POLICY social_card_scraps_owner_select
  ON social_card_scraps FOR SELECT
  USING (doctor_id = auth.uid());

DROP POLICY IF EXISTS social_card_scraps_owner_modify ON social_card_scraps;
CREATE POLICY social_card_scraps_owner_modify
  ON social_card_scraps FOR ALL
  USING (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());
