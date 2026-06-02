-- ============================================================================
-- 111_web_push_subscriptions.sql
-- Text consult Sub-batch D · task-text-D6a — Web Push part 1 (schema only).
-- Date: 2026-05-24
-- ============================================================================
-- Purpose:
--   Store browser Web Push subscriptions for doctors and patients so the
--   backend can fan-out notifications when the PWA is fully backgrounded.
--   D6b adds subscribe/unsubscribe controllers; D6c verifies end-to-end.
--
--   Note: task D6a originally targeted migration 086, but 086 was already
--   taken by video_call_quality — this ships as 111 (next free after 110).
--
-- Rollback:
--   DROP POLICY IF EXISTS web_push_subscriptions_delete_own ON web_push_subscriptions;
--   DROP POLICY IF EXISTS web_push_subscriptions_update_own ON web_push_subscriptions;
--   DROP POLICY IF EXISTS web_push_subscriptions_insert_own ON web_push_subscriptions;
--   DROP POLICY IF EXISTS web_push_subscriptions_select_own ON web_push_subscriptions;
--   DROP INDEX IF EXISTS idx_web_push_subscriptions_user_active;
--   DROP TABLE IF EXISTS web_push_subscriptions CASCADE;
-- ============================================================================

CREATE TABLE IF NOT EXISTS web_push_subscriptions (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID         NOT NULL,            -- doctor or patient principal id
  user_role     TEXT         NOT NULL CHECK (user_role IN ('doctor', 'patient')),
  endpoint      TEXT         NOT NULL,
  p256dh_key    TEXT         NOT NULL,
  auth_key      TEXT         NOT NULL,
  user_agent    TEXT,                              -- for debugging
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  last_used_at  TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ,                      -- set when browser/provider unsubscribes
  UNIQUE (user_id, endpoint)                       -- one subscription per device per user
);

CREATE INDEX IF NOT EXISTS idx_web_push_subscriptions_user_active
  ON web_push_subscriptions (user_id) WHERE revoked_at IS NULL;

COMMENT ON TABLE web_push_subscriptions IS
  'task-text-D6a: Web Push subscription endpoints for doctor/patient PWAs. Revoked rows kept for audit.';

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE web_push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS web_push_subscriptions_select_own ON web_push_subscriptions;
CREATE POLICY web_push_subscriptions_select_own
  ON web_push_subscriptions FOR SELECT
  USING (user_id = public.safe_uuid_sub());

DROP POLICY IF EXISTS web_push_subscriptions_insert_own ON web_push_subscriptions;
CREATE POLICY web_push_subscriptions_insert_own
  ON web_push_subscriptions FOR INSERT
  WITH CHECK (user_id = public.safe_uuid_sub());

DROP POLICY IF EXISTS web_push_subscriptions_update_own ON web_push_subscriptions;
CREATE POLICY web_push_subscriptions_update_own
  ON web_push_subscriptions FOR UPDATE
  USING (user_id = public.safe_uuid_sub())
  WITH CHECK (user_id = public.safe_uuid_sub());

DROP POLICY IF EXISTS web_push_subscriptions_delete_own ON web_push_subscriptions;
CREATE POLICY web_push_subscriptions_delete_own
  ON web_push_subscriptions FOR DELETE
  USING (user_id = public.safe_uuid_sub());
