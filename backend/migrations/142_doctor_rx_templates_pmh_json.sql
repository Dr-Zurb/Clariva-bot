-- ============================================================================
-- 142_doctor_rx_templates_pmh_json.sql
-- subjective-tab · Phase 6 · subj-17
-- Date: 2026-06-17
-- ============================================================================
-- Adds a past-medical-history snapshot to per-doctor Rx templates:
--   { conditions[], medications[] }
-- Used by the `past_medical` scope (subj-17) — save snapshots the patient's
-- current chart rows; apply re-creates missing rows on the patient (deduped).
-- Rollback: ALTER TABLE doctor_rx_templates DROP COLUMN IF EXISTS pmh_json;
-- ============================================================================

ALTER TABLE doctor_rx_templates
  ADD COLUMN IF NOT EXISTS pmh_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE doctor_rx_templates
  DROP CONSTRAINT IF EXISTS doctor_rx_templates_pmh_json_is_object;
ALTER TABLE doctor_rx_templates
  ADD CONSTRAINT doctor_rx_templates_pmh_json_is_object
  CHECK (jsonb_typeof(pmh_json) = 'object');

COMMENT ON COLUMN doctor_rx_templates.pmh_json IS
  'subj-17: PMH snapshot — { conditions[], medications[] }. CamelCase keys in JSON.';
