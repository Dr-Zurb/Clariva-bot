-- ============================================================================
-- Payments Table and Webhook Idempotency Update (e-task-4)
-- ============================================================================
-- Migration: 008_payments.sql
-- Date: 2026-01-30
-- Description:
--   - Create payments table for appointment fee records
--   - Extend webhook_idempotency provider to include 'razorpay', 'paypal'
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Extend webhook_idempotency provider CHECK
-- ----------------------------------------------------------------------------
-- Drop existing provider check; PostgreSQL names it tablename_columnname_check
ALTER TABLE webhook_idempotency
  DROP CONSTRAINT IF EXISTS webhook_idempotency_provider_check;

-- Add new constraint with payment providers (razorpay, paypal)
ALTER TABLE webhook_idempotency
  ADD CONSTRAINT webhook_idempotency_provider_check
  CHECK (provider IN ('facebook', 'instagram', 'whatsapp', 'razorpay', 'paypal'));

-- ----------------------------------------------------------------------------
-- 2. Create payments table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id      UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  gateway             TEXT NOT NULL CHECK (gateway IN ('razorpay', 'paypal')),
  gateway_order_id    TEXT NOT NULL,
  gateway_payment_id  TEXT,
  amount_minor        BIGINT NOT NULL,
  currency            TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'captured', 'failed', 'refunded')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_appointment_id ON payments(appointment_id);
CREATE INDEX IF NOT EXISTS idx_payments_gateway ON payments(gateway);
CREATE INDEX IF NOT EXISTS idx_payments_gateway_order_id ON payments(gateway_order_id);

-- ----------------------------------------------------------------------------
-- 3. RLS for payments (doctor-only read via appointment; service role for writes)
-- ----------------------------------------------------------------------------
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Doctors can read payments for their appointments
CREATE POLICY "Doctors can read own payments"
  ON payments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM appointments
      WHERE appointments.id = payments.appointment_id
      AND appointments.doctor_id = auth.uid()
    )
  );

-- Service role only for inserts (webhook worker)
CREATE POLICY "Service role can insert payments"
  ON payments FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- Service role only for updates (webhook worker)
CREATE POLICY "Service role can update payments"
  ON payments FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================================
-- Migration Complete
-- ============================================================================
