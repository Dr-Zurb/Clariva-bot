-- ============================================================================
-- Doctor settings objective layout config (per-doctor defaults)
-- ============================================================================
-- Migration: 152_doctor_settings_objective_layout.sql
-- Date:      2026-06-19
-- Batch:     objective-tab (Phase 3) — task obj-10
-- Description:
--   Per-doctor Objective-tab layout config (P3-D2). Four additive JSONB
--   columns cloning the shipped subjective layout columns (migrations 145–148):
--     objective_section_order      — array of section-id strings (empty = canonical default).
--     objective_section_collapsed  — object map { sectionId: isOpen } (empty = canonical default).
--     objective_section_hidden     — delta array of static section-id strings (empty = nothing hidden).
--     objective_custom_sections    — array of doctor-defined custom objective sections.
--   Doctor-authored config only — section-id strings / headings / booleans, never patient data.
--
-- PHI:
--   Columns hold config strings + booleans only. RLS on doctor_settings already
--   covers all columns (migration 009). No new policies.
--
-- Idempotency:
--   ADD COLUMN IF NOT EXISTS; constraint drop+add per column.
--
-- Rollback (documented only):
--   ALTER TABLE doctor_settings
--     DROP CONSTRAINT IF EXISTS doctor_settings_objective_section_order_is_array,
--     DROP CONSTRAINT IF EXISTS doctor_settings_objective_section_collapsed_is_object,
--     DROP CONSTRAINT IF EXISTS doctor_settings_objective_section_hidden_is_array,
--     DROP CONSTRAINT IF EXISTS doctor_settings_objective_custom_sections_is_array,
--     DROP COLUMN IF EXISTS objective_section_order,
--     DROP COLUMN IF EXISTS objective_section_collapsed,
--     DROP COLUMN IF EXISTS objective_section_hidden,
--     DROP COLUMN IF EXISTS objective_custom_sections;
-- ============================================================================

-- ----------------------------------------------------------------------------
-- objective_section_order (array of section-id strings)
-- ----------------------------------------------------------------------------
ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS objective_section_order JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE doctor_settings
  DROP CONSTRAINT IF EXISTS doctor_settings_objective_section_order_is_array;
ALTER TABLE doctor_settings
  ADD CONSTRAINT doctor_settings_objective_section_order_is_array
  CHECK (jsonb_typeof(objective_section_order) = 'array');

COMMENT ON COLUMN doctor_settings.objective_section_order IS
  'obj-10: per-doctor default Objective-tab section order (array of section-id strings). Empty = canonical default. UI-only; does not affect PDF/examination_findings/test_results/vitals.';

-- ----------------------------------------------------------------------------
-- objective_section_collapsed (object map { sectionId: isOpen })
-- ----------------------------------------------------------------------------
ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS objective_section_collapsed JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE doctor_settings
  DROP CONSTRAINT IF EXISTS doctor_settings_objective_section_collapsed_is_object;
ALTER TABLE doctor_settings
  ADD CONSTRAINT doctor_settings_objective_section_collapsed_is_object
  CHECK (jsonb_typeof(objective_section_collapsed) = 'object');

COMMENT ON COLUMN doctor_settings.objective_section_collapsed IS
  'obj-10: per-doctor default Objective-tab section collapse map (object { sectionId: isOpen }). Empty = canonical default. UI-only; does not affect PDF/examination_findings/test_results/vitals.';

-- ----------------------------------------------------------------------------
-- objective_section_hidden (delta array of static section-id strings)
-- ----------------------------------------------------------------------------
ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS objective_section_hidden JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE doctor_settings
  DROP CONSTRAINT IF EXISTS doctor_settings_objective_section_hidden_is_array;
ALTER TABLE doctor_settings
  ADD CONSTRAINT doctor_settings_objective_section_hidden_is_array
  CHECK (jsonb_typeof(objective_section_hidden) = 'array');

COMMENT ON COLUMN doctor_settings.objective_section_hidden IS
  'obj-10: per-doctor hidden Objective-tab sections (array of static section-id strings). Delta set; empty = nothing hidden. View-only; does not affect PDF/examination_findings/test_results/vitals.';

-- ----------------------------------------------------------------------------
-- objective_custom_sections (array of doctor-defined custom objective sections)
-- ----------------------------------------------------------------------------
ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS objective_custom_sections JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE doctor_settings
  DROP CONSTRAINT IF EXISTS doctor_settings_objective_custom_sections_is_array;
ALTER TABLE doctor_settings
  ADD CONSTRAINT doctor_settings_objective_custom_sections_is_array
  CHECK (jsonb_typeof(objective_custom_sections) = 'array');

COMMENT ON COLUMN doctor_settings.objective_custom_sections IS
  'obj-10: per-doctor default custom Objective-tab sections (array). Doctor-authored headings/structure; seeds fresh visits when empty. View-only; does not affect PDF/examination_findings/test_results/vitals.';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- RLS unchanged: doctor-only access via doctor_settings ownership (migration 009).
-- ============================================================================
