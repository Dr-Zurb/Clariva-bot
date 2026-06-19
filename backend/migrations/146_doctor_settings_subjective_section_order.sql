-- ============================================================================
-- Doctor settings subjective section order (per-doctor default)
-- ============================================================================
-- Migration: 146_doctor_settings_subjective_section_order.sql
-- Date:      2026-06-17
-- Batch:     subjective-tab (Phase 8) — task subj-24
-- Description:
--   Per-doctor preferred Subjective-tab section render order (P8-D2).
--   JSONB array of stable section-id strings; empty = use canonical default.
--   Doctor-authored config only — not PHI.
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
--     DROP CONSTRAINT IF EXISTS doctor_settings_subjective_section_order_is_array,
--     DROP COLUMN IF EXISTS subjective_section_order;
-- ============================================================================

ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS subjective_section_order JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE doctor_settings
  DROP CONSTRAINT IF EXISTS doctor_settings_subjective_section_order_is_array;
ALTER TABLE doctor_settings
  ADD CONSTRAINT doctor_settings_subjective_section_order_is_array
  CHECK (jsonb_typeof(subjective_section_order) = 'array');

COMMENT ON COLUMN doctor_settings.subjective_section_order IS
  'subj-24: per-doctor default Subjective-tab section order (array of section-id strings). Empty = canonical default. UI-only; does not affect PDF/cc/hopi.';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- RLS unchanged: doctor-only access via doctor_settings ownership (migration 009).
-- ============================================================================
