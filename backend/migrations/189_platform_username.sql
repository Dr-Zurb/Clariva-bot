-- ============================================================================
-- 189_platform_username.sql
-- interactions-inbox — store IG/FB handles for Inbox identity
-- Date:    2026-07-27
-- ============================================================================
-- Purpose:
--   Doctors need @username (or FB display name), not opaque Meta user ids.
--   - comment_leads.commenter_username: from webhook `from.username` / Graph
--   - patients.platform_username: same handle once they DM (or copied on link)
--
-- Safety:
--   Additive nullable columns only. No RLS changes.
-- ============================================================================

ALTER TABLE comment_leads
  ADD COLUMN IF NOT EXISTS commenter_username TEXT NULL;

COMMENT ON COLUMN comment_leads.commenter_username IS
  'Public IG username or FB display name when known. Never log with comment_text.';

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS platform_username TEXT NULL;

COMMENT ON COLUMN patients.platform_username IS
  'Public IG/FB handle for Inbox identity before real patient name exists.';
