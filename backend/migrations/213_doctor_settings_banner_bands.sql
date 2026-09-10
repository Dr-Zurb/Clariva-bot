-- ============================================================================
-- 213_doctor_settings_banner_bands.sql
-- clinic-branding Phase 2 — banner header/footer photo bands.
-- Date:    2026-08-24
-- ============================================================================
-- Purpose:
--   Additive header/footer storage pointers + band heights for the
--   `banner` letterhead preset. Images live in the existing
--   `clinic-branding` bucket (migration 212) at
--   `{doctor_id}/header.{png|jpg}` and `{doctor_id}/footer.{png|jpg}`.
--   212's first-folder-segment RLS already covers those keys — no new
--   bucket or policy.
--
--   Paths are Storage object keys, never URLs. Versions bump on every
--   successful register so the in-process byte cache invalidates.
--
--   Registration number is still not a column (BRD-D2).
--
-- Safety:
--   · Additive only — new columns + CHECK rewrite.
--   · ADD COLUMN IF NOT EXISTS + DROP CONSTRAINT IF EXISTS / ADD
--     CONSTRAINT pairs make re-runs idempotent.
--   · Reverse migration documented at the file foot.
-- ============================================================================

ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS header_path TEXT NULL;

ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS header_version INTEGER NOT NULL DEFAULT 0;

ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS footer_path TEXT NULL;

ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS footer_version INTEGER NOT NULL DEFAULT 0;

ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS header_height_mm INTEGER NOT NULL DEFAULT 35;

ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS footer_height_mm INTEGER NOT NULL DEFAULT 20;

ALTER TABLE doctor_settings
  DROP CONSTRAINT IF EXISTS doctor_settings_letterhead_preset_check;
ALTER TABLE doctor_settings
  ADD CONSTRAINT doctor_settings_letterhead_preset_check
  CHECK (letterhead_preset IN ('classic', 'centred', 'preprinted', 'banner'));

ALTER TABLE doctor_settings
  DROP CONSTRAINT IF EXISTS doctor_settings_header_version_check;
ALTER TABLE doctor_settings
  ADD CONSTRAINT doctor_settings_header_version_check
  CHECK (header_version >= 0);

ALTER TABLE doctor_settings
  DROP CONSTRAINT IF EXISTS doctor_settings_footer_version_check;
ALTER TABLE doctor_settings
  ADD CONSTRAINT doctor_settings_footer_version_check
  CHECK (footer_version >= 0);

ALTER TABLE doctor_settings
  DROP CONSTRAINT IF EXISTS doctor_settings_header_height_mm_check;
ALTER TABLE doctor_settings
  ADD CONSTRAINT doctor_settings_header_height_mm_check
  CHECK (header_height_mm >= 15 AND header_height_mm <= 80);

ALTER TABLE doctor_settings
  DROP CONSTRAINT IF EXISTS doctor_settings_footer_height_mm_check;
ALTER TABLE doctor_settings
  ADD CONSTRAINT doctor_settings_footer_height_mm_check
  CHECK (footer_height_mm >= 10 AND footer_height_mm <= 60);

ALTER TABLE doctor_settings
  DROP CONSTRAINT IF EXISTS doctor_settings_banner_bands_sum_check;
ALTER TABLE doctor_settings
  ADD CONSTRAINT doctor_settings_banner_bands_sum_check
  CHECK (header_height_mm + footer_height_mm <= 100);

COMMENT ON COLUMN doctor_settings.header_path IS
  'clinic-branding Phase 2. Storage object key in bucket clinic-branding, never a URL.';
COMMENT ON COLUMN doctor_settings.header_version IS
  'clinic-branding Phase 2. Bumped on every successful header register; cache key.';
COMMENT ON COLUMN doctor_settings.footer_path IS
  'clinic-branding Phase 2. Storage object key in bucket clinic-branding, never a URL.';
COMMENT ON COLUMN doctor_settings.footer_version IS
  'clinic-branding Phase 2. Bumped on every successful footer register; cache key.';
COMMENT ON COLUMN doctor_settings.header_height_mm IS
  'clinic-branding Phase 2. Banner header band height in mm (15–80).';
COMMENT ON COLUMN doctor_settings.footer_height_mm IS
  'clinic-branding Phase 2. Banner footer band height in mm (10–60). header+footer ≤ 100.';

-- ============================================================================
-- Reverse migration (manual):
--
--   ALTER TABLE doctor_settings
--     DROP CONSTRAINT IF EXISTS doctor_settings_banner_bands_sum_check;
--   ALTER TABLE doctor_settings
--     DROP CONSTRAINT IF EXISTS doctor_settings_footer_height_mm_check;
--   ALTER TABLE doctor_settings
--     DROP CONSTRAINT IF EXISTS doctor_settings_header_height_mm_check;
--   ALTER TABLE doctor_settings
--     DROP CONSTRAINT IF EXISTS doctor_settings_footer_version_check;
--   ALTER TABLE doctor_settings
--     DROP CONSTRAINT IF EXISTS doctor_settings_header_version_check;
--   ALTER TABLE doctor_settings
--     DROP CONSTRAINT IF EXISTS doctor_settings_letterhead_preset_check;
--   ALTER TABLE doctor_settings
--     ADD CONSTRAINT doctor_settings_letterhead_preset_check
--     CHECK (letterhead_preset IN ('classic', 'centred', 'preprinted'));
--   ALTER TABLE doctor_settings DROP COLUMN IF EXISTS footer_height_mm;
--   ALTER TABLE doctor_settings DROP COLUMN IF EXISTS header_height_mm;
--   ALTER TABLE doctor_settings DROP COLUMN IF EXISTS footer_version;
--   ALTER TABLE doctor_settings DROP COLUMN IF EXISTS footer_path;
--   ALTER TABLE doctor_settings DROP COLUMN IF EXISTS header_version;
--   ALTER TABLE doctor_settings DROP COLUMN IF EXISTS header_path;
-- ============================================================================
