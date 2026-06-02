-- ============================================================================
-- Per-doctor placeholder rows (rcp-26) — narrow legacy global unique index
-- ============================================================================
-- Migration: 114_perdoctor_placeholder_global_index_narrow.sql
-- Date: 2026-05-31
-- Description:
--   rcp-26 creates per-doctor placeholder rows (doctor_id set) for new contacts.
--   The legacy global UNIQUE(platform, platform_external_id) from migration 004
--   blocks a second row for the same IG sender. Narrow it to legacy rows only
--   (doctor_id IS NULL) so per-doctor rows can coexist until rcp-29 drops this
--   index entirely after backfill.
--   The per-doctor partial unique (113) remains the enforcement for new rows.
-- ============================================================================

DROP INDEX IF EXISTS idx_patients_platform_external_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_platform_external_id
  ON patients (platform, platform_external_id)
  WHERE platform IS NOT NULL
    AND platform_external_id IS NOT NULL
    AND doctor_id IS NULL;

-- ============================================================================
-- Migration Complete
-- ============================================================================
