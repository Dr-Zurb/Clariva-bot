-- ============================================================================
-- 204_doctor_gateway_webhook_secret.sql
-- billing · P2b follow-up: prepaid webhook verification
-- Date:    2026-08-22
-- ============================================================================
-- Purpose:
--   Payment links are created on the doctor's Razorpay account. Capture
--   events therefore arrive signed with THAT account's webhook secret, not
--   RAZORPAY_WEBHOOK_SECRET. Store the doctor's secret encrypted.
--   Additive. No backfill. No DROP.
-- ============================================================================

ALTER TABLE doctor_payment_credentials
  ADD COLUMN IF NOT EXISTS webhook_secret_encrypted TEXT NULL;

COMMENT ON COLUMN doctor_payment_credentials.webhook_secret_encrypted IS
  'AES-256-GCM ciphertext of the Razorpay dashboard webhook secret. Service-role only. Never returned.';
