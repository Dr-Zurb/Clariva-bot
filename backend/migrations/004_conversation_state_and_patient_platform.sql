-- ============================================================================
-- Conversation State & Patient Platform Lookup (e-task-3)
-- ============================================================================
-- Migration: 004_conversation_state_and_patient_platform.sql
-- Date: 2026-01-30
-- Description:
--   - Add conversations.metadata JSONB for conversation state (Option A).
--   - Add patients.platform and patients.platform_external_id for
--     find-or-create placeholder patient by platform user (e.g. Instagram PSID).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. conversations.metadata (state storage per COMPLIANCE.md G)
-- ----------------------------------------------------------------------------
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS metadata JSONB;

COMMENT ON COLUMN conversations.metadata IS 'Conversation state (e.g. last intent, step). No PHI.';

-- ----------------------------------------------------------------------------
-- 2. patients: platform lookup for placeholder patient (MVP)
-- ----------------------------------------------------------------------------
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS platform TEXT,
  ADD COLUMN IF NOT EXISTS platform_external_id TEXT;

COMMENT ON COLUMN patients.platform IS 'Platform name when patient is a placeholder (e.g. instagram).';
COMMENT ON COLUMN patients.platform_external_id IS 'Platform user ID (e.g. Instagram PSID) for placeholder lookup.';

-- Unique constraint: one patient per (platform, platform_external_id) when both set
CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_platform_external_id
  ON patients (platform, platform_external_id)
  WHERE platform IS NOT NULL AND platform_external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_patients_platform ON patients(platform);
CREATE INDEX IF NOT EXISTS idx_patients_platform_external_id ON patients(platform_external_id);

-- ============================================================================
-- Migration Complete
-- ============================================================================
