-- ============================================================================
-- 244_availability_visit_types.sql
-- Weekly availability blocks can cover in-clinic, video, voice, and text.
-- Date:    2026-09-24
-- ============================================================================
-- Purpose:
--   One row stays one day and time range. The four flags say which visit
--   types a patient can book inside that range. Existing rows stay open
--   for every type until a doctor turns one off.
--
-- Safety:
--   Additive. NOT NULL with default true. Re-run safe (IF NOT EXISTS).
--   No PHI.
--
-- Reverse migration (document only):
--   ALTER TABLE availability DROP COLUMN IF EXISTS in_clinic;
--   ALTER TABLE availability DROP COLUMN IF EXISTS video;
--   ALTER TABLE availability DROP COLUMN IF EXISTS voice;
--   ALTER TABLE availability DROP COLUMN IF EXISTS text;
-- ============================================================================

ALTER TABLE availability
  ADD COLUMN IF NOT EXISTS in_clinic BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE availability
  ADD COLUMN IF NOT EXISTS video BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE availability
  ADD COLUMN IF NOT EXISTS voice BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE availability
  ADD COLUMN IF NOT EXISTS text BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN availability.in_clinic IS
  'Patient can book an in-clinic visit inside this weekly block.';
COMMENT ON COLUMN availability.video IS
  'Patient can book a video visit inside this weekly block.';
COMMENT ON COLUMN availability.voice IS
  'Patient can book a voice visit inside this weekly block.';
COMMENT ON COLUMN availability.text IS
  'Patient can book a text visit inside this weekly block.';
