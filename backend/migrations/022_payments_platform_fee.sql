-- ============================================================================
-- Payments Platform Fee Columns (Monetization Initiative)
-- ============================================================================
-- Migration: 022_payments_platform_fee.sql
-- Date: 2026-03-22
-- Description:
--   Add platform_fee_minor, gst_minor, doctor_amount_minor to payments.
--   Clariva platform fee: 5% or ₹25 flat (< ₹500); GST 18% on fee.
--   NULL for existing rows; populated by processPaymentSuccess for new captures.
-- ============================================================================

-- Add platform fee columns
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS platform_fee_minor BIGINT,
  ADD COLUMN IF NOT EXISTS gst_minor BIGINT,
  ADD COLUMN IF NOT EXISTS doctor_amount_minor BIGINT;

COMMENT ON COLUMN payments.platform_fee_minor IS 'Clariva platform fee in smallest unit (paise). 5% or flat for < threshold.';
COMMENT ON COLUMN payments.gst_minor IS 'GST (18% on platform fee) in smallest unit.';
COMMENT ON COLUMN payments.doctor_amount_minor IS 'Amount to doctor (gross - platform_fee - gst) in smallest unit.';

-- ============================================================================
-- Migration Complete
-- ============================================================================
