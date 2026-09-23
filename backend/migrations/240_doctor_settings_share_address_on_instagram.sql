-- ============================================================================
-- 240_doctor_settings_share_address_on_instagram.sql
-- Practice address may stay on the letterhead without being spoken on Instagram.
-- Date:    2026-09-23
-- ============================================================================
-- Purpose:
--   address_summary is the letterhead line. NULL on this flag means the old
--   rule: speak that line on Instagram when it is non-empty. false keeps the
--   letterhead and withholds the street from DMs, comments, and the model.
--   true speaks it. New practices save false until the doctor opts in.
--
-- Pattern:
--   Additive nullable BOOLEAN on doctor_settings. No DEFAULT — NULL is the
--   legacy "share if an address is saved" state. No backfill. No index.
--   No RLS change — existing doctor_settings policies cover the row.
--
-- Safety:
--   Purely additive. Re-run safe (IF NOT EXISTS).
--
-- Rollback (document only):
--   ALTER TABLE doctor_settings
--     DROP COLUMN IF EXISTS share_address_on_instagram;
-- ============================================================================

ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS share_address_on_instagram BOOLEAN NULL;

COMMENT ON COLUMN doctor_settings.share_address_on_instagram IS
  'When false, address_summary stays on the letterhead and is not sent on Instagram. NULL keeps the previous rule: share when address_summary is set.';
