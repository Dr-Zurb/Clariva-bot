-- ============================================================================
-- Add consultation_type to Appointments (e-task-2)
-- ============================================================================
-- Migration: 013_appointments_consultation_type.sql
-- Date: 2026-03-10
-- Description:
--   Add consultation_type column to appointments (e.g. 'video', 'in_clinic').
--   Backward compatible; NULL for existing rows.
-- ============================================================================

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS consultation_type TEXT NULL;

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- RLS: No changes needed; existing policies cover new column.
-- ============================================================================
