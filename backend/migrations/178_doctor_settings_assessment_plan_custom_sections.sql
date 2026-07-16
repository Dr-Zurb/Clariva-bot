-- ============================================================================
-- Doctor settings Assessment + Plan custom sections defaults (per-doctor template)
-- ============================================================================
-- Migration: 178_doctor_settings_assessment_plan_custom_sections.sql
-- Date:      2026-07-14
-- Batch:     assessment-plan-custom-sections — mirrors subjective default (145).
-- Description:
--   Per-doctor default custom-section headings/structure for seed-on-empty on
--   fresh visits. Same depth-2 tree shape as
--   prescriptions.assessment_custom_sections / plan_custom_sections (migration
--   177) and prescriptions.custom_subsections (subj-19). Doctor-authored config
--   only.
--
-- PHI:
--   Columns hold doctor headings/structure, not patient data. RLS on
--   doctor_settings already covers all columns (migration 009). No new policies.
--
-- Idempotency:
--   ADD COLUMN IF NOT EXISTS; constraint drop+add.
--
-- Rollback (documented only):
--   ALTER TABLE doctor_settings
--     DROP CONSTRAINT IF EXISTS doctor_settings_assessment_custom_sections_is_array,
--     DROP CONSTRAINT IF EXISTS doctor_settings_plan_custom_sections_is_array,
--     DROP COLUMN IF EXISTS assessment_custom_sections,
--     DROP COLUMN IF EXISTS plan_custom_sections;
-- ============================================================================

ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS assessment_custom_sections JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE doctor_settings
  DROP CONSTRAINT IF EXISTS doctor_settings_assessment_custom_sections_is_array;
ALTER TABLE doctor_settings
  ADD CONSTRAINT doctor_settings_assessment_custom_sections_is_array
  CHECK (jsonb_typeof(assessment_custom_sections) = 'array');

ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS plan_custom_sections JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE doctor_settings
  DROP CONSTRAINT IF EXISTS doctor_settings_plan_custom_sections_is_array;
ALTER TABLE doctor_settings
  ADD CONSTRAINT doctor_settings_plan_custom_sections_is_array
  CHECK (jsonb_typeof(plan_custom_sections) = 'array');

COMMENT ON COLUMN doctor_settings.assessment_custom_sections IS
  'assessment-plan-custom-sections: per-doctor default custom Assessment sections (depth-2 tree). Seeds fresh visits when empty; never overwrites saved prescriptions.';

COMMENT ON COLUMN doctor_settings.plan_custom_sections IS
  'assessment-plan-custom-sections: per-doctor default custom Plan sections (depth-2 tree). Seeds fresh visits when empty; never overwrites saved prescriptions.';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- RLS unchanged: doctor-only access via doctor_settings ownership (migration 009).
-- ============================================================================
