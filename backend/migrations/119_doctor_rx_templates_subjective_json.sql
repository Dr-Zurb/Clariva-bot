-- ============================================================================
-- 119_doctor_rx_templates_subjective_json.sql
-- subjective-tab · Phase 2 · subj-08
-- Date: 2026-06-03
-- ============================================================================
-- Adds structured subjective payload to per-doctor Rx templates:
--   { complaints[], familyHistory, socialHistory, pastSurgicalHistory }
-- Mirrors prescriptions.complaints + history columns (migration 116).
-- Rollback: ALTER TABLE doctor_rx_templates DROP COLUMN IF EXISTS subjective_json;
-- ============================================================================

ALTER TABLE doctor_rx_templates
  ADD COLUMN IF NOT EXISTS subjective_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE doctor_rx_templates
  DROP CONSTRAINT IF EXISTS doctor_rx_templates_subjective_json_is_object;
ALTER TABLE doctor_rx_templates
  ADD CONSTRAINT doctor_rx_templates_subjective_json_is_object
  CHECK (jsonb_typeof(subjective_json) = 'object');

COMMENT ON COLUMN doctor_rx_templates.subjective_json IS
  'subj-08: structured subjective preset — complaints array + FH/SH/PSH. CamelCase keys in JSON.';
