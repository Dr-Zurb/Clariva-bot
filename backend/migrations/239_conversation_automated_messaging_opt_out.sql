-- ============================================================================
-- 239_conversation_automated_messaging_opt_out.sql
-- meta-channel-align · mca-06 — persist automated-messaging opt-out
-- Date:    2026-09-16
-- ============================================================================
-- Purpose:
--   Dev Policies §5 requires an immediately respected opt-out of messaging.
--   consent_status = revoked is data deletion, not "stop DMing me". This
--   column is a per-conversation suppression stamp for *automated* Meta
--   sends (IG/FB). NULL = not opted out. A timestamp is not PHI.
--
-- Pattern:
--   Additive nullable TIMESTAMPTZ on conversations (mirrors 190 language /
--   194 appointment notify stamps). No DEFAULT — NULL is the meaningful
--   opted-in state. No index (lookups are by conversation id). No RLS
--   change — existing conversations policies cover the row.
--
-- RLS:
--   Existing "Doctors can read own conversations" (doctor_id = auth.uid())
--   still applies. Service role writes the stamp from the DM worker.
--   Disconnect / conversation delete already CASCADE-purges the row.
--
-- Safety:
--   Purely additive. Re-run safe (IF NOT EXISTS). No backfill — NULL on
--   existing rows means automation stays on.
--
-- Rollback (document only):
--   ALTER TABLE conversations
--     DROP COLUMN IF EXISTS automated_messaging_opted_out_at;
-- ============================================================================

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS automated_messaging_opted_out_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN conversations.automated_messaging_opted_out_at IS
  'When the patient opted out of automated Meta messaging (mca-06). NULL = not opted out. Operational timestamp; not PHI. Doctor dashboard send is not gated by this.';
