-- ============================================================================
-- 223_visit_payments.sql
-- Front-desk hisab ledger (cash / UPI / card / no charge).
-- Date:    2026-08-30
-- ============================================================================
-- Purpose:
--   Record that a walk-in / desk visit was collected or marked no charge.
--   This is NOT the gateway `payments` table and is NOT SaaS `billable_consults`.
--   Money never moves through this table — staff records what already happened
--   at the till / existing UPI QR / card machine.
--
-- Hard-rules:
--   - Append-only (UPDATE/DELETE raise). Corrections are a later insert.
--   - RLS deny-all: anon/authenticated have no policies; service-role only.
--   - No PHI columns (no names, phones, notes that store clinical text).
--
-- Rollback (document only):
--   DROP TRIGGER IF EXISTS visit_payments_no_update ON visit_payments;
--   DROP TRIGGER IF EXISTS visit_payments_no_delete ON visit_payments;
--   DROP FUNCTION IF EXISTS reject_visit_payments_mutation();
--   DROP TABLE IF EXISTS visit_payments;
-- ============================================================================

CREATE TABLE IF NOT EXISTS visit_payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  appointment_id    UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  patient_id        UUID REFERENCES patients(id) ON DELETE SET NULL,
  amount_minor      BIGINT NOT NULL,
  currency          TEXT NOT NULL DEFAULT 'INR',
  method            TEXT NOT NULL
                      CHECK (method IN ('cash', 'upi', 'card', 'no_charge')),
  collected_by      UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  collected_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  note              TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT visit_payments_amount_matches_method CHECK (
    (method = 'no_charge' AND amount_minor = 0)
    OR (method IN ('cash', 'upi', 'card') AND amount_minor > 0)
  ),
  CONSTRAINT visit_payments_currency_iso CHECK (char_length(currency) = 3)
);

CREATE INDEX IF NOT EXISTS idx_visit_payments_doctor_appointment
  ON visit_payments (doctor_id, appointment_id);

CREATE INDEX IF NOT EXISTS idx_visit_payments_appointment
  ON visit_payments (appointment_id);

CREATE INDEX IF NOT EXISTS idx_visit_payments_doctor_collected_at
  ON visit_payments (doctor_id, collected_at);

COMMENT ON TABLE visit_payments IS
  'Desk hisab ledger. Append-only. Records cash/UPI/card/no_charge against a visit. '
  'Not gateway payments. Not SaaS usage. RLS deny-all; service-role API only.';

COMMENT ON COLUMN visit_payments.amount_minor IS
  'Collected amount in paise/cents. Zero when method is no_charge.';

COMMENT ON COLUMN visit_payments.method IS
  'cash | upi | card | no_charge. UPI/card are recorded after the clinic QR or POS succeeds.';

COMMENT ON COLUMN visit_payments.collected_by IS
  'Staff or doctor auth user who recorded the collection. Never log as a name.';

COMMENT ON COLUMN visit_payments.note IS
  'Optional short operational note. Not for patient names or clinical text.';

CREATE OR REPLACE FUNCTION reject_visit_payments_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'visit_payments is append-only';
END;
$$;

DROP TRIGGER IF EXISTS visit_payments_no_update ON visit_payments;
CREATE TRIGGER visit_payments_no_update
  BEFORE UPDATE ON visit_payments
  FOR EACH ROW
  EXECUTE FUNCTION reject_visit_payments_mutation();

DROP TRIGGER IF EXISTS visit_payments_no_delete ON visit_payments;
CREATE TRIGGER visit_payments_no_delete
  BEFORE DELETE ON visit_payments
  FOR EACH ROW
  EXECUTE FUNCTION reject_visit_payments_mutation();

ALTER TABLE visit_payments ENABLE ROW LEVEL SECURITY;
