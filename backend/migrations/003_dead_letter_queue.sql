-- ============================================================================
-- Dead Letter Queue Table Migration
-- ============================================================================
-- Migration: 003_dead_letter_queue.sql
-- Date: 2026-01-21
-- Description: Creates dead letter queue table for storing failed webhook payloads
-- 
-- Purpose:
--   - Store encrypted webhook payloads that failed after max retries
--   - Enable manual review and recovery of failed webhooks
--   - Ensure compliance with PHI/PII encryption requirements
--   - Provide audit trail for webhook failures
--
-- Security:
--   - Payloads are encrypted before storage (application-level encryption)
--   - RLS policies restrict access to service role and admin users only
--   - No PHI/PII in logs (only metadata logged)
--
-- Retention:
--   - 90 days per WEBHOOKS.md
--   - Cleanup job should delete records older than 90 days
-- ============================================================================

-- ============================================================================
-- 1. DEAD LETTER QUEUE TABLE
-- ============================================================================

-- ----------------------------------------------------------------------------
-- dead_letter_queue table
-- Purpose: Store failed webhook payloads after max retries
-- PHI: payload_encrypted contains encrypted webhook payload (may contain PHI/PII)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dead_letter_queue (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id            TEXT NOT NULL,  -- Platform event ID or hash
    provider            TEXT NOT NULL CHECK (provider IN ('facebook', 'instagram', 'whatsapp')),
    received_at         TIMESTAMPTZ NOT NULL DEFAULT now(),  -- When webhook was received
    correlation_id      TEXT NOT NULL,  -- Request correlation ID
    payload_encrypted   TEXT NOT NULL,  -- Encrypted webhook payload (AES-256-GCM)
    error_message       TEXT NOT NULL,  -- Error that caused failure
    retry_count         INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),  -- Number of retry attempts
    failed_at           TIMESTAMPTZ NOT NULL DEFAULT now()  -- When moved to dead letter queue
);

-- ============================================================================
-- 2. INDEXES
-- ============================================================================

-- Index for querying by provider (common filter)
CREATE INDEX IF NOT EXISTS idx_dead_letter_provider 
ON dead_letter_queue(provider);

-- Index for querying by failure date (for cleanup and date range queries)
CREATE INDEX IF NOT EXISTS idx_dead_letter_failed_at 
ON dead_letter_queue(failed_at);

-- Index for querying by event ID (for recovery operations)
CREATE INDEX IF NOT EXISTS idx_dead_letter_event_id 
ON dead_letter_queue(event_id);

-- ============================================================================
-- 3. ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on dead_letter_queue table
ALTER TABLE dead_letter_queue ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- dead_letter_queue table policies
-- Pattern: Service role full access, admin users read-only (for compliance reviews)
-- ----------------------------------------------------------------------------

-- SELECT: Service role can read all, admin users can read all (for compliance reviews)
CREATE POLICY "Service role can read dead letter queue"
ON dead_letter_queue FOR SELECT
USING (auth.role() = 'service_role');

CREATE POLICY "Admin users can read dead letter queue"
ON dead_letter_queue FOR SELECT
USING (
  auth.jwt() ->> 'role' = 'admin'
  -- **CRITICAL:** Admin role claim MUST be minted server-side only (never client-controlled)
  -- Admin role claim MUST be mapped from a database table (e.g., user_roles table)
  -- NEVER trust client-provided role claims without server-side verification
);

-- INSERT: Service role only (application stores dead letter webhooks)
CREATE POLICY "Service role can insert dead letter queue"
ON dead_letter_queue FOR INSERT
WITH CHECK (auth.role() = 'service_role');

-- UPDATE: Service role only (for marking as reprocessed, etc.)
CREATE POLICY "Service role can update dead letter queue"
ON dead_letter_queue FOR UPDATE
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- DELETE: Service role only (for cleanup after successful reprocessing or retention expiry)
CREATE POLICY "Service role can delete dead letter queue"
ON dead_letter_queue FOR DELETE
USING (auth.role() = 'service_role');

-- No user access (default deny - regular users cannot access dead letter queue)

-- ============================================================================
-- 4. COMMENTS
-- ============================================================================

-- Table comment
COMMENT ON TABLE dead_letter_queue IS 
'Stores failed webhook payloads after max retries. Payloads are encrypted before storage. Access restricted to service role and admin users only.';

-- Column comments
COMMENT ON COLUMN dead_letter_queue.id IS 'Unique identifier for dead letter record';
COMMENT ON COLUMN dead_letter_queue.event_id IS 'Platform-specific event ID or hash';
COMMENT ON COLUMN dead_letter_queue.provider IS 'Webhook provider platform (facebook, instagram, whatsapp)';
COMMENT ON COLUMN dead_letter_queue.received_at IS 'Timestamp when webhook was originally received';
COMMENT ON COLUMN dead_letter_queue.correlation_id IS 'Request correlation ID for tracing';
COMMENT ON COLUMN dead_letter_queue.payload_encrypted IS 'Encrypted webhook payload (AES-256-GCM). Contains PHI/PII - must be encrypted.';
COMMENT ON COLUMN dead_letter_queue.error_message IS 'Error message that caused webhook to fail';
COMMENT ON COLUMN dead_letter_queue.retry_count IS 'Number of retry attempts before moving to dead letter queue';
COMMENT ON COLUMN dead_letter_queue.failed_at IS 'Timestamp when webhook was moved to dead letter queue';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- Next Steps:
-- 1. Execute migration in Supabase SQL Editor
-- 2. Verify table, indexes, and RLS policies are created
-- 3. Test service functions (store, get, list, reprocess)
-- 4. Configure ENCRYPTION_KEY environment variable
-- ============================================================================
