-- ============================================================================
-- 238_visit_lab_order_fulfillments.sql
-- desk-visit-prep P4 — per-ordered-test close-out (uploaded | not_done)
-- Date:    2026-09-13
-- ============================================================================
-- Purpose:
--   DVP-DL-13 reopened: one visit report is not always the whole order set.
--   Staff mark each attested investigation as covered by a visit_document
--   or not done with a reason. Pending stays derived (no row).
--
-- Auth:
--   RLS mirrors 233 (auth.uid() = doctor_id) as defence in depth.
--   Desk writes go through the service-role client (receptionist-portal R6).
--
-- Safety:
--   Additive. Idempotent. reason_note can hold free text — treat as PHI.
--   Reverse at file foot. No backfill.
-- ============================================================================

CREATE TABLE IF NOT EXISTS visit_lab_order_fulfillments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    appointment_id  UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    order_id        TEXT NOT NULL
                    CHECK (char_length(trim(order_id)) BETWEEN 1 AND 120),
    status          TEXT NOT NULL
                    CHECK (status IN ('uploaded', 'not_done')),
    reason_code     TEXT NULL
                    CHECK (reason_code IS NULL OR reason_code IN (
                      'sample_not_collected',
                      'patient_refused',
                      'sample_rejected',
                      'machine_down',
                      'done_outside',
                      'other'
                    )),
    reason_note     TEXT NULL
                    CHECK (reason_note IS NULL OR char_length(reason_note) <= 200),
    document_id     UUID NULL REFERENCES visit_documents(id) ON DELETE CASCADE,
    actor_id        UUID NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (appointment_id, order_id),
    CHECK (
      (
        status = 'uploaded'
        AND document_id IS NOT NULL
        AND reason_code IS NULL
        AND reason_note IS NULL
      )
      OR
      (
        status = 'not_done'
        AND document_id IS NULL
        AND reason_code IS NOT NULL
        AND (
          reason_code <> 'other'
          OR (reason_note IS NOT NULL AND char_length(trim(reason_note)) > 0)
        )
      )
    )
);

COMMENT ON TABLE  visit_lab_order_fulfillments IS
  'desk-visit-prep P4. Per attested investigation close-out. PHI in reason_note. Service-role writes; doctor RLS for defence in depth.';
COMMENT ON COLUMN visit_lab_order_fulfillments.order_id IS
  'investigations_orders_json[].id on the current attested prescription. Not a FK — those ids live in JSON.';
COMMENT ON COLUMN visit_lab_order_fulfillments.document_id IS
  'Covering visit_documents row. ON DELETE CASCADE returns the order to pending.';
COMMENT ON COLUMN visit_lab_order_fulfillments.reason_note IS
  'Required when reason_code = other. Free text — do not log.';
COMMENT ON COLUMN visit_lab_order_fulfillments.actor_id IS
  'auth.users id of the staff or doctor who closed the order. No FK.';

CREATE INDEX IF NOT EXISTS idx_visit_lab_order_fulfillments_appointment
  ON visit_lab_order_fulfillments (doctor_id, appointment_id);

DROP TRIGGER IF EXISTS update_visit_lab_order_fulfillments_updated_at
  ON visit_lab_order_fulfillments;
CREATE TRIGGER update_visit_lab_order_fulfillments_updated_at
    BEFORE UPDATE ON visit_lab_order_fulfillments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE visit_lab_order_fulfillments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own lab order fulfillments"
  ON visit_lab_order_fulfillments;
DROP POLICY IF EXISTS "Users can insert own lab order fulfillments"
  ON visit_lab_order_fulfillments;
DROP POLICY IF EXISTS "Users can update own lab order fulfillments"
  ON visit_lab_order_fulfillments;
DROP POLICY IF EXISTS "Users can delete own lab order fulfillments"
  ON visit_lab_order_fulfillments;

CREATE POLICY "Users can read own lab order fulfillments"
ON visit_lab_order_fulfillments FOR SELECT
USING (auth.uid() = doctor_id);

CREATE POLICY "Users can insert own lab order fulfillments"
ON visit_lab_order_fulfillments FOR INSERT
WITH CHECK (auth.uid() = doctor_id);

CREATE POLICY "Users can update own lab order fulfillments"
ON visit_lab_order_fulfillments FOR UPDATE
USING (auth.uid() = doctor_id)
WITH CHECK (auth.uid() = doctor_id);

CREATE POLICY "Users can delete own lab order fulfillments"
ON visit_lab_order_fulfillments FOR DELETE
USING (auth.uid() = doctor_id);

-- ============================================================================
-- Reverse migration (manual):
--
--   DROP TABLE IF EXISTS visit_lab_order_fulfillments;
-- ============================================================================
