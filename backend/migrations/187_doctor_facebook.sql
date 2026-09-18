-- ============================================================================
-- 187_doctor_facebook.sql
-- facebook-messenger-channel · fbm-02 — per-doctor Facebook Page connection
-- Date:    2026-07-26
-- ============================================================================
-- Purpose:
--   Store Facebook Page id + Page access token separately from
--   doctor_instagram (Instagram Login rows). Webhook resolution for
--   object=page messaging looks up facebook_page_id → doctor_id.
--
-- Pattern:
--   Mirrors Migration 011 (doctor_instagram) + health columns from 034.
--   Additive only. CREATE IF NOT EXISTS + DROP POLICY IF EXISTS for
--   idempotent re-runs. Reuses update_updated_at_column() from 001.
--
-- RLS:
--   Doctor can CRUD own row (status UI / future client paths).
--   Service-role SELECT policy documented for workers (service_role bypasses
--   RLS in practice; policy kept for parity with 011).
--
-- Safety:
--   Purely additive. One Page per doctor (PK doctor_id). facebook_page_id
--   UNIQUE so a Page cannot link to two doctors.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. doctor_facebook
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS doctor_facebook (
  doctor_id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  facebook_page_id       TEXT NOT NULL,
  page_access_token      TEXT NOT NULL,
  page_name              TEXT NULL,
  facebook_user_id       TEXT NULL,
  page_token_expires_at  TIMESTAMPTZ NULL,
  facebook_health_checked_at TIMESTAMPTZ NULL,
  facebook_health_level  TEXT NULL,
  facebook_health_error_code TEXT NULL,
  facebook_last_dm_success_at TIMESTAMPTZ NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT doctor_facebook_page_id_unique UNIQUE (facebook_page_id)
);

COMMENT ON TABLE doctor_facebook IS
  'Per-doctor Facebook Page link for Messenger (+ later Page comments). '
  'Separate from doctor_instagram (Instagram Login). fbm-02.';

COMMENT ON COLUMN doctor_facebook.facebook_page_id IS
  'Facebook Page id used as webhook entry.id for object=page messaging.';

COMMENT ON COLUMN doctor_facebook.page_access_token IS
  'Long-lived Page access token. Never log. Platform encryption at rest.';

COMMENT ON COLUMN doctor_facebook.page_name IS
  'Display name for Integrations UI (e.g. Connected as Halo Aid).';

COMMENT ON COLUMN doctor_facebook.facebook_user_id IS
  'App-scoped Facebook user id of the doctor who authorized Page Login '
  '(data-deletion reverse-map when applicable).';

COMMENT ON COLUMN doctor_facebook.facebook_health_level IS
  'Cached: ok | warning | error | unknown — from last debug_token check. fbm-07.';

-- Webhook lookup: page id → doctor
CREATE INDEX IF NOT EXISTS idx_doctor_facebook_page_id
  ON doctor_facebook(facebook_page_id);

CREATE INDEX IF NOT EXISTS idx_doctor_facebook_facebook_user_id
  ON doctor_facebook(facebook_user_id)
  WHERE facebook_user_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. RLS
-- ----------------------------------------------------------------------------
ALTER TABLE doctor_facebook ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctors can read own facebook" ON doctor_facebook;
CREATE POLICY "Doctors can read own facebook"
  ON doctor_facebook FOR SELECT
  USING (doctor_id = auth.uid());

DROP POLICY IF EXISTS "Doctors can insert own facebook" ON doctor_facebook;
CREATE POLICY "Doctors can insert own facebook"
  ON doctor_facebook FOR INSERT
  WITH CHECK (doctor_id = auth.uid());

DROP POLICY IF EXISTS "Doctors can update own facebook" ON doctor_facebook;
CREATE POLICY "Doctors can update own facebook"
  ON doctor_facebook FOR UPDATE
  USING (doctor_id = auth.uid())
  WITH CHECK (doctor_id = auth.uid());

DROP POLICY IF EXISTS "Doctors can delete own facebook" ON doctor_facebook;
CREATE POLICY "Doctors can delete own facebook"
  ON doctor_facebook FOR DELETE
  USING (doctor_id = auth.uid());

DROP POLICY IF EXISTS "Service role can read doctor facebook" ON doctor_facebook;
CREATE POLICY "Service role can read doctor facebook"
  ON doctor_facebook FOR SELECT
  USING (auth.role() = 'service_role');

-- ----------------------------------------------------------------------------
-- 3. updated_at trigger
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS doctor_facebook_updated_at ON doctor_facebook;
CREATE TRIGGER doctor_facebook_updated_at
  BEFORE UPDATE ON doctor_facebook
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Reverse (manual): DROP TABLE IF EXISTS doctor_facebook CASCADE;
-- ============================================================================
