-- ============================================================================
-- Payments Payout Columns (Payout Initiative)
-- ============================================================================
-- Migration: 024_payments_payout_columns.sql
-- Date: 2026-03-24
-- Description:
--   Add payout_status, payout_id, payout_failed_reason, paid_at to payments.
--   Track Razorpay Route transfer and when doctor was paid.
-- ============================================================================

-- Add payout tracking columns
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS payout_status TEXT DEFAULT 'pending'
    CHECK (payout_status IS NULL OR payout_status IN ('pending', 'processing', 'paid', 'failed')),
  ADD COLUMN IF NOT EXISTS payout_id TEXT,
  ADD COLUMN IF NOT EXISTS payout_failed_reason TEXT,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

COMMENT ON COLUMN payments.payout_status IS 'Payout state: pending -> processing -> paid | failed.';
COMMENT ON COLUMN payments.payout_id IS 'Razorpay Route transfer ID when paid.';
COMMENT ON COLUMN payments.payout_failed_reason IS 'Error message when payout failed.';
COMMENT ON COLUMN payments.paid_at IS 'When payout was completed (doctor received funds).';

-- ============================================================================
-- Migration Complete
-- ============================================================================
