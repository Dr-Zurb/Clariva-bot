-- ============================================================================
-- 179_doctor_rx_templates_exam_additional_notes_scope.sql
-- objective templates · exam_additional_notes scope
-- Date: 2026-07-15
-- ============================================================================
-- Widens the `doctor_rx_templates.scope` CHECK enum (last set by migration 176)
-- with the Examination Additional notes scope:
--   - `exam_additional_notes` — reusable free-text exam notes presets
--
-- Payload lives in the EXISTING `objective_json` JSONB column (migration 153)
-- under `examinationJson[]` with systemId `additional_notes` — NO new column.
-- Prior scopes are byte-unchanged, existing rows untouched, no data rewrite,
-- RLS unchanged.
--
-- Config, not PHI: a template payload is the doctor's reusable starter content,
-- not a patient record.
--
-- Idempotency: constraint drop+add (re-runnable).
--
-- Rollback (documented only):
--   ALTER TABLE doctor_rx_templates DROP CONSTRAINT IF EXISTS doctor_rx_templates_scope_valid;
--   ALTER TABLE doctor_rx_templates ADD CONSTRAINT doctor_rx_templates_scope_valid
--     CHECK (scope IN (…prior scopes without exam_additional_notes…));
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
    'exam_additional_notes',
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
  'subj-15/subj-39/obj-16/obj-23/inv-lib/med-lib/plan-tpl/asmt-tpl: template subsection scope — includes exam_additional_notes (Examination free-text notes presets).';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- RLS unchanged. Config, not PHI.
-- ============================================================================
