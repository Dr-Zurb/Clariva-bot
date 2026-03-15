-- ============================================================================
-- Appointments conversation_id Column
-- ============================================================================
-- Migration: 017_appointments_conversation_id.sql
-- Description:
--   Add conversation_id to appointments so payment confirmation DM can be sent
--   to the chat user when booking for someone else (patient has no platform_external_id).
-- ============================================================================

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS conversation_id UUID NULL REFERENCES conversations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_conversation_id ON appointments(conversation_id);
