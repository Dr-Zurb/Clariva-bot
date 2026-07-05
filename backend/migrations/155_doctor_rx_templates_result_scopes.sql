-- ============================================================================
-- 155_doctor_rx_templates_result_scopes.sql
-- objective-tab · Phase 5 · obj-23
-- Date: 2026-06-19
-- ============================================================================
-- Widens the `doctor_rx_templates.scope` CHECK enum (last set by migration 153)
-- with the two Zone-C RESULT scopes so the shipped per-doctor template engine can
-- also hold point-of-care / patient-brought result presets:
--   - `test_results`   — patient-brought structured result rows
--   - `point_of_care`  — in-clinic POC structured result rows
--
-- Both presets live in the EXISTING `objective_json` column (obj-16, migration
-- 153) under a new `testResultsJson` key (camelCase) — NO new column. The 17
-- prior scopes are byte-unchanged, existing rows are untouched, no data rewrite,
-- RLS unchanged. The (doctor_id, scope) index from 141 already covers the new
-- values. Config, not PHI: a template payload is the doctor's reusable starter
-- content, not a patient record. The per-doctor RLS policy is untouched —
-- neither change widens access.
--
-- Idempotency: constraint drop+add (re-runnable).
--
-- Rollback (documented only):
--   ALTER TABLE doctor_rx_templates DROP CONSTRAINT IF EXISTS doctor_rx_templates_scope_valid;
--   ALTER TABLE doctor_rx_templates ADD CONSTRAINT doctor_rx_templates_scope_valid
--     CHECK (scope IN ('subjective_full','chief_complaints','past_medical',
--                      'past_surgical','family_history','social_history',
--                      'allergies','custom_block','objective_full','vitals',
--                      'exam_systemic','exam_general','exam_cvs','exam_resp',
--                      'exam_abd','exam_cns','objective_custom_block'));
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
    'point_of_care'
  ));

COMMENT ON COLUMN doctor_rx_templates.scope IS
  'subj-15/subj-39/obj-16/obj-23: template subsection scope — filters list + picker per scope (subjective + objective + result scopes).';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- RLS unchanged: per-doctor template policy covers the new scope values.
-- Config, not PHI: template presets are reusable starter content.
-- ============================================================================
