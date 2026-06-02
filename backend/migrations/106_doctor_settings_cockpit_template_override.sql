-- ============================================================================
-- 106: doctor_settings.cockpit_template_override
-- ============================================================================
-- Adds a per-doctor preferred cockpit template, used by R-MOD-full to pin
-- a single layout globally for a doctor regardless of appointment modality.
--
-- NULL = auto-select per modality + state (the cockpit-v2 default).
-- Non-NULL values restricted by CHECK to the four R-MOD-full template ids.
--
-- Numbering note: originally planned as migration 104 (tmr-03), but
-- 104_patients_tags.sql and 105_voice_call_quality.sql were already shipped.
--
-- Row-level security:
--   Reuses the existing doctor_settings RLS policy (migration 009). Each
--   doctor sees and modifies only their own row; no new policy SQL required.
--
-- API projection:
--   doctor-settings-service.ts uses explicit SELECT_COLUMNS (not SELECT *).
--   cockpit_template_override was added to that list in tmr-03 so GET/PATCH
--   flows through the existing /api/v1/settings/doctor endpoints.
--
-- Source: docs/Work/Daily-plans/May 2026/21-05-2026/templates-r-mod/
-- Plan:   plan-templates-r-mod-batch.md (DL-4)
-- ============================================================================

-- ── Column ───────────────────────────────────────────────────────────────────

ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS cockpit_template_override TEXT NULL;

-- ── Check constraint (drop-then-add → idempotent re-run) ─────────────────────

ALTER TABLE doctor_settings
  DROP CONSTRAINT IF EXISTS doctor_settings_cockpit_template_override_check;

ALTER TABLE doctor_settings
  ADD CONSTRAINT doctor_settings_cockpit_template_override_check
  CHECK (
    cockpit_template_override IS NULL
    OR cockpit_template_override IN (
      'telemed-video',
      'telemed-voice',
      'telemed-text',
      'review'
    )
  );

-- ── Column comment ───────────────────────────────────────────────────────────

COMMENT ON COLUMN doctor_settings.cockpit_template_override IS
  'Doctor''s preferred cockpit template (R-MOD-full, 2026-05-21). NULL = auto-select per modality + state.';
