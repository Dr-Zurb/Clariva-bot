-- ============================================================================
-- 149_doctor_rx_templates_custom_block_scope.sql
-- subjective-tab · Phase 12 · subj-39
-- Date: 2026-06-18
-- ============================================================================
-- Widens the doctor_rx_templates scope enum with `custom_block` so a template
-- can carry a single custom Subjective subsection (P12-D1). Purely additive:
-- the 7 prior scopes are byte-unchanged, existing rows are untouched, no data
-- rewrite, RLS unchanged. The (doctor_id, scope) index from 141 already covers
-- the new value.
-- Rollback:
--   ALTER TABLE doctor_rx_templates DROP CONSTRAINT IF EXISTS doctor_rx_templates_scope_valid;
--   ALTER TABLE doctor_rx_templates ADD CONSTRAINT doctor_rx_templates_scope_valid
--     CHECK (scope IN ('subjective_full','chief_complaints','past_medical',
--                      'past_surgical','family_history','social_history','allergies'));
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
    'custom_block'
  ));

COMMENT ON COLUMN doctor_rx_templates.scope IS
  'subj-15/subj-39: template subsection scope — filters list + picker per scope (incl. custom_block).';
