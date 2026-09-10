-- ============================================================================
-- 217_doctor_settings_drop_minimal_patient.sql
-- clinic-branding — drop unused `minimal` patient-identity preset.
-- Date:    2026-08-25
-- ============================================================================
-- Purpose:
--   Name-and-date-only was not a useful Rx block. Fold existing rows to
--   open_letter and tighten the CHECK.
--
-- Safety:
--   UPDATE then DROP/ADD CONSTRAINT. Idempotent. Reverse at file foot.
-- ============================================================================

UPDATE doctor_settings
SET patient_identity_preset = 'open_letter'
WHERE patient_identity_preset = 'minimal';

ALTER TABLE doctor_settings
  DROP CONSTRAINT IF EXISTS doctor_settings_patient_identity_preset_check;

ALTER TABLE doctor_settings
  ADD CONSTRAINT doctor_settings_patient_identity_preset_check
  CHECK (patient_identity_preset IN ('open_letter', 'compact', 'grid'));

COMMENT ON COLUMN doctor_settings.patient_identity_preset IS
  'clinic-branding tokens. open_letter | compact | grid patient block.';

-- ============================================================================
-- Reverse migration (manual):
--
--   ALTER TABLE doctor_settings
--     DROP CONSTRAINT IF EXISTS doctor_settings_patient_identity_preset_check;
--   ALTER TABLE doctor_settings
--     ADD CONSTRAINT doctor_settings_patient_identity_preset_check
--     CHECK (patient_identity_preset IN ('open_letter', 'compact', 'minimal', 'grid'));
-- ============================================================================
