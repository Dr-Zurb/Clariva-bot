-- ============================================================================
-- Doctor settings subjective section collapse map (per-doctor default)
-- ============================================================================
-- Migration: 147_doctor_settings_subjective_section_collapsed.sql
-- Date:      2026-06-18
-- Batch:     subjective-tab (Phase 9) — task subj-28
-- Description:
--   Per-doctor open/closed default for each top-level Subjective section (P9-D2).
--   JSONB object map { [sectionId]: boolean } where true = open. Empty = use
--   the canonical default collapse state. Doctor-authored config only — not PHI.
--   Stores overrides only; the merge against the live registry is the client's job.
--
-- PHI:
--   Column holds section-id strings → booleans only. RLS on doctor_settings
--   already covers all columns (migration 009). No new policies.
--
-- Idempotency:
--   ADD COLUMN IF NOT EXISTS; constraint drop+add.
--
-- Rollback (documented only):
--   ALTER TABLE doctor_settings
--     DROP CONSTRAINT IF EXISTS doctor_settings_subjective_section_collapsed_is_object,
--     DROP COLUMN IF EXISTS subjective_section_collapsed;
-- ============================================================================

ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS subjective_section_collapsed JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE doctor_settings
  DROP CONSTRAINT IF EXISTS doctor_settings_subjective_section_collapsed_is_object;
ALTER TABLE doctor_settings
  ADD CONSTRAINT doctor_settings_subjective_section_collapsed_is_object
  CHECK (jsonb_typeof(subjective_section_collapsed) = 'object');

COMMENT ON COLUMN doctor_settings.subjective_section_collapsed IS
  'subj-28: per-doctor default Subjective-tab section collapse map (object { sectionId: isOpen }). Empty = canonical default. UI-only; does not affect PDF/cc/hopi.';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- RLS unchanged: doctor-only access via doctor_settings ownership (migration 009).
-- ============================================================================
