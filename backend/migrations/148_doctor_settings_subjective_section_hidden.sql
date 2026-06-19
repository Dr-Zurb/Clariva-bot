-- ============================================================================
-- Doctor settings subjective section hidden set (per-doctor default)
-- ============================================================================
-- Migration: 148_doctor_settings_subjective_section_hidden.sql
-- Date:      2026-06-18
-- Batch:     subjective-tab (Phase 10) — task subj-32
-- Description:
--   Per-doctor set of top-level Subjective sections the doctor has hidden
--   (P10-D2). JSONB array of static section-id strings — a delta set, not a
--   snapshot. Empty = nothing hidden (canonical visibility). The filter against
--   the live render plan is the client's job (subj-33). Doctor-authored config
--   only — not PHI.
--
-- PHI:
--   Column holds section-id strings only. RLS on doctor_settings already
--   covers all columns (migration 009). No new policies.
--
-- Idempotency:
--   ADD COLUMN IF NOT EXISTS; constraint drop+add.
--
-- Rollback (documented only):
--   ALTER TABLE doctor_settings
--     DROP CONSTRAINT IF EXISTS doctor_settings_subjective_section_hidden_is_array,
--     DROP COLUMN IF EXISTS subjective_section_hidden;
-- ============================================================================

ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS subjective_section_hidden JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE doctor_settings
  DROP CONSTRAINT IF EXISTS doctor_settings_subjective_section_hidden_is_array;
ALTER TABLE doctor_settings
  ADD CONSTRAINT doctor_settings_subjective_section_hidden_is_array
  CHECK (jsonb_typeof(subjective_section_hidden) = 'array');

COMMENT ON COLUMN doctor_settings.subjective_section_hidden IS
  'subj-32: per-doctor hidden Subjective-tab sections (array of static section-id strings). Delta set; empty = nothing hidden. View-only; does not affect PDF/cc/hopi.';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- RLS unchanged: doctor-only access via doctor_settings ownership (migration 009).
-- ============================================================================
