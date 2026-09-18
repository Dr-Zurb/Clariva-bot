-- ============================================================================
-- 225_visit_payment_reversals.sql
-- Append-only till return against visit_payments (P5.3 desk Left).
-- Date:    2026-08-31
-- ============================================================================
-- Purpose:
--   Record a full return of cash / UPI / card already collected at the till.
--   This is NOT a Razorpay refund. Do not UPDATE/DELETE collect rows.
--
-- Hard-rules:
--   - Append-only trigger from 223 stays in place.
--   - RLS deny-all unchanged (no policies, no auth.uid()).
--   - No PHI columns.
--
-- Rollback (document only):
--   DROP INDEX IF EXISTS idx_visit_payments_one_reversal_per_appointment;
--   DROP INDEX IF EXISTS idx_visit_payments_one_reversal_per_source;
--   ALTER TABLE visit_payments DROP CONSTRAINT IF EXISTS visit_payments_amount_matches_method;
--   ALTER TABLE visit_payments DROP CONSTRAINT IF EXISTS visit_payments_method_check;
--   ALTER TABLE visit_payments DROP COLUMN IF EXISTS return_method;
--   ALTER TABLE visit_payments DROP COLUMN IF EXISTS reverses_payment_id;
--   ALTER TABLE visit_payments
--     ADD CONSTRAINT visit_payments_method_check
--       CHECK (method IN ('cash', 'upi', 'card', 'no_charge'));
--   ALTER TABLE visit_payments
--     ADD CONSTRAINT visit_payments_amount_matches_method CHECK (
--       (method = 'no_charge' AND amount_minor = 0)
--       OR (method IN ('cash', 'upi', 'card') AND amount_minor > 0)
--     );
-- ============================================================================

ALTER TABLE visit_payments
  ADD COLUMN IF NOT EXISTS reverses_payment_id UUID REFERENCES visit_payments(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS return_method TEXT;

ALTER TABLE visit_payments DROP CONSTRAINT IF EXISTS visit_payments_method_check;
ALTER TABLE visit_payments DROP CONSTRAINT IF EXISTS visit_payments_amount_matches_method;

ALTER TABLE visit_payments
  ADD CONSTRAINT visit_payments_method_check
    CHECK (method IN ('cash', 'upi', 'card', 'no_charge', 'reversal'));

ALTER TABLE visit_payments
  ADD CONSTRAINT visit_payments_amount_matches_method CHECK (
    (method = 'no_charge' AND amount_minor = 0 AND reverses_payment_id IS NULL AND return_method IS NULL)
    OR (
      method IN ('cash', 'upi', 'card')
      AND amount_minor > 0
      AND reverses_payment_id IS NULL
      AND return_method IS NULL
    )
    OR (
      method = 'reversal'
      AND amount_minor > 0
      AND reverses_payment_id IS NOT NULL
      AND return_method IN ('cash', 'upi', 'card')
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_visit_payments_one_reversal_per_source
  ON visit_payments (reverses_payment_id)
  WHERE reverses_payment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_visit_payments_one_reversal_per_appointment
  ON visit_payments (appointment_id)
  WHERE method = 'reversal';

COMMENT ON COLUMN visit_payments.reverses_payment_id IS
  'Collect row this reversal returns. Set only when method is reversal.';

COMMENT ON COLUMN visit_payments.return_method IS
  'Till channel used to hand money back: cash | upi | card. Set only when method is reversal.';

COMMENT ON COLUMN visit_payments.method IS
  'cash | upi | card | no_charge | reversal. Reversal is a till return, not a gateway refund.';
