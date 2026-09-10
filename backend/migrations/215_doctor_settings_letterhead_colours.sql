-- ============================================================================
-- 215_doctor_settings_letterhead_colours.sql
-- clinic-branding — chrome (header+footer) and patient-block colours.
-- Date:    2026-08-25
-- ============================================================================
-- Purpose:
--   Three independently adjustable hex colours:
--     letterhead_chrome_color  — header + footer text
--     letterhead_patient_color — patient-details text
--     letterhead_accent_color  — already exists; Rx and section labels
--   Registration number is still not a column (BRD-D2).
--
-- Safety:
--   Additive columns + CHECK rewrite. Idempotent. Reverse at file foot.
-- ============================================================================

ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS letterhead_chrome_color TEXT NULL;

ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS letterhead_patient_color TEXT NULL;

ALTER TABLE doctor_settings
  DROP CONSTRAINT IF EXISTS doctor_settings_letterhead_chrome_color_check;
ALTER TABLE doctor_settings
  ADD CONSTRAINT doctor_settings_letterhead_chrome_color_check
  CHECK (
    letterhead_chrome_color IS NULL
    OR letterhead_chrome_color ~ '^#[0-9A-Fa-f]{6}$'
  );

ALTER TABLE doctor_settings
  DROP CONSTRAINT IF EXISTS doctor_settings_letterhead_patient_color_check;
ALTER TABLE doctor_settings
  ADD CONSTRAINT doctor_settings_letterhead_patient_color_check
  CHECK (
    letterhead_patient_color IS NULL
    OR letterhead_patient_color ~ '^#[0-9A-Fa-f]{6}$'
  );

COMMENT ON COLUMN doctor_settings.letterhead_chrome_color IS
  'clinic-branding colours. Header + footer text. #RRGGBB or NULL (falls back to #000000).';
COMMENT ON COLUMN doctor_settings.letterhead_patient_color IS
  'clinic-branding colours. Patient-details text. #RRGGBB or NULL (falls back to #000000).';

-- ============================================================================
-- Reverse migration (manual):
--
--   ALTER TABLE doctor_settings
--     DROP CONSTRAINT IF EXISTS doctor_settings_letterhead_patient_color_check;
--   ALTER TABLE doctor_settings
--     DROP CONSTRAINT IF EXISTS doctor_settings_letterhead_chrome_color_check;
--   ALTER TABLE doctor_settings DROP COLUMN IF EXISTS letterhead_patient_color;
--   ALTER TABLE doctor_settings DROP COLUMN IF EXISTS letterhead_chrome_color;
-- ============================================================================
