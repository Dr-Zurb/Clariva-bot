-- ============================================================================
-- Prescriptions past surgical history structured (v2 JSONB source)
-- ============================================================================
-- Migration: 127_prescriptions_past_surgical_history_structured.sql
-- Date:      2026-06-08
-- Description:
--   Adds `past_surgical_history_structured` JSONB to `prescriptions`. The existing
--   `past_surgical_history` TEXT column stays as the derived display string.
--
-- PHI:
--   New column carries PHI. RLS on `prescriptions` already covers all columns
--   (doctor-only access via `auth.uid() = doctor_id`, migration 026).
--
-- Rollback (documented only):
--   ALTER TABLE prescriptions DROP COLUMN IF EXISTS past_surgical_history_structured;
-- ============================================================================

ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS past_surgical_history_structured JSONB NULL;

COMMENT ON COLUMN prescriptions.past_surgical_history_structured IS
  'PHI: structured past surgical history (v2). past_surgical_history TEXT is derived from this on save. subjective-tab.';
