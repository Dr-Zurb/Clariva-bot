-- ============================================================================
-- 221_doctor_settings_text_size.sql
-- clinic-branding — header / patient / body text size tokens.
-- Date:    2026-08-25
-- ============================================================================
-- Purpose:
--   Additive small | medium | large tokens. Medium matches current type.
--   Registration number is still not a column (BRD-D2).
--
-- Safety:
--   Additive columns + CHECK. Idempotent. Reverse at file foot.
-- ============================================================================

ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS letterhead_header_text_size TEXT NOT NULL DEFAULT 'medium';

ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS letterhead_patient_text_size TEXT NOT NULL DEFAULT 'medium';

ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS letterhead_body_text_size TEXT NOT NULL DEFAULT 'medium';

ALTER TABLE doctor_settings
  DROP CONSTRAINT IF EXISTS doctor_settings_letterhead_header_text_size_check;
ALTER TABLE doctor_settings
  ADD CONSTRAINT doctor_settings_letterhead_header_text_size_check
  CHECK (letterhead_header_text_size IN ('small', 'medium', 'large'));

ALTER TABLE doctor_settings
  DROP CONSTRAINT IF EXISTS doctor_settings_letterhead_patient_text_size_check;
ALTER TABLE doctor_settings
  ADD CONSTRAINT doctor_settings_letterhead_patient_text_size_check
  CHECK (letterhead_patient_text_size IN ('small', 'medium', 'large'));

ALTER TABLE doctor_settings
  DROP CONSTRAINT IF EXISTS doctor_settings_letterhead_body_text_size_check;
ALTER TABLE doctor_settings
  ADD CONSTRAINT doctor_settings_letterhead_body_text_size_check
  CHECK (letterhead_body_text_size IN ('small', 'medium', 'large'));

COMMENT ON COLUMN doctor_settings.letterhead_header_text_size IS
  'clinic-branding. Header identity type: small | medium | large.';
COMMENT ON COLUMN doctor_settings.letterhead_patient_text_size IS
  'clinic-branding. Patient-block type: small | medium | large.';
COMMENT ON COLUMN doctor_settings.letterhead_body_text_size IS
  'clinic-branding. Rx and section type: small | medium | large.';

-- ============================================================================
-- Reverse migration (manual):
--
--   ALTER TABLE doctor_settings
--     DROP CONSTRAINT IF EXISTS doctor_settings_letterhead_body_text_size_check;
--   ALTER TABLE doctor_settings
--     DROP CONSTRAINT IF EXISTS doctor_settings_letterhead_patient_text_size_check;
--   ALTER TABLE doctor_settings
--     DROP CONSTRAINT IF EXISTS doctor_settings_letterhead_header_text_size_check;
--   ALTER TABLE doctor_settings DROP COLUMN IF EXISTS letterhead_body_text_size;
--   ALTER TABLE doctor_settings DROP COLUMN IF EXISTS letterhead_patient_text_size;
--   ALTER TABLE doctor_settings DROP COLUMN IF EXISTS letterhead_header_text_size;
-- ============================================================================
