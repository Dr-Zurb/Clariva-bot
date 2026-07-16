-- ============================================================================
-- Prescriptions structured diagnoses (JSONB source)
-- ============================================================================
-- Migration: 161_prescriptions_diagnoses_json.sql
-- Date:      2026-07-09
-- Batch:     assessment-tab (Wave 3) — task asmt-03
-- Description:
--   Adds `diagnoses_json` JSONB array to `prescriptions`. Each element is a
--   structured diagnosis row:
--   `{ id, label, kind: 'primary'|'secondary', certainty: 'provisional'|
--      'rule_out'|'confirmed', status: 'new'|'ongoing'|'resolved',
--      severity?: 'mild'|'moderate'|'severe'|null, note?: string|null }`.
--   The existing `provisional_diagnosis` TEXT column STAYS — the cockpit form
--   derives it from the primary row's label on save (ASMT-D4 / OBJ-D2 analog)
--   so PDF, SMS summary, snapshot, and notification readers remain unchanged.
--   Empty `diagnoses_json` leaves the legacy free-text `provisional_diagnosis`
--   byte-identical (passthrough). `differential_diagnosis` is untouched (DDx
--   is not folded into diagnoses_json in v1). Mirrors migration 154
--   (`test_results_json`) / 150 (`examination_json`).
--
-- PHI:
--   New column carries PHI (diagnosis labels + clinical attributes). RLS on
--   `prescriptions` already covers all columns (doctor-only access via
--   `auth.uid() = doctor_id`, migration 026). This migration does NOT modify
--   RLS policies. 7-year retention applies per COMPLIANCE; account-deletion
--   cascade already covers `prescriptions`.
--
-- Idempotency:
--   `ADD COLUMN IF NOT EXISTS` (Postgres 9.6+); constraint drop+add. Re-running
--   this migration is a no-op.
--
-- Rollback (NOT shipped as a separate migration — documented only):
--   ALTER TABLE prescriptions
--     DROP CONSTRAINT IF EXISTS prescriptions_diagnoses_json_is_array,
--     DROP COLUMN IF EXISTS diagnoses_json;
-- ============================================================================

ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS diagnoses_json JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE prescriptions
  DROP CONSTRAINT IF EXISTS prescriptions_diagnoses_json_is_array;
ALTER TABLE prescriptions
  ADD CONSTRAINT prescriptions_diagnoses_json_is_array
  CHECK (jsonb_typeof(diagnoses_json) = 'array');

COMMENT ON COLUMN prescriptions.diagnoses_json IS
  'PHI: structured diagnosis rows (id/label/kind/certainty/status/severity/note). provisional_diagnosis TEXT is derived from the primary label on save (ASMT-D4). Empty array = legacy free-text passthrough. assessment-tab / asmt-03.';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- RLS unchanged: doctor-only access via `auth.uid() = doctor_id` (migration 026)
--                covers the new column.
-- PHI: column carries PHI; 7-year retention applies per COMPLIANCE.
-- Derivation (ASMT-D4): primary label → provisional_diagnosis byte-identical
--                for equal single-Dx content; output readers untouched.
-- ============================================================================
