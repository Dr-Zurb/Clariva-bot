-- ============================================================================
-- 245_visit_page_links.sql
-- Short code for an Instagram clinic link (/d/:slug?c=CODE).
-- Date:    2026-10-02
-- ============================================================================
-- Purpose:
--   The signed booking token is too long for a chat message. An 8-character
--   code stands in for that token for one hour. The row holds the
--   conversation and doctor ids. It is not PHI. The code itself is a
--   capability and must not be logged.
--
-- Pattern:
--   New table. RLS enabled with no policies (service role only).
--
-- Safety:
--   Additive. Re-run safe (IF NOT EXISTS).
--
-- Reverse migration (document only):
--   DROP TABLE IF EXISTS visit_page_links;
-- ============================================================================

CREATE TABLE IF NOT EXISTS visit_page_links (
  code             TEXT PRIMARY KEY,
  conversation_id  UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  doctor_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  purpose          TEXT NULL CHECK (purpose IN ('times', 'change')),
  expires_at       TIMESTAMPTZ NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE visit_page_links IS
  'Short Instagram clinic link. code is an unguessable capability, not PHI. Do not log it. RLS enabled with no policies: service role only.';

ALTER TABLE visit_page_links ENABLE ROW LEVEL SECURITY;
