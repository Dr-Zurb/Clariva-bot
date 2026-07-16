-- ============================================================================
-- 168_doctor_rx_templates_investigations_scope.sql
-- plan-investigations-library · investigations section templates
-- Date: 2026-07-13
-- ============================================================================
-- Widens the `doctor_rx_templates.scope` CHECK enum (last set by migration 155)
-- with the Plan investigations section scope:
--   - `investigations_orders` — reusable order list presets
--
-- Payload lives in the EXISTING `investigations` TEXT column (migration 091) —
-- NO new column. The prior scopes are byte-unchanged, existing rows are
-- untouched, no data rewrite, RLS unchanged. The (doctor_id, scope) index from
-- 141 already covers the new value. Config, not PHI: a template payload is the
-- doctor's reusable starter content, not a patient record.
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
--                      'exam_abd','exam_cns','objective_custom_block',
--                      'test_results','point_of_care'));
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
    'investigations_orders'
  ));

COMMENT ON COLUMN doctor_rx_templates.scope IS
  'subj-15/subj-39/obj-16/obj-23/inv-lib: template subsection scope — filters list + picker per scope (subjective + objective + result + investigations scopes).';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- RLS unchanged: per-doctor template policy covers the new scope value.
-- Config, not PHI: template presets are reusable starter content.
-- ============================================================================
