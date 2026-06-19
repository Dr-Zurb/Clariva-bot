-- ============================================================================
-- Prescriptions structured examination (JSONB source)
-- ============================================================================
-- Migration: 150_prescriptions_examination_json.sql
-- Date:      2026-06-18
-- Batch:     objective-tab (Phase 1) — task obj-01
-- Description:
--   Adds `examination_json` JSONB array to `prescriptions`. Each element is a
--   structured per-system exam finding
--   `{ systemId, status: 'normal'|'abnormal', findings: string[], notes }`.
--   The existing `examination_findings` TEXT column (migration 103) STAYS — the
--   cockpit form derives it from `examination_json` on save (OBJ-D2) so PDF, SMS
--   summary, and snapshot readers remain unchanged. Empty `examination_json`
--   leaves the legacy free-text `examination_findings` byte-identical
--   (passthrough contract, P1-D2).
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
--     DROP CONSTRAINT IF EXISTS prescriptions_examination_json_is_array,
--     DROP COLUMN IF EXISTS examination_json;
-- ============================================================================

ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS examination_json JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE prescriptions
  DROP CONSTRAINT IF EXISTS prescriptions_examination_json_is_array;
ALTER TABLE prescriptions
  ADD CONSTRAINT prescriptions_examination_json_is_array
  CHECK (jsonb_typeof(examination_json) = 'array');

COMMENT ON COLUMN prescriptions.examination_json IS
  'PHI: structured per-system examination findings (systemId/status/findings/notes). examination_findings is derived from this on save. objective-tab / OBJ-D1.';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- RLS unchanged: doctor-only access via `auth.uid() = doctor_id` (migration 026)
--                covers the new column.
-- PHI: column carries PHI; 7-year retention applies per COMPLIANCE.
-- ============================================================================
