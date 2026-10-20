-- ============================================================================
-- 253_social_card_bin.sql
-- social-assist
-- Date: 2026-10-12
-- ============================================================================
-- Purpose:
--   A deleted card stays for 30 days, then the service removes the row and
--   its file. The file stays while the card is in the bin so it can be put back.
--
-- Safety:
--   Additive. Re-run safe.
--
-- Reverse migration (document only):
--   ALTER TABLE social_cards DROP COLUMN IF EXISTS deleted_at;
-- ============================================================================

ALTER TABLE social_cards
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS social_cards_doctor_deleted_idx
  ON social_cards (doctor_id, deleted_at)
  WHERE deleted_at IS NOT NULL;

COMMENT ON COLUMN social_cards.deleted_at IS
  'Set when the doctor deletes the card. The service removes the row 30 days later. Do not log the title.';
