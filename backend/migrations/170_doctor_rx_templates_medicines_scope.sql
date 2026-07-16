-- ============================================================================
-- 170_doctor_rx_templates_medicines_scope.sql
-- plan-medications-library · medicines section templates
-- Date: 2026-07-13
-- ============================================================================
-- Widens the `doctor_rx_templates.scope` CHECK enum (last set by migration 168)
-- with the Plan medicines section scope:
--   - `medicines` — reusable medicine-list presets
--
-- Payload lives in the EXISTING `medicines_json` JSONB column (migration 091) —
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
--                      'test_results','point_of_care','investigations_orders'));
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
    'medicines'
  ));

COMMENT ON COLUMN doctor_rx_templates.scope IS
  'subj-15/subj-39/obj-16/obj-23/inv-lib/med-lib: template subsection scope — filters list + picker per scope (subjective + objective + result + investigations + medicines scopes).';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- RLS unchanged: per-doctor template policy covers the new scope value.
-- Config, not PHI: template presets are reusable starter content.
-- ============================================================================
