-- ============================================================================
-- Prescriptions structured investigation orders (JSONB source)
-- ============================================================================
-- Migration: 167_prescriptions_investigations_orders_json.sql
-- Date:      2026-07-12
-- Batch:     plan-investigations-library (Wave 4) — task inv-lib-05
-- Description:
--   Adds `investigations_orders_json` JSONB array to `prescriptions`. Each
--   element is a structured investigation order:
--   `{ id, label, kind: 'panel'|'analyte'|'imaging'|'custom' }`.
--   The existing `investigations_orders` TEXT column STAYS — the cockpit form
--   derives it from the order labels on save (INV-D8 / OBJ-D2 / ASMT-D4 analog)
--   so PDF, SMS summary, snapshot, the public API field `investigations`, and
--   every other reader remain byte-identical for equal order content. Empty
--   `investigations_orders_json` leaves the legacy free-text
--   `investigations_orders` untouched (full passthrough). Mirrors migration 161
--   (`diagnoses_json`) / 154 (`test_results_json`).
--
-- PHI:
--   New column carries PHI (investigation order labels the doctor requested).
--   RLS on `prescriptions` already covers all columns (doctor-only access via
--   `auth.uid() = doctor_id`, migration 026). This migration does NOT modify RLS
--   policies. 7-year retention applies per COMPLIANCE; account-deletion cascade
--   already covers `prescriptions`.
--
-- Idempotency:
--   `ADD COLUMN IF NOT EXISTS` (Postgres 9.6+); constraint drop+add. Re-running
--   this migration is a no-op.
--
-- Rollback (NOT shipped as a separate migration — documented only):
--   ALTER TABLE prescriptions
--     DROP CONSTRAINT IF EXISTS prescriptions_investigations_orders_json_is_array,
--     DROP COLUMN IF EXISTS investigations_orders_json;
-- ============================================================================

ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS investigations_orders_json JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE prescriptions
  DROP CONSTRAINT IF EXISTS prescriptions_investigations_orders_json_is_array;
ALTER TABLE prescriptions
  ADD CONSTRAINT prescriptions_investigations_orders_json_is_array
  CHECK (jsonb_typeof(investigations_orders_json) = 'array');

COMMENT ON COLUMN prescriptions.investigations_orders_json IS
  'PHI: structured investigation orders (id/label/kind: panel|analyte|imaging|custom). investigations_orders TEXT is derived from the order labels on save (INV-D8). Empty array = legacy free-text passthrough. plan-investigations-library / inv-lib-05.';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- RLS unchanged: doctor-only access via `auth.uid() = doctor_id` (migration 026)
--                covers the new column.
-- PHI: column carries PHI; 7-year retention applies per COMPLIANCE.
-- Derivation (INV-D8): order labels → investigations_orders byte-identical for
--                equal order content; output readers untouched.
-- ============================================================================
