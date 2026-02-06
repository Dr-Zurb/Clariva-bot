-- ============================================================================
-- Doctor Instagram Table (e-task-1, MVP Connect Instagram)
-- ============================================================================
-- Migration: 011_doctor_instagram.sql
-- Date: 2026-02-06
-- Description:
--   Per-doctor Instagram (or Facebook Page) connection for multi-tenant MVP.
--   Stores page identifier, access token, and optional username for display.
--   No PHI. Token stored in DB; encryption at rest is platform-level (Supabase).
--   Webhook resolution: lookup doctor_id by instagram_page_id for incoming DMs.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Create doctor_instagram table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS doctor_instagram (
  doctor_id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  instagram_page_id       TEXT NOT NULL UNIQUE,
  instagram_access_token  TEXT NOT NULL,
  instagram_username      TEXT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for webhook lookup: resolve page_id -> doctor_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_doctor_instagram_page_id ON doctor_instagram(instagram_page_id);

-- ----------------------------------------------------------------------------
-- 2. RLS: doctor can read/insert/update own row; service role can read (worker)
-- ----------------------------------------------------------------------------
ALTER TABLE doctor_instagram ENABLE ROW LEVEL SECURITY;

-- Doctors can read their own Instagram link
CREATE POLICY "Doctors can read own instagram"
  ON doctor_instagram FOR SELECT
  USING (doctor_id = auth.uid());

-- Doctors can insert their own row (connect flow)
CREATE POLICY "Doctors can insert own instagram"
  ON doctor_instagram FOR INSERT
  WITH CHECK (doctor_id = auth.uid());

-- Doctors can update their own row (e.g. token refresh, username)
CREATE POLICY "Doctors can update own instagram"
  ON doctor_instagram FOR UPDATE
  USING (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());

-- Doctors can delete their own row (disconnect)
CREATE POLICY "Doctors can delete own instagram"
  ON doctor_instagram FOR DELETE
  USING (doctor_id = auth.uid());

-- Service role can read (webhook worker resolves page_id -> doctor_id)
CREATE POLICY "Service role can read doctor instagram"
  ON doctor_instagram FOR SELECT
  USING (auth.role() = 'service_role');

-- ----------------------------------------------------------------------------
-- 3. updated_at trigger (reuse update_updated_at_column from 001)
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS doctor_instagram_updated_at ON doctor_instagram;
CREATE TRIGGER doctor_instagram_updated_at
  BEFORE UPDATE ON doctor_instagram
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Migration Complete
-- ============================================================================
