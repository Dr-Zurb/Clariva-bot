-- Migration: 034_doctor_instagram_health.sql
-- RBH-10: Cached Instagram token health + last successful DM time (no PHI in new fields).

ALTER TABLE doctor_instagram
  ADD COLUMN IF NOT EXISTS instagram_health_checked_at TIMESTAMPTZ NULL;

ALTER TABLE doctor_instagram
  ADD COLUMN IF NOT EXISTS instagram_health_level TEXT NULL;

ALTER TABLE doctor_instagram
  ADD COLUMN IF NOT EXISTS instagram_health_error_code TEXT NULL;

ALTER TABLE doctor_instagram
  ADD COLUMN IF NOT EXISTS instagram_token_expires_at TIMESTAMPTZ NULL;

ALTER TABLE doctor_instagram
  ADD COLUMN IF NOT EXISTS instagram_last_dm_success_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN doctor_instagram.instagram_health_checked_at IS 'Last Meta debug_token check (server). RBH-10.';
COMMENT ON COLUMN doctor_instagram.instagram_health_level IS 'Cached: ok | warning | error | unknown — from last check. RBH-10.';
COMMENT ON COLUMN doctor_instagram.instagram_health_error_code IS 'Optional Meta error code only (no message body). RBH-10.';
COMMENT ON COLUMN doctor_instagram.instagram_token_expires_at IS 'Page token expiry from debug_token when provided. RBH-10.';
COMMENT ON COLUMN doctor_instagram.instagram_last_dm_success_at IS 'Last bot DM send success for this doctor. RBH-10.';
