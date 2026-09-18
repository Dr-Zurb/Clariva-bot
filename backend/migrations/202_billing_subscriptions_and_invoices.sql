-- ============================================================================
-- 202_billing_subscriptions_and_invoices.sql
-- billing · P2a trust surfaces
-- Date:    2026-08-22
-- ============================================================================
-- Purpose:
--   Doctor subscription (frozen price levels) + immutable invoices.
--   Adds invoice_id latch on billable_consults (deferred from P1-D7).
--   Additive. No backfill. No DROP.
--
--   200/201 were taken by receptionist-portal / patients_registered_via.
--   Live head at write time was `201_patients_registered_via.sql`.
-- ============================================================================

CREATE TABLE IF NOT EXISTS doctor_subscriptions (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),
    plan_kind             TEXT NOT NULL DEFAULT 'standard' CHECK (plan_kind IN ('standard', 'custom')),
    base_minor            INTEGER NOT NULL,
    included_consults     INTEGER NOT NULL,
    per_consult_minor     INTEGER NOT NULL,
    cap_minor             INTEGER NOT NULL,
    base_waived_until     DATE NULL,
    levels_locked_until   DATE NULL,
    started_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    cancelled_at          TIMESTAMPTZ NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT doctor_subscriptions_doctor_id_key UNIQUE (doctor_id)
);

COMMENT ON TABLE doctor_subscriptions IS
  'billing P2a — one row per doctor. Price levels are copied at signup so a later sheet change cannot silently reprice them.';
COMMENT ON COLUMN doctor_subscriptions.levels_locked_until IS
  'Founding-ten 12-month lock. NULL = not locked.';
COMMENT ON COLUMN doctor_subscriptions.base_waived_until IS
  'Founding-ten 3-month base waiver. NULL = base applies.';

CREATE TABLE IF NOT EXISTS billing_invoice_counters (
    financial_year TEXT PRIMARY KEY,
    last_value     INTEGER NOT NULL DEFAULT 0
);

COMMENT ON TABLE billing_invoice_counters IS
  'Gap-free invoice serial per Indian financial year (April–March). Service-role only.';

CREATE TABLE IF NOT EXISTS doctor_invoices (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    billing_period      DATE NOT NULL,
    invoice_number      TEXT NOT NULL,
    billable_count      INTEGER NOT NULL,
    not_billed_count    INTEGER NOT NULL DEFAULT 0,
    base_minor          INTEGER NOT NULL,
    metered_minor       INTEGER NOT NULL,
    subtotal_minor      INTEGER NOT NULL,
    adjustments_minor   INTEGER NOT NULL DEFAULT 0,
    gst_minor           INTEGER NOT NULL,
    total_minor         INTEGER NOT NULL,
    cap_applied         BOOLEAN NOT NULL DEFAULT false,
    status              TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'paid', 'void')),
    issued_at           TIMESTAMPTZ NULL,
    paid_at             TIMESTAMPTZ NULL,
    payment_reference   TEXT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT doctor_invoices_number_key UNIQUE (invoice_number),
    CONSTRAINT doctor_invoices_doctor_period_key UNIQUE (doctor_id, billing_period)
);

COMMENT ON TABLE doctor_invoices IS
  'billing P2a — immutable once issued. Intermediates stored so the PDF is a render, never a recomputation.';
COMMENT ON COLUMN doctor_invoices.invoice_number IS
  'Human-facing, gap-free per FY. Format HA-YYYY-YYYY-NNNNN.';
COMMENT ON COLUMN doctor_invoices.not_billed_count IS
  'Voids / same-encounter continuations this period. Follow-ups are never in this count.';

CREATE INDEX IF NOT EXISTS idx_doctor_invoices_doctor_period
  ON doctor_invoices (doctor_id, billing_period);

ALTER TABLE billable_consults
  ADD COLUMN IF NOT EXISTS invoice_id UUID NULL REFERENCES doctor_invoices(id) ON DELETE RESTRICT;

COMMENT ON COLUMN billable_consults.invoice_id IS
  'Set when the covering invoice is issued. Together with invoiced_at this is the immutability latch.';

ALTER TABLE doctor_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctor_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_invoice_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own subscriptions"
ON doctor_subscriptions FOR SELECT
USING (auth.uid() = doctor_id);

CREATE POLICY "Users can read own invoices"
ON doctor_invoices FOR SELECT
USING (auth.uid() = doctor_id);

GRANT SELECT ON doctor_subscriptions TO authenticated;
GRANT SELECT ON doctor_invoices TO authenticated;
GRANT ALL ON doctor_subscriptions TO service_role;
GRANT ALL ON doctor_invoices TO service_role;
GRANT ALL ON billing_invoice_counters TO service_role;

CREATE OR REPLACE FUNCTION next_billing_invoice_serial(p_fy TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v INTEGER;
BEGIN
  INSERT INTO billing_invoice_counters (financial_year, last_value)
  VALUES (p_fy, 1)
  ON CONFLICT (financial_year)
  DO UPDATE SET last_value = billing_invoice_counters.last_value + 1
  RETURNING last_value INTO v;
  RETURN v;
END;
$$;

COMMENT ON FUNCTION next_billing_invoice_serial(TEXT) IS
  'Atomic gap-free invoice serial per FY. Service-role only.';

GRANT EXECUTE ON FUNCTION next_billing_invoice_serial(TEXT) TO service_role;
