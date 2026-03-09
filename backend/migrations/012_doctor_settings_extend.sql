-- ============================================================================
-- Extend Doctor Settings Table (e-task-1)
-- ============================================================================
-- Migration: 012_doctor_settings_extend.sql
-- Date: 2026-03-09
-- Description:
--   Add columns for practice branding, timezone, slot configuration, booking
--   limits, and other useful doctor settings. Backward compatible.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Practice branding & timezone
-- ----------------------------------------------------------------------------
ALTER TABLE doctor_settings ADD COLUMN IF NOT EXISTS practice_name TEXT NULL;
ALTER TABLE doctor_settings ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata';
ALTER TABLE doctor_settings ADD COLUMN IF NOT EXISTS business_hours_summary TEXT NULL;

-- ----------------------------------------------------------------------------
-- 2. Slot & booking configuration
-- ----------------------------------------------------------------------------
ALTER TABLE doctor_settings ADD COLUMN IF NOT EXISTS slot_interval_minutes INTEGER NOT NULL DEFAULT 15;
ALTER TABLE doctor_settings ADD COLUMN IF NOT EXISTS max_advance_booking_days INTEGER NOT NULL DEFAULT 90;
ALTER TABLE doctor_settings ADD COLUMN IF NOT EXISTS min_advance_hours INTEGER NOT NULL DEFAULT 0;

-- ----------------------------------------------------------------------------
-- 3. Additional doctor settings
-- ----------------------------------------------------------------------------
ALTER TABLE doctor_settings ADD COLUMN IF NOT EXISTS cancellation_policy_hours INTEGER NULL;
ALTER TABLE doctor_settings ADD COLUMN IF NOT EXISTS max_appointments_per_day INTEGER NULL;
ALTER TABLE doctor_settings ADD COLUMN IF NOT EXISTS booking_buffer_minutes INTEGER NULL;
ALTER TABLE doctor_settings ADD COLUMN IF NOT EXISTS welcome_message TEXT NULL;
ALTER TABLE doctor_settings ADD COLUMN IF NOT EXISTS specialty TEXT NULL;
ALTER TABLE doctor_settings ADD COLUMN IF NOT EXISTS address_summary TEXT NULL;
ALTER TABLE doctor_settings ADD COLUMN IF NOT EXISTS consultation_types TEXT NULL;
ALTER TABLE doctor_settings ADD COLUMN IF NOT EXISTS default_notes TEXT NULL;

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- RLS: No changes needed; existing policies cover new columns.
-- ============================================================================
