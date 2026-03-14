-- ============================================================================
-- Slot Selections & Patients Email (Appointment Booking Flow V2)
-- ============================================================================
-- Migration: 014_slot_selections_and_patients_email.sql
-- Date: 2026-03-13
-- Description:
--   (1) Create slot_selections table for external slot picker flow.
--       Stores user's slot choice; one draft per conversation; backend-only access.
--   (2) Add patients.email column for optional email (receipts).
--       PHI; encrypted at rest (platform-level Supabase).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. slot_selections table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS slot_selections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slot_start TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  consumed_at TIMESTAMPTZ,
  UNIQUE(conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_slot_selections_conversation_id ON slot_selections(conversation_id);

ALTER TABLE slot_selections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage slot selections"
  ON slot_selections FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ----------------------------------------------------------------------------
-- 2. patients.email column
-- ----------------------------------------------------------------------------
ALTER TABLE patients ADD COLUMN IF NOT EXISTS email TEXT NULL;
COMMENT ON COLUMN patients.email IS 'Optional; for receipts. Encrypted at rest (platform-level).';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- RLS: slot_selections service role only; patients has existing RLS.
-- ============================================================================
