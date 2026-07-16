-- ============================================================================
-- 174_doctor_settings_assessment_layout.sql
-- assessment tab chrome · section order / collapse / hidden
-- Date: 2026-07-14
-- ============================================================================
-- Per-doctor Assessment-tab layout config. Three additive JSONB columns cloning
-- the shipped plan layout columns (migration 173), without custom sections:
--   assessment_section_order      — array of section-id strings (empty = canonical default)
--   assessment_section_collapsed  — object map { sectionId: isOpen } (empty = canonical default)
--   assessment_section_hidden     — delta array of static section-id strings (empty = nothing hidden)
--
-- Doctor-authored config only — section-id strings / booleans, never patient data.
-- UI-only: does not affect PDF / diagnoses_json / assessment_note patient-facing
-- output order. assessment_note stays private.
--
-- PHI: config strings + booleans only. RLS on doctor_settings already covers
-- all columns (migration 009). No new policies.
--
-- Idempotency: ADD COLUMN IF NOT EXISTS; constraint drop+add per column.
--
-- Rollback (documented only):
--   ALTER TABLE doctor_settings
--     DROP CONSTRAINT IF EXISTS doctor_settings_assessment_section_order_is_array,
--     DROP CONSTRAINT IF EXISTS doctor_settings_assessment_section_collapsed_is_object,
--     DROP CONSTRAINT IF EXISTS doctor_settings_assessment_section_hidden_is_array,
--     DROP COLUMN IF EXISTS assessment_section_order,
--     DROP COLUMN IF EXISTS assessment_section_collapsed,
--     DROP COLUMN IF EXISTS assessment_section_hidden;
-- ============================================================================

ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS assessment_section_order JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE doctor_settings
  DROP CONSTRAINT IF EXISTS doctor_settings_assessment_section_order_is_array;
ALTER TABLE doctor_settings
  ADD CONSTRAINT doctor_settings_assessment_section_order_is_array
  CHECK (jsonb_typeof(assessment_section_order) = 'array');

COMMENT ON COLUMN doctor_settings.assessment_section_order IS
  'assessment chrome: per-doctor default Assessment-tab section order (array of section-id strings). Empty = canonical default. UI-only; does not affect PDF/output order.';

ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS assessment_section_collapsed JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE doctor_settings
  DROP CONSTRAINT IF EXISTS doctor_settings_assessment_section_collapsed_is_object;
ALTER TABLE doctor_settings
  ADD CONSTRAINT doctor_settings_assessment_section_collapsed_is_object
  CHECK (jsonb_typeof(assessment_section_collapsed) = 'object');

COMMENT ON COLUMN doctor_settings.assessment_section_collapsed IS
  'assessment chrome: per-doctor default Assessment-tab section collapse map (object { sectionId: isOpen }). Empty = canonical default. UI-only.';

ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS assessment_section_hidden JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE doctor_settings
  DROP CONSTRAINT IF EXISTS doctor_settings_assessment_section_hidden_is_array;
ALTER TABLE doctor_settings
  ADD CONSTRAINT doctor_settings_assessment_section_hidden_is_array
  CHECK (jsonb_typeof(assessment_section_hidden) = 'array');

COMMENT ON COLUMN doctor_settings.assessment_section_hidden IS
  'assessment chrome: per-doctor hidden Assessment-tab sections (array of static section-id strings). Delta set; empty = nothing hidden. View-only; does not affect PDF.';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- RLS unchanged: doctor-only access via doctor_settings ownership (migration 009).
-- ============================================================================
