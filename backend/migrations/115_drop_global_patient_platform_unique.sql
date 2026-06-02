-- ============================================================================
-- Per-doctor identity converge (rcp-29) — drop legacy global unique index
-- ============================================================================
-- Migration: 115_drop_global_patient_platform_unique.sql
-- Date: 2026-05-31
-- Description:
--   Run backend/scripts/backfill-perdoctor-patient-identity.ts BEFORE applying
--   this migration in each environment.
--   Drops idx_patients_platform_external_id (migration 004 / narrowed in 114).
--   Per-doctor identity is enforced by idx_patients_doctor_platform_external_id
--   (migration 113).
--   Supersedes the global (platform, platform_external_id) uniqueness from
--   004_conversation_state_and_patient_platform.sql and 007_fix_patients_index_name.sql.
-- ============================================================================

DROP INDEX IF EXISTS idx_patients_platform_external_id;

-- ============================================================================
-- Migration Complete
-- ============================================================================
