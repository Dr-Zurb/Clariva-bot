-- ============================================================================
-- Vitals 3.0 storage foundation (json-backed vitals + per-doctor hidden set)
-- ============================================================================
-- Migration: 156_prescriptions_vitals_json_and_doctor_vitals_hidden.sql
-- Date:      2026-06-20
-- Batch:     vitals-section (VP1) — task vit-02
-- Description:
--   Two additive, reversible JSONB columns that give the Vitals 3.0 catalog a
--   home and the visibility engine a store:
--     1. prescriptions.vitals_json  — object map of all `storage: "json"` vitals
--        from the vit-01 registry (canonical units; camelCase keys). The 7
--        shipped vitals_* columns (migrations 103/151) STAY unchanged. Per-field
--        bounds are enforced in Zod (vit-03), NOT SQL CHECK (V3-D1) — SQL only
--        guards `jsonb_typeof = 'object'`. Mirrors test_results_json (154) /
--        objective_json (153). Empty `{}` leaves the derived examination_findings
--        / vitals text byte-identical for rows that use only shipped columns
--        (view-parity contract, V3-D5).
--     2. doctor_settings.vitals_hidden — per-doctor hidden-vital delta set
--        (array of registry vital-key strings). Empty = nothing hidden. A
--        verbatim clone of objective_section_hidden (migration 152). UI-only.
--
--   No backfill (defaults cover existing rows). No RLS change.
--
-- PHI:
--   prescriptions.vitals_json carries PHI (vital values), like the vitals_*
--   columns. RLS on `prescriptions` already covers all columns (doctor-only
--   access via `auth.uid() = doctor_id`, migration 026). 7-year retention applies
--   per COMPLIANCE; account-deletion cascade already covers `prescriptions`.
--   doctor_settings.vitals_hidden holds config strings only (registry vital
--   keys), never patient data; RLS on `doctor_settings` (migration 009) already
--   covers all columns. This migration does NOT modify RLS policies.
--
-- Idempotency:
--   `ADD COLUMN IF NOT EXISTS` (Postgres 9.6+); constraint drop+add per column.
--
-- Rollback (NOT shipped as a separate migration — documented only):
--   ALTER TABLE prescriptions
--     DROP CONSTRAINT IF EXISTS prescriptions_vitals_json_is_object,
--     DROP COLUMN IF EXISTS vitals_json;
--   ALTER TABLE doctor_settings
--     DROP CONSTRAINT IF EXISTS doctor_settings_vitals_hidden_is_array,
--     DROP COLUMN IF EXISTS vitals_hidden;
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. prescriptions.vitals_json (object map of json-backed vitals)
-- ----------------------------------------------------------------------------
ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS vitals_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE prescriptions
  DROP CONSTRAINT IF EXISTS prescriptions_vitals_json_is_object;
ALTER TABLE prescriptions
  ADD CONSTRAINT prescriptions_vitals_json_is_object
  CHECK (jsonb_typeof(vitals_json) = 'object');

COMMENT ON COLUMN prescriptions.vitals_json IS
  'PHI: additive extended-vitals store (storage:"json" vitals from the vit-01 registry; canonical units, camelCase keys). Zod-validated per-field (V3-D1), not SQL CHECK. Shipped vitals_* columns unchanged; empty {} keeps derived examination_findings/vitals byte-identical. vitals-section / vit-02.';

-- ----------------------------------------------------------------------------
-- 2. doctor_settings.vitals_hidden (per-doctor hidden-vital delta array)
-- ----------------------------------------------------------------------------
ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS vitals_hidden JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE doctor_settings
  DROP CONSTRAINT IF EXISTS doctor_settings_vitals_hidden_is_array;
ALTER TABLE doctor_settings
  ADD CONSTRAINT doctor_settings_vitals_hidden_is_array
  CHECK (jsonb_typeof(vitals_hidden) = 'array');

COMMENT ON COLUMN doctor_settings.vitals_hidden IS
  'vit-02: per-doctor hidden vitals (array of registry vital-key strings). Delta set; empty = nothing hidden. View-only; does not affect PDF/examination_findings/test_results/vitals.';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- RLS unchanged: prescriptions doctor-only access via `auth.uid() = doctor_id`
--                (migration 026); doctor_settings doctor-only (migration 009).
--                Both cover the new columns; no new policies.
-- PHI: prescriptions.vitals_json carries PHI; 7-year retention per COMPLIANCE.
--      doctor_settings.vitals_hidden is config (registry key strings), not PHI.
-- ============================================================================
