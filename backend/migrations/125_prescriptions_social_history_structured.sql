-- ============================================================================
-- Prescriptions social history structured (v2 JSONB source)
-- ============================================================================
-- Migration: 125_prescriptions_social_history_structured.sql
-- Date:      2026-06-07
-- Batch:     social-history-v2 (Phase 1) — task sh-02
-- Description:
--   Adds `social_history_structured` JSONB to `prescriptions`. The existing
--   `social_history` TEXT column STAYS as the derived display string (mirrors
--   `complaints` → `cc`/`hopi`, ST-D2). The cockpit form writes both on save.
--
-- PHI:
--   New column carries PHI. RLS on `prescriptions` already covers all columns
--   (doctor-only access via `auth.uid() = doctor_id`, migration 026). This
--   migration does NOT modify RLS policies. 7-year retention applies per
--   COMPLIANCE; account-deletion cascade already covers `prescriptions`.
--
-- Idempotency:
--   `ADD COLUMN IF NOT EXISTS` (Postgres 9.6+).
--
-- Rollback (NOT shipped as a separate migration — documented only):
--   ALTER TABLE prescriptions
--     DROP COLUMN IF EXISTS social_history_structured;
-- ============================================================================

ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS social_history_structured JSONB NULL;

COMMENT ON COLUMN prescriptions.social_history_structured IS
  'PHI: structured social/personal history (v2). social_history TEXT is derived from this on save. subjective-tab / ST-D6.';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- RLS unchanged: doctor-only access via `auth.uid() = doctor_id` (migration 026)
--                covers the new column.
-- PHI: column carries PHI; 7-year retention applies per COMPLIANCE.
-- ============================================================================
