-- ============================================================================
-- 232_doctor_settings_social_enquiries.sql
-- clinic-path P2 — do patients message this doctor on Instagram / Facebook?
-- Date:    2026-09-12
-- ============================================================================
-- Purpose:
--   Additive preference on the existing doctor_settings row. 'yes' keeps
--   today's Instagram-required go-live. 'not_yet' makes Instagram optional.
--   DEFAULT 'yes' backfills every existing row so live checklists do not change.
--
-- Safety:
--   Additive column + CHECK. Idempotent. No new RLS (inherits 009).
--   Practice preference only — not PHI. Reverse at file foot.
-- ============================================================================

ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS social_enquiries TEXT NOT NULL DEFAULT 'yes';

ALTER TABLE doctor_settings
  DROP CONSTRAINT IF EXISTS doctor_settings_social_enquiries_check;
ALTER TABLE doctor_settings
  ADD CONSTRAINT doctor_settings_social_enquiries_check
  CHECK (social_enquiries IN ('yes', 'not_yet'));

COMMENT ON COLUMN doctor_settings.social_enquiries IS
  'clinic-path P2. yes | not_yet. Whether patients message this doctor on Instagram or Facebook. Default yes so existing accounts keep Instagram required.';

-- ============================================================================
-- Reverse migration (manual):
--
--   ALTER TABLE doctor_settings
--     DROP CONSTRAINT IF EXISTS doctor_settings_social_enquiries_check;
--   ALTER TABLE doctor_settings DROP COLUMN IF EXISTS social_enquiries;
-- ============================================================================
