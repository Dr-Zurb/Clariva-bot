-- ============================================================================
-- 211_doctor_settings_branding.sql
-- clinic-branding-v1 · BRD-01 — letterhead tokens on doctor_settings.
-- Date:    2026-08-24
-- ============================================================================
-- Purpose:
--   Additive practice-letterhead columns. The existing `doctor_settings`
--   RLS (migration 009) already covers SELECT/INSERT/UPDATE own-row, so
--   this migration does not add policies.
--
--   Registration number is deliberately NOT a column here (BRD-D2). It
--   resolves at render time from `doctor_verification` when verified.
--
--   `logo_path` is a Storage object key in bucket `clinic-branding`
--   (migration 212), never a public URL. `logo_version` bumps on every
--   successful register so the in-process logo-byte cache invalidates.
--
-- Safety:
--   · Additive only — new columns, no existing object rewritten.
--   · ADD COLUMN IF NOT EXISTS + DROP CONSTRAINT IF EXISTS / ADD
--     CONSTRAINT pairs make re-runs idempotent.
--   · Reverse migration documented at the file foot.
-- ============================================================================

ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS logo_path TEXT NULL;

ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS logo_version INTEGER NOT NULL DEFAULT 0;

ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS qualifications TEXT NULL;

ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS letterhead_preset TEXT NOT NULL DEFAULT 'classic';

ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS letterhead_accent_color TEXT NULL;

ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS page_size TEXT NOT NULL DEFAULT 'a4';

ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS preprint_margin_top_mm INTEGER NOT NULL DEFAULT 40;

ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS preprint_margin_bottom_mm INTEGER NOT NULL DEFAULT 30;

ALTER TABLE doctor_settings
  DROP CONSTRAINT IF EXISTS doctor_settings_letterhead_preset_check;
ALTER TABLE doctor_settings
  ADD CONSTRAINT doctor_settings_letterhead_preset_check
  CHECK (letterhead_preset IN ('classic', 'centred', 'preprinted'));

ALTER TABLE doctor_settings
  DROP CONSTRAINT IF EXISTS doctor_settings_page_size_check;
ALTER TABLE doctor_settings
  ADD CONSTRAINT doctor_settings_page_size_check
  CHECK (page_size IN ('a4', 'a5'));

ALTER TABLE doctor_settings
  DROP CONSTRAINT IF EXISTS doctor_settings_logo_version_check;
ALTER TABLE doctor_settings
  ADD CONSTRAINT doctor_settings_logo_version_check
  CHECK (logo_version >= 0);

ALTER TABLE doctor_settings
  DROP CONSTRAINT IF EXISTS doctor_settings_preprint_margin_top_check;
ALTER TABLE doctor_settings
  ADD CONSTRAINT doctor_settings_preprint_margin_top_check
  CHECK (preprint_margin_top_mm >= 0 AND preprint_margin_top_mm <= 80);

ALTER TABLE doctor_settings
  DROP CONSTRAINT IF EXISTS doctor_settings_preprint_margin_bottom_check;
ALTER TABLE doctor_settings
  ADD CONSTRAINT doctor_settings_preprint_margin_bottom_check
  CHECK (preprint_margin_bottom_mm >= 0 AND preprint_margin_bottom_mm <= 80);

ALTER TABLE doctor_settings
  DROP CONSTRAINT IF EXISTS doctor_settings_letterhead_accent_color_check;
ALTER TABLE doctor_settings
  ADD CONSTRAINT doctor_settings_letterhead_accent_color_check
  CHECK (
    letterhead_accent_color IS NULL
    OR letterhead_accent_color ~ '^#[0-9A-Fa-f]{6}$'
  );

COMMENT ON COLUMN doctor_settings.logo_path IS
  'clinic-branding-v1. Storage object key in bucket clinic-branding, never a URL.';
COMMENT ON COLUMN doctor_settings.logo_version IS
  'clinic-branding-v1. Bumped on every successful logo register; cache key.';
COMMENT ON COLUMN doctor_settings.letterhead_preset IS
  'clinic-branding-v1. classic | centred | preprinted.';

-- ============================================================================
-- Reverse migration (manual):
--
--   ALTER TABLE doctor_settings
--     DROP CONSTRAINT IF EXISTS doctor_settings_letterhead_accent_color_check;
--   ALTER TABLE doctor_settings
--     DROP CONSTRAINT IF EXISTS doctor_settings_preprint_margin_bottom_check;
--   ALTER TABLE doctor_settings
--     DROP CONSTRAINT IF EXISTS doctor_settings_preprint_margin_top_check;
--   ALTER TABLE doctor_settings
--     DROP CONSTRAINT IF EXISTS doctor_settings_logo_version_check;
--   ALTER TABLE doctor_settings
--     DROP CONSTRAINT IF EXISTS doctor_settings_page_size_check;
--   ALTER TABLE doctor_settings
--     DROP CONSTRAINT IF EXISTS doctor_settings_letterhead_preset_check;
--   ALTER TABLE doctor_settings DROP COLUMN IF EXISTS preprint_margin_bottom_mm;
--   ALTER TABLE doctor_settings DROP COLUMN IF EXISTS preprint_margin_top_mm;
--   ALTER TABLE doctor_settings DROP COLUMN IF EXISTS page_size;
--   ALTER TABLE doctor_settings DROP COLUMN IF EXISTS letterhead_accent_color;
--   ALTER TABLE doctor_settings DROP COLUMN IF EXISTS letterhead_preset;
--   ALTER TABLE doctor_settings DROP COLUMN IF EXISTS qualifications;
--   ALTER TABLE doctor_settings DROP COLUMN IF EXISTS logo_version;
--   ALTER TABLE doctor_settings DROP COLUMN IF EXISTS logo_path;
-- ============================================================================
