-- ============================================================================
-- Doctor settings subjective custom subsections default (per-doctor template)
-- ============================================================================
-- Migration: 145_doctor_settings_subjective_custom_subsections.sql
-- Date:      2026-06-17
-- Batch:     subjective-tab (Phase 7) — task subj-21
-- Description:
--   Per-doctor default custom-subsection headings/structure for seed-on-empty
--   on fresh visits (P7-D4/D5). Same depth-2 tree shape as
--   prescriptions.custom_subsections (subj-19). Doctor-authored config only.
--
-- PHI:
--   Column holds doctor headings/structure, not patient data. RLS on
--   doctor_settings already covers all columns (migration 009). No new policies.
--
-- Idempotency:
--   ADD COLUMN IF NOT EXISTS; constraint drop+add.
--
-- Rollback (documented only):
--   ALTER TABLE doctor_settings
--     DROP CONSTRAINT IF EXISTS doctor_settings_subjective_custom_subsections_is_array,
--     DROP COLUMN IF EXISTS subjective_custom_subsections;
-- ============================================================================

ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS subjective_custom_subsections JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE doctor_settings
  DROP CONSTRAINT IF EXISTS doctor_settings_subjective_custom_subsections_is_array;
ALTER TABLE doctor_settings
  ADD CONSTRAINT doctor_settings_subjective_custom_subsections_is_array
  CHECK (jsonb_typeof(subjective_custom_subsections) = 'array');

COMMENT ON COLUMN doctor_settings.subjective_custom_subsections IS
  'subj-21: per-doctor default custom subjective subsections (depth-2 tree). Seeds fresh visits when empty; never overwrites saved prescriptions.';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- RLS unchanged: doctor-only access via doctor_settings ownership (migration 009).
-- ============================================================================
