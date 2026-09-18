-- ============================================================================
-- 188_comment_leads_platform.sql
-- facebook-messenger-channel · fbm-09 — extend comment_leads for Facebook Page comments
-- Date:    2026-07-26
-- ============================================================================
-- Purpose:
--   Add platform discriminator so Instagram and Facebook Page comment leads
--   share one table. Existing rows default to 'instagram'.
--   commenter_ig_id stores the platform-scoped commenter id (IGSID or FB
--   user/PSID) — column name kept for backward compatibility.
--
-- Safety:
--   Additive only. Default preserves IG rows. CHECK + index for lookups.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. platform column
-- ----------------------------------------------------------------------------
ALTER TABLE comment_leads
  ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'instagram';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'comment_leads_platform_check'
  ) THEN
    ALTER TABLE comment_leads
      ADD CONSTRAINT comment_leads_platform_check
      CHECK (platform IN ('instagram', 'facebook'));
  END IF;
END $$;

COMMENT ON COLUMN comment_leads.platform IS
  'Source channel: instagram | facebook. fbm-09.';

COMMENT ON COLUMN comment_leads.commenter_ig_id IS
  'Platform-scoped commenter id (Instagram user id or Facebook user/PSID). '
  'Name kept for backward compatibility; interpret with platform.';

COMMENT ON TABLE comment_leads IS
  'Leads from Instagram or Facebook Page comments. Links to conversation when commenter DMs.';

CREATE INDEX IF NOT EXISTS idx_comment_leads_doctor_platform
  ON comment_leads(doctor_id, platform);

CREATE INDEX IF NOT EXISTS idx_comment_leads_commenter_platform
  ON comment_leads(commenter_ig_id, platform);
