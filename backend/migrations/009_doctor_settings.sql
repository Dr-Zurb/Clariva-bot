-- ============================================================================
-- Doctor Settings Table (e-task-4.1)
-- ============================================================================
-- Migration: 009_doctor_settings.sql
-- Date: 2026-01-30
-- Description:
--   Per-doctor appointment fee and currency (and optional country for gateway
--   routing). When null, app uses env fallback (APPOINTMENT_FEE_*, DEFAULT_DOCTOR_COUNTRY).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Create doctor_settings table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS doctor_settings (
  doctor_id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  appointment_fee_minor  BIGINT NULL,   -- Fee in smallest unit (paise/cents); NULL = use env fallback
  appointment_fee_currency TEXT NULL,    -- e.g. INR, USD; NULL = use env fallback
  country                 TEXT NULL,     -- For gateway routing (IN -> Razorpay, else PayPal); NULL = use env
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doctor_settings_doctor_id ON doctor_settings(doctor_id);

-- ----------------------------------------------------------------------------
-- 2. RLS: doctor can read/insert/update own row; service role can read (worker)
-- ----------------------------------------------------------------------------
ALTER TABLE doctor_settings ENABLE ROW LEVEL SECURITY;

-- Doctors can read their own settings
CREATE POLICY "Doctors can read own settings"
  ON doctor_settings FOR SELECT
  USING (doctor_id = auth.uid());

-- Doctors can insert their own row (e.g. when setting fee for first time)
CREATE POLICY "Doctors can insert own settings"
  ON doctor_settings FOR INSERT
  WITH CHECK (doctor_id = auth.uid());

-- Doctors can update their own row
CREATE POLICY "Doctors can update own settings"
  ON doctor_settings FOR UPDATE
  USING (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());

-- Service role can read (webhook worker loads fee/currency for payment link)
CREATE POLICY "Service role can read doctor settings"
  ON doctor_settings FOR SELECT
  USING (auth.role() = 'service_role');

-- ----------------------------------------------------------------------------
-- 3. updated_at trigger (reuse update_updated_at_column from 001)
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS doctor_settings_updated_at ON doctor_settings;
CREATE TRIGGER doctor_settings_updated_at
  BEFORE UPDATE ON doctor_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Migration Complete
-- ============================================================================
