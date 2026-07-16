-- ============================================================================
-- 180_doctor_rx_templates_objective_notes_and_free_text_scopes.sql
-- objective_notes + free_text_notes template scopes
-- Date: 2026-07-15
-- ============================================================================
-- Widens the `doctor_rx_templates.scope` CHECK enum (last set by migration 179)
-- with:
--   - `objective_notes` — Objective tab L1 Notes presets
--     (payload in objective_json.examinationJson[] systemId `objective_notes`)
--   - `free_text_notes` — Subjective Additional Notes presets
--     (payload in existing doctor_rx_templates.hopi column)
--
-- NO new columns. Prior scopes byte-unchanged. RLS unchanged.
-- Config, not PHI.
--
-- Idempotency: constraint drop+add (re-runnable).
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
    'free_text_notes',
    'objective_full',
    'vitals',
    'exam_systemic',
    'exam_general',
    'exam_cvs',
    'exam_resp',
    'exam_abd',
    'exam_cns',
    'exam_additional_notes',
    'objective_notes',
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
  'subj/obj/plan/asmt template subsection scope — includes objective_notes and free_text_notes.';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- RLS unchanged. Config, not PHI.
-- ============================================================================
