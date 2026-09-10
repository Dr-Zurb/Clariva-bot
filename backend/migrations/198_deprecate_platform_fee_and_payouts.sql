-- ============================================================================
-- 198_deprecate_platform_fee_and_payouts.sql
-- billing · P0 demolition
-- Date:    2026-08-22
-- ============================================================================
-- Purpose:
--   Comment the patient-money-flow columns as deprecated. Application no
--   longer writes a platform fee or acts on payout fields (billing P0).
--   Do NOT DROP these columns until P0.5+. No backfill. No RLS change.
--
--   Live head at write time was
--   `197_video_escalation_grant_bounds_and_pause.sql`.
-- ============================================================================

COMMENT ON COLUMN payments.platform_fee_minor IS
  'DEPRECATED 2026-08 — Halo Aid is never in the patient money flow. Application no longer writes / acts on this column. Do not DROP until P0.5+. Originally: Clariva platform fee in paise.';

COMMENT ON COLUMN payments.gst_minor IS
  'DEPRECATED 2026-08 — Halo Aid is never in the patient money flow. Application no longer writes / acts on this column. Do not DROP until P0.5+. Originally: GST on platform fee in paise.';

COMMENT ON COLUMN payments.doctor_amount_minor IS
  'DEPRECATED 2026-08 — Halo Aid is never in the patient money flow. Application no longer writes / acts on this column. Do not DROP until P0.5+. Originally: amount to doctor after fee.';

COMMENT ON COLUMN payments.payout_status IS
  'DEPRECATED 2026-08 — Halo Aid is never in the patient money flow. Application no longer writes / acts on this column. Do not DROP until P0.5+. Originally: pending -> processing -> paid | failed.';

COMMENT ON COLUMN payments.payout_id IS
  'DEPRECATED 2026-08 — Halo Aid is never in the patient money flow. Application no longer writes / acts on this column. Do not DROP until P0.5+. Originally: Razorpay Route transfer ID.';

COMMENT ON COLUMN payments.payout_failed_reason IS
  'DEPRECATED 2026-08 — Halo Aid is never in the patient money flow. Application no longer writes / acts on this column. Do not DROP until P0.5+. Originally: error when payout failed.';

COMMENT ON COLUMN payments.paid_at IS
  'DEPRECATED 2026-08 — Halo Aid is never in the patient money flow. Application no longer writes / acts on this column. Do not DROP until P0.5+. Originally: when the doctor received funds.';

COMMENT ON COLUMN doctor_settings.payout_schedule IS
  'DEPRECATED 2026-08 — Halo Aid is never in the patient money flow. Application no longer writes / acts on this column. Do not DROP until P0.5+. Originally: per_appointment / daily / weekly / monthly.';

COMMENT ON COLUMN doctor_settings.payout_minor IS
  'DEPRECATED 2026-08 — Halo Aid is never in the patient money flow. Application no longer writes / acts on this column. Do not DROP until P0.5+. Originally: min amount (paise) before payout.';

COMMENT ON COLUMN doctor_settings.razorpay_linked_account_id IS
  'DEPRECATED 2026-08 — Halo Aid is never in the patient money flow. Application no longer writes / acts on this column. Do not DROP until P0.5+. Originally: Razorpay Route Linked Account ID.';
