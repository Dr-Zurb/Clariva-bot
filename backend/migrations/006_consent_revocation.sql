-- ============================================================================
-- Consent Revocation (e-task-5 revocation flow)
-- ============================================================================
-- Migration: 006_consent_revocation.sql
-- Date: 2026-01-30
-- Description:
--   Add consent_revoked_at to patients for revocation audit trail per COMPLIANCE F.
-- ============================================================================

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS consent_revoked_at TIMESTAMPTZ;

COMMENT ON COLUMN patients.consent_revoked_at IS 'When consent was revoked (ISO timestamp). PHI anonymized per lifecycle.';

-- ============================================================================
-- Migration Complete
-- ============================================================================
