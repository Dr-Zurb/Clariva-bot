-- ============================================================================
-- 176_doctor_rx_templates_known_conditions_scope.sql
-- assessment templates · known_conditions chart snapshot scope
-- Date: 2026-07-14
-- ============================================================================
-- Widens the `doctor_rx_templates.scope` CHECK enum (last set by migration 175)
-- with the Assessment Known conditions scope:
--   - `known_conditions` — reusable chart-condition presets
--
-- Payload lives in the EXISTING `assessment_json` JSONB column (migration 175)
-- under `knownConditions[]` — NO new column. Prior scopes are byte-unchanged,
-- existing rows untouched, no data rewrite, RLS unchanged.
--
-- Config, not PHI: a template payload is the doctor's reusable starter content,
-- not a patient record. Apply creates chart rows via the existing conditions API.
--
-- Idempotency: constraint drop+add (re-runnable).
--
-- Rollback (documented only):
--   ALTER TABLE doctor_rx_templates DROP CONSTRAINT IF EXISTS doctor_rx_templates_scope_valid;
--   ALTER TABLE doctor_rx_templates ADD CONSTRAINT doctor_rx_templates_scope_valid
--     CHECK (scope IN (…prior scopes without known_conditions…));
-- ============================================================================

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
    'objective_custom_block',
    'test_results',
    'point_of_care',
    'investigations_orders',
    'medicines',
    'advice',
    'follow_up',
    'referral',
    'clinical_notes',
    'plan_full',
    'diagnoses',
    'assessment_notes',
    'assessment_full',
    'known_conditions'
  ));

COMMENT ON COLUMN doctor_rx_templates.scope IS
  'subj-15/subj-39/obj-16/obj-23/inv-lib/med-lib/plan-tpl/asmt-tpl: template subsection scope — includes known_conditions (assessment chart presets).';

COMMENT ON COLUMN doctor_rx_templates.assessment_json IS
  'assessment templates: diagnoses, assessmentNote, assessmentAcuity, knownConditions[]. CamelCase keys in JSON. Config, not PHI.';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- RLS unchanged. Config, not PHI.
-- ============================================================================
