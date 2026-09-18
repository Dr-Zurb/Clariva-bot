-- ============================================================================
-- 216_doctor_settings_patient_grid.sql
-- clinic-branding — add `grid` patient-identity preset (hospital chart cells).
-- Date:    2026-08-25
-- ============================================================================
-- Purpose:
--   Extend patient_identity_preset CHECK to include `grid`.
--   No new columns. Registration number is still not a column (BRD-D2).
--
-- Safety:
--   DROP/ADD CONSTRAINT is idempotent. Reverse at file foot.
-- ============================================================================

ALTER TABLE doctor_settings
  DROP CONSTRAINT IF EXISTS doctor_settings_patient_identity_preset_check;

ALTER TABLE doctor_settings
  ADD CONSTRAINT doctor_settings_patient_identity_preset_check
  CHECK (patient_identity_preset IN ('open_letter', 'compact', 'minimal', 'grid'));

COMMENT ON COLUMN doctor_settings.patient_identity_preset IS
  'clinic-branding tokens. open_letter | compact | minimal | grid patient block.';

-- ============================================================================
-- Reverse migration (manual):
--
--   UPDATE doctor_settings SET patient_identity_preset = 'open_letter'
--     WHERE patient_identity_preset = 'grid';
--   ALTER TABLE doctor_settings
--     DROP CONSTRAINT IF EXISTS doctor_settings_patient_identity_preset_check;
--   ALTER TABLE doctor_settings
--     ADD CONSTRAINT doctor_settings_patient_identity_preset_check
--     CHECK (patient_identity_preset IN ('open_letter', 'compact', 'minimal'));
-- ============================================================================
