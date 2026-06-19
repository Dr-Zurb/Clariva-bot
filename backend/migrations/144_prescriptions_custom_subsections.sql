-- ============================================================================
-- Prescriptions custom subsections (structured JSONB source)
-- ============================================================================
-- Migration: 144_prescriptions_custom_subsections.sql
-- Date:      2026-06-17
-- Batch:     subjective-tab (Phase 7) — task subj-19
-- Description:
--   Adds `custom_subsections` JSONB array to `prescriptions`. Each node is
--   `{ id, title, body, children: [{ id, title, body }] }` (depth capped at 2).
--   A derived plain-text mirror is produced on save for the PDF/SMS/snapshot
--   path (subj-22). `cc` and `hopi` are unchanged (P7-D3).
--
-- PHI:
--   New column carries PHI. RLS on `prescriptions` already covers all columns
--   (doctor-only access via `auth.uid() = doctor_id`, migration 026). This
--   migration does NOT modify RLS policies. 7-year retention applies per
--   COMPLIANCE; account-deletion cascade already covers `prescriptions`.
--
-- Idempotency:
--   `ADD COLUMN IF NOT EXISTS` (Postgres 9.6+); constraint drop+add.
--
-- Rollback (NOT shipped as a separate migration — documented only):
--   ALTER TABLE prescriptions
--     DROP CONSTRAINT IF EXISTS prescriptions_custom_subsections_is_array,
--     DROP COLUMN IF EXISTS custom_subsections;
-- ============================================================================

ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS custom_subsections JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE prescriptions
  DROP CONSTRAINT IF EXISTS prescriptions_custom_subsections_is_array;
ALTER TABLE prescriptions
  ADD CONSTRAINT prescriptions_custom_subsections_is_array
  CHECK (jsonb_typeof(custom_subsections) = 'array');

COMMENT ON COLUMN prescriptions.custom_subsections IS
  'PHI: doctor-defined custom subjective subsections (depth-2 tree). Derived TEXT mirror on save for PDF/SMS. subjective-tab / P7-D1.';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- RLS unchanged: doctor-only access via `auth.uid() = doctor_id` (migration 026)
--                covers the new column.
-- PHI: column carries PHI; 7-year retention applies per COMPLIANCE.
-- ============================================================================
