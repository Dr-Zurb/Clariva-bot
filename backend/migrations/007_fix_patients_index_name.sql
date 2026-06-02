-- ============================================================================
-- Fix Patients Index Name Conflict (migration 004)
-- ============================================================================
-- Migration: 007_fix_patients_index_name.sql
-- Date: 2026-01-30
-- Description:
--   Migration 004 used idx_patients_platform_external_id for both:
--   (a) UNIQUE composite on (platform, platform_external_id)
--   (b) Single-column index on platform_external_id
--   PostgreSQL index names must be unique; (b) would fail.
--   This migration adds the single-column index with a distinct name.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_patients_platform_external_id_col
  ON patients(platform_external_id)
  WHERE platform_external_id IS NOT NULL;

-- ============================================================================
-- Migration Complete
-- ============================================================================
