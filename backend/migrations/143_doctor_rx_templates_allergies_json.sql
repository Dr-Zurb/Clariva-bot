-- ============================================================================
-- 143_doctor_rx_templates_allergies_json.sql
-- subjective-tab · Phase 6 · subj-17
-- Date: 2026-06-17
-- ============================================================================
-- Adds an allergies snapshot to per-doctor Rx templates:
--   { allergies[] }
-- Used by the `allergies` scope (subj-17) — save snapshots the patient's
-- current allergy rows; apply re-creates missing rows on the patient (deduped).
-- Rollback: ALTER TABLE doctor_rx_templates DROP COLUMN IF EXISTS allergies_json;
-- ============================================================================

ALTER TABLE doctor_rx_templates
  ADD COLUMN IF NOT EXISTS allergies_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE doctor_rx_templates
  DROP CONSTRAINT IF EXISTS doctor_rx_templates_allergies_json_is_object;
ALTER TABLE doctor_rx_templates
  ADD CONSTRAINT doctor_rx_templates_allergies_json_is_object
  CHECK (jsonb_typeof(allergies_json) = 'object');

COMMENT ON COLUMN doctor_rx_templates.allergies_json IS
  'subj-17: allergies snapshot — { allergies[] }. CamelCase keys in JSON.';
