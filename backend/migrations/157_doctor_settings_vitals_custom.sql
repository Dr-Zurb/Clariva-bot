-- ============================================================================
-- Doctor-authored custom vitals (per-doctor definition default)
-- ============================================================================
-- Migration: 157_doctor_settings_vitals_custom.sql
-- Date:      2026-06-24
-- Batch:     vitals-section (VP3+) — task vit-14
-- Description:
--   One additive, reversible JSONB column that gives doctor-defined custom
--   vitals a per-doctor home:
--     1. doctor_settings.vitals_custom — per-doctor default list of custom-vital
--        DEFINITIONS (array of { id, label, unit?, kind, group } objects). Empty
--        = no custom vitals. Seeds fresh visits, exactly like
--        objective_custom_sections (migration 152). Per-field shape is enforced
--        in Zod (vit-14), NOT SQL CHECK — SQL only guards `jsonb_typeof = 'array'`.
--        Doctor-authored labels/units/structure only (NOT PHI).
--
--   Custom-vital VALUES are NOT stored here: they ride in the already-shipped
--   prescriptions.vitals_json (migration 156) under a self-describing
--   `vitalsCustom` slot, so this migration adds NO new value column and NO
--   prescriptions change. A row with no custom vitals leaves vitals_json empty,
--   preserving the derived-text byte-parity contract (V3-D5).
--
--   No backfill (default covers existing rows). No RLS change.
--
-- PHI:
--   doctor_settings.vitals_custom holds config (doctor-authored labels/units/
--   group strings), never patient data; RLS on `doctor_settings` (migration 009)
--   already covers all columns. This migration does NOT modify RLS policies.
--
-- Idempotency:
--   `ADD COLUMN IF NOT EXISTS` (Postgres 9.6+); constraint drop+add.
--
-- Rollback (NOT shipped as a separate migration — documented only):
--   ALTER TABLE doctor_settings
--     DROP CONSTRAINT IF EXISTS doctor_settings_vitals_custom_is_array,
--     DROP COLUMN IF EXISTS vitals_custom;
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. doctor_settings.vitals_custom (per-doctor custom-vital definition array)
-- ----------------------------------------------------------------------------
ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS vitals_custom JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE doctor_settings
  DROP CONSTRAINT IF EXISTS doctor_settings_vitals_custom_is_array;
ALTER TABLE doctor_settings
  ADD CONSTRAINT doctor_settings_vitals_custom_is_array
  CHECK (jsonb_typeof(vitals_custom) = 'array');

COMMENT ON COLUMN doctor_settings.vitals_custom IS
  'vit-14: per-doctor custom-vital definitions (array of { id, label, unit?, kind, group } objects). Doctor-authored config, not PHI; seeds fresh visits like objective_custom_sections. Values ride in prescriptions.vitals_json (vitalsCustom slot), not here. Per-field shape enforced in Zod, not SQL CHECK.';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- RLS unchanged: doctor_settings doctor-only access (migration 009) already
--                covers the new column; no new policies.
-- PHI: doctor_settings.vitals_custom is config (labels/units/group strings),
--      not PHI. Custom-vital values live in prescriptions.vitals_json (PHI,
--      migration 156; 7-year retention per COMPLIANCE).
-- ============================================================================
