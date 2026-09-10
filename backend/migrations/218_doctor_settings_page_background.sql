-- ============================================================================
-- 218_doctor_settings_page_background.sql
-- clinic-branding — full-page letterhead background photo.
-- Date:    2026-08-25
-- ============================================================================
-- Purpose:
--   Additive page-background tokens. Images live in `clinic-branding`
--   (migration 212) at `{doctor_id}/background.{png|jpg}`. Built-in
--   presets (`paper`, `cross`) are repo assets, not Storage objects.
--   Preprinted pads ignore the background at render time.
--
--   Paths are Storage object keys, never URLs. Registration number is
--   still not a column (BRD-D2).
--
-- Safety:
--   Additive columns + CHECK rewrite. Idempotent. Reverse at file foot.
-- ============================================================================

ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS background_path TEXT NULL;

ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS background_version INTEGER NOT NULL DEFAULT 0;

ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS letterhead_background_preset TEXT NOT NULL DEFAULT 'none';

ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS letterhead_background_opacity INTEGER NOT NULL DEFAULT 15;

ALTER TABLE doctor_settings
  DROP CONSTRAINT IF EXISTS doctor_settings_background_version_check;
ALTER TABLE doctor_settings
  ADD CONSTRAINT doctor_settings_background_version_check
  CHECK (background_version >= 0);

ALTER TABLE doctor_settings
  DROP CONSTRAINT IF EXISTS doctor_settings_letterhead_background_preset_check;
ALTER TABLE doctor_settings
  ADD CONSTRAINT doctor_settings_letterhead_background_preset_check
  CHECK (letterhead_background_preset IN ('none', 'paper', 'cross', 'upload'));

ALTER TABLE doctor_settings
  DROP CONSTRAINT IF EXISTS doctor_settings_letterhead_background_opacity_check;
ALTER TABLE doctor_settings
  ADD CONSTRAINT doctor_settings_letterhead_background_opacity_check
  CHECK (
    letterhead_background_opacity >= 8
    AND letterhead_background_opacity <= 40
  );

COMMENT ON COLUMN doctor_settings.background_path IS
  'clinic-branding. Storage key for uploaded page background. Never a URL.';
COMMENT ON COLUMN doctor_settings.letterhead_background_preset IS
  'clinic-branding. none | paper | cross | upload. Ignored on preprinted.';
COMMENT ON COLUMN doctor_settings.letterhead_background_opacity IS
  'clinic-branding. Background opacity percent (8–40). Default 15.';

-- ============================================================================
-- Reverse migration (manual):
--
--   ALTER TABLE doctor_settings
--     DROP CONSTRAINT IF EXISTS doctor_settings_letterhead_background_opacity_check;
--   ALTER TABLE doctor_settings
--     DROP CONSTRAINT IF EXISTS doctor_settings_letterhead_background_preset_check;
--   ALTER TABLE doctor_settings
--     DROP CONSTRAINT IF EXISTS doctor_settings_background_version_check;
--   ALTER TABLE doctor_settings DROP COLUMN IF EXISTS letterhead_background_opacity;
--   ALTER TABLE doctor_settings DROP COLUMN IF EXISTS letterhead_background_preset;
--   ALTER TABLE doctor_settings DROP COLUMN IF EXISTS background_version;
--   ALTER TABLE doctor_settings DROP COLUMN IF EXISTS background_path;
-- ============================================================================
