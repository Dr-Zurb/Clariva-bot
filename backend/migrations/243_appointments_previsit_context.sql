-- ============================================================================
-- 243_appointments_previsit_context.sql
-- ============================================================================
-- Date: 2026-09-24
-- Batch: clinic-link (clk-09)
-- Description:
--   Optional illness chips for a visit (CLK-DL-9). Nullable JSONB on the
--   appointment. reason_for_visit stays the one-line booking reason and is
--   not copied here.
--
--   Also correct the actor_id comments. Staff rows stay an auth.users id.
--   source = 'patient' stores patients.id (CLK-DL-10). No upload route.
--   No RLS change. No backfill.
--
-- Reverse migration (document only):
--   ALTER TABLE appointments DROP COLUMN IF EXISTS previsit_context;
--   COMMENT ON COLUMN patient_history_submissions.actor_id IS
--     'auth.users id of the last writer. Audited separately; no FK so a deleted staff account does not drop the row.';
--   COMMENT ON COLUMN visit_documents.actor_id IS
--     'auth.users id of the uploader. Audited separately; no FK so a deleted staff account does not drop the document.';
-- ============================================================================

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS previsit_context JSONB NULL;

COMMENT ON COLUMN appointments.previsit_context IS
  'CLK-DL-9. Optional illness chips from the patient. Not the chart and not reason_for_visit. '
  'Keys: since (text), course (better|same|worse), tried (text), aim (new_problem|follow_up|reports|refill). '
  'NULL when the patient skipped. A missing key stays absent.';

COMMENT ON COLUMN patient_history_submissions.actor_id IS
  'Last writer. No FK so a deleted account does not drop the row. '
  'front_desk and assistant rows store an auth.users id. '
  'source = patient stores patients.id.';

COMMENT ON COLUMN visit_documents.actor_id IS
  'Uploader. No FK so a deleted account does not drop the document. '
  'front_desk rows store an auth.users id. '
  'source = patient stores patients.id.';
