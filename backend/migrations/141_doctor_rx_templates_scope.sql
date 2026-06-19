-- ============================================================================
-- 141_doctor_rx_templates_scope.sql
-- subjective-tab · Phase 6 · subj-15
-- Date: 2026-06-17
-- ============================================================================
-- Adds scope discriminator to per-doctor Rx templates so one table can hold
-- per-subsection bundles (P6-D1). Existing rows default to subjective_full.
-- Rollback: ALTER TABLE doctor_rx_templates DROP COLUMN IF EXISTS scope;
-- ============================================================================

ALTER TABLE doctor_rx_templates
  ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'subjective_full';

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
    'allergies'
  ));

COMMENT ON COLUMN doctor_rx_templates.scope IS
  'subj-15: template subsection scope — filters list + picker per scope.';

CREATE INDEX IF NOT EXISTS idx_doctor_rx_templates_doctor_scope
  ON doctor_rx_templates (doctor_id, scope);
