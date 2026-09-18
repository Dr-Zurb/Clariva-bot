-- ============================================================================
-- 219_letterhead_background_opacity_floor.sql
-- clinic-branding — allow background opacity down to 0%.
-- Date:    2026-08-25
-- ============================================================================
-- Purpose:
--   218 floored opacity at 8%. Doctors need fainter watermarks.
--   Rewrite the CHECK only. No new columns.
--
-- Safety:
--   DROP/ADD CONSTRAINT. Idempotent. Reverse at file foot.
-- ============================================================================

ALTER TABLE doctor_settings
  DROP CONSTRAINT IF EXISTS doctor_settings_letterhead_background_opacity_check;

ALTER TABLE doctor_settings
  ADD CONSTRAINT doctor_settings_letterhead_background_opacity_check
  CHECK (
    letterhead_background_opacity >= 0
    AND letterhead_background_opacity <= 40
  );

COMMENT ON COLUMN doctor_settings.letterhead_background_opacity IS
  'clinic-branding. Background opacity percent (0–40). Default 15.';

-- ============================================================================
-- Reverse migration (manual):
--
--   UPDATE doctor_settings SET letterhead_background_opacity = 8
--     WHERE letterhead_background_opacity < 8;
--   ALTER TABLE doctor_settings
--     DROP CONSTRAINT IF EXISTS doctor_settings_letterhead_background_opacity_check;
--   ALTER TABLE doctor_settings
--     ADD CONSTRAINT doctor_settings_letterhead_background_opacity_check
--     CHECK (
--       letterhead_background_opacity >= 8
--       AND letterhead_background_opacity <= 40
--     );
-- ============================================================================
