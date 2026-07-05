-- ============================================================================
-- Prescriptions structured test results (JSONB source)
-- ============================================================================
-- Migration: 154_prescriptions_test_results_json.sql
-- Date:      2026-06-19
-- Batch:     objective-tab (Phase 5) — task obj-20
-- Description:
--   Adds `test_results_json` JSONB array to `prescriptions`. Each element is a
--   structured point-of-care / patient-brought result row
--   `{ id, source: 'patient_report'|'in_clinic_poc', name, value, unit, date,
--      interpretation: 'normal'|'high'|'low'|'abnormal', notes }`.
--   The existing `test_results` TEXT column (migration 103) STAYS — the cockpit
--   form derives it from `test_results_json` on save (OBJ-D2 / P5-D3) so PDF, SMS
--   summary, and snapshot readers remain unchanged. Empty `test_results_json`
--   leaves the legacy free-text `test_results` byte-identical (passthrough
--   contract, OBJ-D2). Mirrors migration 150 (`examination_json`).
--
-- PHI:
--   New column carries PHI (point-of-care / patient-brought result values). RLS
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
--     DROP CONSTRAINT IF EXISTS prescriptions_test_results_json_is_array,
--     DROP COLUMN IF EXISTS test_results_json;
-- ============================================================================

ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS test_results_json JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE prescriptions
  DROP CONSTRAINT IF EXISTS prescriptions_test_results_json_is_array;
ALTER TABLE prescriptions
  ADD CONSTRAINT prescriptions_test_results_json_is_array
  CHECK (jsonb_typeof(test_results_json) = 'array');

COMMENT ON COLUMN prescriptions.test_results_json IS
  'PHI: structured point-of-care / patient-brought test results (id/source/name/value/unit/date/interpretation/notes). test_results is derived from this on save. objective-tab / OBJ-D1.';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- RLS unchanged: doctor-only access via `auth.uid() = doctor_id` (migration 026)
--                covers the new column.
-- PHI: column carries PHI; 7-year retention applies per COMPLIANCE.
-- ============================================================================
