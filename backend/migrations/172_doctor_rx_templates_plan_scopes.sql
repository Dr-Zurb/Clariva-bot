-- ============================================================================
-- 172_doctor_rx_templates_plan_scopes.sql
-- plan templates · remaining Plan L1s + whole-tab bundle
-- Date: 2026-07-14
-- ============================================================================
-- Extends the shipped per-doctor Rx template table for Plan presets beyond
-- investigations_orders / medicines (migrations 168 / 170):
--   1. Adds an additive `plan_json` JSONB payload column — structured Plan
--      fields (advice, follow-up value/unit/notes, referral chips+notes,
--      clinical notes). CamelCase keys in JSON. Mirrors objective_json
--      (migration 153) discipline.
--   2. Widens the `scope` CHECK enum with:
--        advice | follow_up | referral | clinical_notes | plan_full
--      Prior scopes are byte-unchanged; existing rows untouched; no data
--      rewrite; RLS unchanged. The (doctor_id, scope) index from 141 already
--      covers the new values.
--
-- Config, not PHI: a template payload is the doctor's reusable starter
-- content, not a patient record. Per-doctor RLS inherits migration 091.
--
-- Idempotency: ADD COLUMN IF NOT EXISTS + constraint drop+add (re-runnable).
--
-- Rollback (documented only):
--   ALTER TABLE doctor_rx_templates DROP COLUMN IF EXISTS plan_json;
--   ALTER TABLE doctor_rx_templates DROP CONSTRAINT IF EXISTS doctor_rx_templates_scope_valid;
--   ALTER TABLE doctor_rx_templates ADD CONSTRAINT doctor_rx_templates_scope_valid
--     CHECK (scope IN ('subjective_full','chief_complaints','past_medical',
--                      'past_surgical','family_history','social_history',
--                      'allergies','custom_block','objective_full','vitals',
--                      'exam_systemic','exam_general','exam_cvs','exam_resp',
--                      'exam_abd','exam_cns','objective_custom_block',
--                      'test_results','point_of_care','investigations_orders',
--                      'medicines'));
-- ============================================================================

-- 1. Additive plan payload column (clone of migration 153's objective_json).
ALTER TABLE doctor_rx_templates
  ADD COLUMN IF NOT EXISTS plan_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE doctor_rx_templates
  DROP CONSTRAINT IF EXISTS doctor_rx_templates_plan_json_is_object;
ALTER TABLE doctor_rx_templates
  ADD CONSTRAINT doctor_rx_templates_plan_json_is_object
  CHECK (jsonb_typeof(plan_json) = 'object');

COMMENT ON COLUMN doctor_rx_templates.plan_json IS
  'plan templates: structured Plan preset — advice, followUp/followUpValue/followUpUnit, referral chips+notes, clinicalNotes. CamelCase keys in JSON. Config, not PHI.';

-- 2. Widen the scope enum with Plan section + whole-tab scopes.
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
    'plan_full'
  ));

COMMENT ON COLUMN doctor_rx_templates.scope IS
  'subj-15/subj-39/obj-16/obj-23/inv-lib/med-lib/plan-tpl: template subsection scope — filters list + picker per scope (subjective + objective + result + investigations + medicines + plan scopes).';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- RLS unchanged: per-doctor template policy covers the new scope values.
-- Config, not PHI: template presets are reusable starter content.
-- ============================================================================
