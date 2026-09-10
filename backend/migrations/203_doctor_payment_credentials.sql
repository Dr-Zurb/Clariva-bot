-- ============================================================================
-- 203_doctor_payment_credentials.sql
-- billing · P2b money rails
-- Date:    2026-08-22
-- ============================================================================
-- Purpose:
--   Per-doctor gateway credentials (encrypted secret) + payment collection
--   mode. Patient money never lands on the platform Razorpay account.
--   Additive. No backfill. No DROP.
--
--   200/201 taken by clinic staff / patients_registered_via.
--   202 is P2a subscriptions + invoices.
-- ============================================================================

CREATE TABLE IF NOT EXISTS doctor_payment_credentials (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    gateway               TEXT NOT NULL DEFAULT 'razorpay' CHECK (gateway IN ('razorpay')),
    key_id                TEXT NOT NULL,
    key_secret_encrypted  TEXT NOT NULL,
    status                TEXT NOT NULL DEFAULT 'pending' CHECK (
                            status IN ('pending', 'connected', 'invalid', 'disconnected')
                          ),
    connected_at          TIMESTAMPTZ NULL,
    last_verified_at      TIMESTAMPTZ NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT doctor_payment_credentials_doctor_gateway_key UNIQUE (doctor_id, gateway)
);

COMMENT ON TABLE doctor_payment_credentials IS
  'billing P2b — doctor-owned gateway keys. Secret is app-encrypted. Service-role only; never doctor-readable.';
COMMENT ON COLUMN doctor_payment_credentials.key_id IS
  'Public-ish Razorpay key id. Safe to mask in API responses. Never log.';
COMMENT ON COLUMN doctor_payment_credentials.key_secret_encrypted IS
  'AES-256-GCM ciphertext (ENCRYPTION_KEY). Never returned, never logged.';

ALTER TABLE doctor_payment_credentials ENABLE ROW LEVEL SECURITY;

-- No authenticated policies: doctors must not SELECT the secret column.
-- Dashboard reads go through the API (masked key id only).

GRANT ALL ON doctor_payment_credentials TO service_role;

ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS payment_collection_mode TEXT NOT NULL DEFAULT 'bookings_only';

ALTER TABLE doctor_settings
  DROP CONSTRAINT IF EXISTS doctor_settings_payment_collection_mode_check;

ALTER TABLE doctor_settings
  ADD CONSTRAINT doctor_settings_payment_collection_mode_check
  CHECK (payment_collection_mode IN ('bookings_only', 'prepaid'));

COMMENT ON COLUMN doctor_settings.payment_collection_mode IS
  'billing P2b — bookings_only (scanner / pay at clinic) or prepaid (doctor Razorpay). Default bookings_only.';
