-- ============================================================================
-- 220_doctor_settings_image_fit.sql
-- clinic-branding — fit / fill / stretch for header, footer, background.
-- Date:    2026-08-25
-- ============================================================================
-- Purpose:
--   Additive tokens. Header/footer default `stretch` (current band
--   behaviour). Background default `fill` (current cover). Registration
--   number is still not a column (BRD-D2).
--
-- Safety:
--   Additive columns + CHECK. Idempotent. Reverse at file foot.
-- ============================================================================

ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS letterhead_header_fit TEXT NOT NULL DEFAULT 'stretch';

ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS letterhead_footer_fit TEXT NOT NULL DEFAULT 'stretch';

ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS letterhead_background_fit TEXT NOT NULL DEFAULT 'fill';

ALTER TABLE doctor_settings
  DROP CONSTRAINT IF EXISTS doctor_settings_letterhead_header_fit_check;
ALTER TABLE doctor_settings
  ADD CONSTRAINT doctor_settings_letterhead_header_fit_check
  CHECK (letterhead_header_fit IN ('fit', 'fill', 'stretch'));

ALTER TABLE doctor_settings
  DROP CONSTRAINT IF EXISTS doctor_settings_letterhead_footer_fit_check;
ALTER TABLE doctor_settings
  ADD CONSTRAINT doctor_settings_letterhead_footer_fit_check
  CHECK (letterhead_footer_fit IN ('fit', 'fill', 'stretch'));

ALTER TABLE doctor_settings
  DROP CONSTRAINT IF EXISTS doctor_settings_letterhead_background_fit_check;
ALTER TABLE doctor_settings
  ADD CONSTRAINT doctor_settings_letterhead_background_fit_check
  CHECK (letterhead_background_fit IN ('fit', 'fill', 'stretch'));

COMMENT ON COLUMN doctor_settings.letterhead_header_fit IS
  'clinic-branding. Banner header photo: fit | fill | stretch.';
COMMENT ON COLUMN doctor_settings.letterhead_footer_fit IS
  'clinic-branding. Banner footer photo: fit | fill | stretch.';
COMMENT ON COLUMN doctor_settings.letterhead_background_fit IS
  'clinic-branding. Page background photo: fit | fill | stretch.';

-- ============================================================================
-- Reverse migration (manual):
--
--   ALTER TABLE doctor_settings
--     DROP CONSTRAINT IF EXISTS doctor_settings_letterhead_background_fit_check;
--   ALTER TABLE doctor_settings
--     DROP CONSTRAINT IF EXISTS doctor_settings_letterhead_footer_fit_check;
--   ALTER TABLE doctor_settings
--     DROP CONSTRAINT IF EXISTS doctor_settings_letterhead_header_fit_check;
--   ALTER TABLE doctor_settings DROP COLUMN IF EXISTS letterhead_background_fit;
--   ALTER TABLE doctor_settings DROP COLUMN IF EXISTS letterhead_footer_fit;
--   ALTER TABLE doctor_settings DROP COLUMN IF EXISTS letterhead_header_fit;
-- ============================================================================
