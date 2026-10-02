-- ============================================================================
-- 241_doctor_settings_public_slug.sql
-- Stable public booking path for a practice (/d/:slug).
-- Date:    2026-09-23
-- ============================================================================
-- Purpose:
--   One URL-safe slug per practice. NULL until the app fills it. Unique
--   among non-null values. Not PHI. Existing doctor_settings RLS covers
--   the row; this migration adds no policy.
--
-- Pattern:
--   Additive nullable TEXT. Partial unique index. Check on shape.
--   No backfill — the settings read fills a missing slug.
--
-- Safety:
--   Additive. Re-run safe (IF NOT EXISTS).
--
-- Reverse migration (document only):
--   ALTER TABLE doctor_settings DROP CONSTRAINT IF EXISTS doctor_settings_public_slug_check;
--   DROP INDEX IF EXISTS doctor_settings_public_slug_uidx;
--   ALTER TABLE doctor_settings DROP COLUMN IF EXISTS public_slug;
-- ============================================================================

ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS public_slug TEXT NULL;

COMMENT ON COLUMN doctor_settings.public_slug IS
  'Public booking path segment (/d/:slug). Unique, URL-safe, not PHI. NULL until filled.';

CREATE UNIQUE INDEX IF NOT EXISTS doctor_settings_public_slug_uidx
  ON doctor_settings (public_slug)
  WHERE public_slug IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'doctor_settings_public_slug_check'
  ) THEN
    ALTER TABLE doctor_settings
      ADD CONSTRAINT doctor_settings_public_slug_check
      CHECK (
        public_slug IS NULL
        OR public_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      );
  END IF;
END $$;
