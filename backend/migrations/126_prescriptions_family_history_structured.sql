-- ============================================================================
-- Prescriptions family history structured (v2 JSONB source)
-- ============================================================================
-- Migration: 126_prescriptions_family_history_structured.sql
-- Date:      2026-06-08
-- Description:
--   Adds `family_history_structured` JSONB to `prescriptions`. The existing
--   `family_history` TEXT column stays as the derived display string.
--
-- PHI:
--   New column carries PHI. RLS on `prescriptions` already covers all columns
--   (doctor-only access via `auth.uid() = doctor_id`, migration 026).
--
-- Rollback (documented only):
--   ALTER TABLE prescriptions DROP COLUMN IF EXISTS family_history_structured;
-- ============================================================================

ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS family_history_structured JSONB NULL;

COMMENT ON COLUMN prescriptions.family_history_structured IS
  'PHI: structured family history (v2). family_history TEXT is derived from this on save. subjective-tab.';
