-- ============================================================================
-- Doctor Settings Payout Columns (Payout Initiative)
-- ============================================================================
-- Migration: 025_doctor_settings_payout.sql
-- Date: 2026-03-24
-- Description:
--   Add payout_schedule, payout_minor, razorpay_linked_account_id.
--   Doctors choose when to receive payouts; Route requires Linked Account.
-- ============================================================================

ALTER TABLE doctor_settings
  ADD COLUMN IF NOT EXISTS payout_schedule TEXT
    CHECK (payout_schedule IS NULL OR payout_schedule IN ('per_appointment', 'daily', 'weekly', 'monthly')),
  ADD COLUMN IF NOT EXISTS payout_minor BIGINT,
  ADD COLUMN IF NOT EXISTS razorpay_linked_account_id TEXT;

COMMENT ON COLUMN doctor_settings.payout_schedule IS 'When doctor receives payouts: per_appointment, daily, weekly, monthly. NULL = default weekly.';
COMMENT ON COLUMN doctor_settings.payout_minor IS 'Min amount (paise) before payout; e.g. 10000 = ₹100. NULL = pay any amount.';
COMMENT ON COLUMN doctor_settings.razorpay_linked_account_id IS 'Razorpay Route Linked Account ID for India payouts. Required for Razorpay transfers.';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- RLS: No changes needed; existing policies cover new columns.
-- ============================================================================
