-- ============================================================================
-- 153_doctor_rx_templates_objective_json.sql
-- objective-tab · Phase 4 · obj-16
-- Date: 2026-06-19
-- ============================================================================
-- Extends the shipped per-doctor Rx template table so one table can also hold
-- OBJECTIVE templates (P4-D1: one table, reuse the `scope` discriminator):
--   1. Adds an additive `objective_json` JSONB payload column — a mirror of
--      `subjective_json` (migration 119): { examinationJson[], vitals_* subset,
--      testResults, customSections[] }. CamelCase keys in JSON.
--   2. Widens the `scope` CHECK enum (migrations 141/149) with the objective
--      scopes. The 8 prior subjective scopes are byte-unchanged, existing rows
--      are untouched, no data rewrite, RLS unchanged. The (doctor_id, scope)
--      index from 141 already covers the new values.
--
-- Config, not PHI: a template payload is the doctor's reusable starter content
-- (a vitals/exam preset), not a patient's record. Per-doctor RLS (the template
-- table's existing policy) is untouched — neither change widens access.
--
-- Rollback:
--   ALTER TABLE doctor_rx_templates DROP COLUMN IF EXISTS objective_json;
--   ALTER TABLE doctor_rx_templates DROP CONSTRAINT IF EXISTS doctor_rx_templates_scope_valid;
--   ALTER TABLE doctor_rx_templates ADD CONSTRAINT doctor_rx_templates_scope_valid
--     CHECK (scope IN ('subjective_full','chief_complaints','past_medical',
--                      'past_surgical','family_history','social_history',
--                      'allergies','custom_block'));
-- ============================================================================

-- 1. Additive objective payload column (clone of migration 119's subjective_json).
ALTER TABLE doctor_rx_templates
  ADD COLUMN IF NOT EXISTS objective_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE doctor_rx_templates
  DROP CONSTRAINT IF EXISTS doctor_rx_templates_objective_json_is_object;
ALTER TABLE doctor_rx_templates
  ADD CONSTRAINT doctor_rx_templates_objective_json_is_object
  CHECK (jsonb_typeof(objective_json) = 'object');

COMMENT ON COLUMN doctor_rx_templates.objective_json IS
  'obj-16: structured objective preset — examinationJson[] + vitals_* subset + testResults + customSections[]. CamelCase keys in JSON. Config, not PHI.';

-- 2. Widen the scope enum with the objective scopes (preserve all subjective scopes).
ALTER TABLE doctor_rx_templates
  DROP CONSTRAINT IF EXISTS doctor_rx_templates_scope_valid;
ALTER TABLE doctor_rx_templates
  ADD CONSTRAINT doctor_rx_templates_scope_valid
  CHECK (scope IN (
    'subjective_full',
    'chief_complaints',
    'past_medical',
    'past_surgical',
    'family_history',
    'social_history',
    'allergies',
    'custom_block',
    'objective_full',
    'vitals',
    'exam_systemic',
    'exam_general',
    'exam_cvs',
    'exam_resp',
    'exam_abd',
    'exam_cns',
    'objective_custom_block'
  ));

COMMENT ON COLUMN doctor_rx_templates.scope IS
  'subj-15/subj-39/obj-16: template subsection scope — filters list + picker per scope (subjective + objective scopes).';
