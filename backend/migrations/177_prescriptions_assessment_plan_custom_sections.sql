-- ============================================================================
-- Prescriptions Assessment + Plan custom sections (structured JSONB source)
-- ============================================================================
-- Migration: 177_prescriptions_assessment_plan_custom_sections.sql
-- Date:      2026-07-14
-- Batch:     assessment-plan-custom-sections — mirrors subjective custom subsections (144).
-- Description:
--   Adds `assessment_custom_sections` and `plan_custom_sections` JSONB arrays to
--   `prescriptions`. Each node is `{ id, title, body, children: [{ id, title,
--   body }] }` (depth capped at 2) — the same shape as
--   `prescriptions.custom_subsections` (subj-19 / migration 144). A derived
--   plain-text mirror is produced on save for the PDF/SMS/snapshot path (like
--   subjective customs). Existing Assessment/Plan columns are unchanged.
--
-- PHI:
--   Both new columns carry PHI (doctor-authored per-visit clinical content). RLS
--   on `prescriptions` already covers all columns (doctor-only access via
--   `auth.uid() = doctor_id`, migration 026). This migration does NOT modify RLS
--   policies. 7-year retention applies per COMPLIANCE; account-deletion cascade
--   already covers `prescriptions`.
--
-- Idempotency:
--   `ADD COLUMN IF NOT EXISTS` (Postgres 9.6+); constraint drop+add.
--
-- Rollback (NOT shipped as a separate migration — documented only):
--   ALTER TABLE prescriptions
--     DROP CONSTRAINT IF EXISTS prescriptions_assessment_custom_sections_is_array,
--     DROP CONSTRAINT IF EXISTS prescriptions_plan_custom_sections_is_array,
--     DROP COLUMN IF EXISTS assessment_custom_sections,
--     DROP COLUMN IF EXISTS plan_custom_sections;
-- ============================================================================

ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS assessment_custom_sections JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE prescriptions
  DROP CONSTRAINT IF EXISTS prescriptions_assessment_custom_sections_is_array;
ALTER TABLE prescriptions
  ADD CONSTRAINT prescriptions_assessment_custom_sections_is_array
  CHECK (jsonb_typeof(assessment_custom_sections) = 'array');

ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS plan_custom_sections JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE prescriptions
  DROP CONSTRAINT IF EXISTS prescriptions_plan_custom_sections_is_array;
ALTER TABLE prescriptions
  ADD CONSTRAINT prescriptions_plan_custom_sections_is_array
  CHECK (jsonb_typeof(plan_custom_sections) = 'array');

COMMENT ON COLUMN prescriptions.assessment_custom_sections IS
  'PHI: doctor-defined custom Assessment sections (depth-2 tree). Derived TEXT mirror on save for PDF/SMS. assessment-plan-custom-sections.';

COMMENT ON COLUMN prescriptions.plan_custom_sections IS
  'PHI: doctor-defined custom Plan sections (depth-2 tree). Derived TEXT mirror on save for PDF/SMS. assessment-plan-custom-sections.';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- RLS unchanged: doctor-only access via `auth.uid() = doctor_id` (migration 026)
--                covers the new columns.
-- PHI: columns carry PHI; 7-year retention applies per COMPLIANCE.
-- ============================================================================
