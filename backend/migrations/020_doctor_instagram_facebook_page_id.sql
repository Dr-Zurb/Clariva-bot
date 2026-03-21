-- ============================================================================
-- Add facebook_page_id to doctor_instagram (DM 2018001 fix)
-- ============================================================================
-- Migration: 020_doctor_instagram_facebook_page_id.sql
-- Date: 2026-03-21
-- Description:
--   Webhooks may send entry.id as Facebook Page ID; we store instagram_page_id
--   (Instagram account ID). Add facebook_page_id so we can match when webhook
--   sends Page ID. Fixes "(#100) No matching user found" (2018001).
-- ============================================================================

ALTER TABLE doctor_instagram ADD COLUMN IF NOT EXISTS facebook_page_id TEXT;

-- Index for webhook lookup when entry.id is Page ID
CREATE INDEX IF NOT EXISTS idx_doctor_instagram_facebook_page_id
  ON doctor_instagram(facebook_page_id)
  WHERE facebook_page_id IS NOT NULL;

-- ============================================================================
-- Migration Complete
-- ============================================================================
