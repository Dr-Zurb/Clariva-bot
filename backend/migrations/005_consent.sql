-- ============================================================================
-- Consent Columns on Patients (e-task-5)
-- ============================================================================
-- Migration: 005_consent.sql
-- Date: 2026-01-30
-- Description:
--   Add consent tracking columns to patients table per COMPLIANCE.md C.
--   Consent must be obtained before persisting PHI; timestamp and method stored.
-- ============================================================================

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS consent_status TEXT DEFAULT 'pending'
    CHECK (consent_status IN ('pending', 'granted', 'revoked')),
  ADD COLUMN IF NOT EXISTS consent_granted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consent_method TEXT;

COMMENT ON COLUMN patients.consent_status IS 'Consent status: pending (no consent yet), granted (PHI persisted after consent), revoked (user revoked; lifecycle applies).';
COMMENT ON COLUMN patients.consent_granted_at IS 'When consent was granted (ISO timestamp).';
COMMENT ON COLUMN patients.consent_method IS 'How consent was obtained (e.g. instagram_dm).';

-- ============================================================================
-- Migration Complete
-- ============================================================================
