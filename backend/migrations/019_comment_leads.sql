-- ============================================================================
-- Comment Leads Table (Comments Management Initiative)
-- ============================================================================
-- Migration: 019_comment_leads.sql
-- Date: 2026-03-18
-- Description:
--   Store leads captured from Instagram post comments. Supports lead capture,
--   intent classification, outreach tracking, and linking to conversations
--   when the commenter DMs. No PHI in logs; comment_text stored only.
--
-- Reference: COMMENTS_MANAGEMENT_PLAN.md
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Create comment_leads table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comment_leads (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  comment_id            TEXT NOT NULL UNIQUE,
  commenter_ig_id       TEXT NOT NULL,
  comment_text          TEXT NOT NULL,
  media_id              TEXT,
  intent                TEXT,
  confidence            DECIMAL(3,2),
  public_reply_sent     BOOLEAN NOT NULL DEFAULT FALSE,
  dm_sent               BOOLEAN NOT NULL DEFAULT FALSE,
  conversation_id       UUID REFERENCES conversations(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE comment_leads IS 'Leads from Instagram post comments. Links to conversation when commenter DMs.';
COMMENT ON COLUMN comment_leads.comment_id IS 'Instagram comment ID (unique, idempotency key)';
COMMENT ON COLUMN comment_leads.commenter_ig_id IS 'Commenter Instagram user ID';
COMMENT ON COLUMN comment_leads.comment_text IS 'Raw comment (may contain PHI - store only, never log)';
COMMENT ON COLUMN comment_leads.media_id IS 'Post/media ID where comment was made';
COMMENT ON COLUMN comment_leads.intent IS 'Classified intent: book_appointment, check_availability, etc.';
COMMENT ON COLUMN comment_leads.confidence IS 'Intent confidence 0-1';
COMMENT ON COLUMN comment_leads.conversation_id IS 'Set when commenter DMs and we link to conversation';

-- Index for doctor lookups
CREATE INDEX IF NOT EXISTS idx_comment_leads_doctor_id ON comment_leads(doctor_id);

-- Index for linking when user DMs (lookup by commenter)
CREATE INDEX IF NOT EXISTS idx_comment_leads_commenter_ig_id ON comment_leads(commenter_ig_id);

-- ----------------------------------------------------------------------------
-- 2. RLS: doctors read own; service role read/write (worker)
-- ----------------------------------------------------------------------------
ALTER TABLE comment_leads ENABLE ROW LEVEL SECURITY;

-- Doctors can read their own comment leads
CREATE POLICY "Doctors can read own comment leads"
  ON comment_leads FOR SELECT
  USING (doctor_id = auth.uid());

-- Service role can insert (worker creates leads)
CREATE POLICY "Service role can insert comment leads"
  ON comment_leads FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- Service role can update (worker updates dm_sent, public_reply_sent, conversation_id)
CREATE POLICY "Service role can update comment leads"
  ON comment_leads FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Service role can read (worker queries)
CREATE POLICY "Service role can read comment leads"
  ON comment_leads FOR SELECT
  USING (auth.role() = 'service_role');

-- ----------------------------------------------------------------------------
-- 3. updated_at trigger (reuse update_updated_at_column from 001)
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS comment_leads_updated_at ON comment_leads;
CREATE TRIGGER comment_leads_updated_at
  BEFORE UPDATE ON comment_leads
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Migration Complete
-- ============================================================================
