-- ============================================================================
-- 199_billing_usage_ledger.sql
-- billing · P1 meter
-- Date:    2026-08-22
-- ============================================================================
-- Purpose:
--   Additive usage ledger for Halo Aid doctor billing. One row per consult
--   (UNIQUE appointment_id). Corrections are append-only adjustment rows.
--   Doctors may SELECT their own rows; writes are service-role only.
--   No backfill. No DROP. No invoice_id (P2).
--
--   Live head at write time was
--   `198_deprecate_platform_fee_and_payouts.sql`.
-- ============================================================================

CREATE TABLE IF NOT EXISTS billable_consults (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    appointment_id      UUID NOT NULL REFERENCES appointments(id) ON DELETE RESTRICT,
    billing_period      DATE NOT NULL,
    occurred_at         TIMESTAMPTZ NOT NULL,
    modality            TEXT NOT NULL CHECK (modality IN ('video', 'voice', 'text', 'in_person')),
    source              TEXT NOT NULL CHECK (
                          source IN ('verified_overlap', 'doctor_wrapup', 'wrapup_sweep', 'async_reply')
                        ),
    status              TEXT NOT NULL DEFAULT 'billable' CHECK (
                          status IN ('billable', 'free_followup', 'void')
                        ),
    void_reason         TEXT NULL,
    free_followup_of    UUID NULL REFERENCES billable_consults(id) ON DELETE SET NULL,
    invoiced_at         TIMESTAMPTZ NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT billable_consults_appointment_id_key UNIQUE (appointment_id),
    CONSTRAINT billable_consults_void_reason_required CHECK (
      status <> 'void' OR void_reason IS NOT NULL
    )
);

COMMENT ON TABLE billable_consults IS
  'billing P1 — one row per consult. Meter reads this table, never appointment.verified_at. RLS: doctor SELECT own; writes service-role only.';
COMMENT ON COLUMN billable_consults.billing_period IS
  'First calendar day of the Asia/Kolkata month that contains occurred_at.';
COMMENT ON COLUMN billable_consults.source IS
  'verified_overlap | doctor_wrapup | wrapup_sweep | async_reply';
COMMENT ON COLUMN billable_consults.status IS
  'billable | free_followup (dormant at launch) | void';
COMMENT ON COLUMN billable_consults.free_followup_of IS
  'Dormant at launch (P1-D8). Reversibility hedge if follow-ups are ever exempted.';
COMMENT ON COLUMN billable_consults.invoiced_at IS
  'Immutability latch. Once set, the recorder and void path refuse to modify the row.';

CREATE INDEX IF NOT EXISTS idx_billable_consults_doctor_period
  ON billable_consults (doctor_id, billing_period);

CREATE INDEX IF NOT EXISTS idx_billable_consults_status
  ON billable_consults (status);

CREATE TABLE IF NOT EXISTS billing_adjustments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    billing_period  DATE NOT NULL,
    amount_minor    INTEGER NOT NULL,
    reason          TEXT NOT NULL,
    created_by      TEXT NOT NULL CHECK (created_by IN ('system', 'founder')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE billing_adjustments IS
  'billing P1 — append-only money corrections. Negative amount_minor credits the doctor. RLS: doctor SELECT own; writes service-role only.';
COMMENT ON COLUMN billing_adjustments.amount_minor IS
  'Signed paise. Negative = credit to the doctor.';

CREATE INDEX IF NOT EXISTS idx_billing_adjustments_doctor_period
  ON billing_adjustments (doctor_id, billing_period);

ALTER TABLE billable_consults ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own billable consults"
ON billable_consults FOR SELECT
USING (auth.uid() = doctor_id);

CREATE POLICY "Users can read own billing adjustments"
ON billing_adjustments FOR SELECT
USING (auth.uid() = doctor_id);

GRANT SELECT ON billable_consults TO authenticated;
GRANT SELECT ON billing_adjustments TO authenticated;
GRANT ALL ON billable_consults TO service_role;
GRANT ALL ON billing_adjustments TO service_role;
