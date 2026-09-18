-- ============================================================================
-- 224_visit_narrative_provenance.sql
-- Visit narrative Phase 2 · vnt-01 · VN-Q5 = (b)
-- Date:    2026-08-30
-- ============================================================================
-- Purpose:
--   One append-only row per accepted transcript-derived chart item.
--   Remembers which transcript and which character span produced the accept,
--   so a clinician or auditor can later ask "why does this chart say this?"
--   and get "the patient said it, in this consult, at this span" rather
--   than a shrug.
--
--   VN-Q5 = (b): store provenance, not text. This table has no clinical
--   free-text column. The quote is re-derived by slicing
--   consultation_transcripts.transcript_text at [span_start, span_end).
--
-- Hard-rules:
--   - Additive only. No ALTER of consultation_transcripts, sessions,
--     prescriptions, or recording_artifact_index.
--   - Append-only: UPDATE always raises. Direct DELETE raises.
--     ON DELETE CASCADE from consultation_transcripts is the sole erase
--     path (detected via pg_trigger_depth() > 1).
--   - RLS deny-all: anon/authenticated have no policies; service-role only.
--   - No PHI text columns (no quote, narrative, note, or JSONB payload).
--
-- Erasure:
--   Anchored to consultation_transcripts(id) ON DELETE CASCADE.
--   Planning-time tracing found no production path that DELETEs a
--   consultation_transcripts row (archival / erasure / account-deletion
--   workers act on recording_artifact_index + storage only; sessions are
--   retained through the regulatory window per 061). CASCADE is therefore
--   correct and currently inert — the same posture as the transcripts
--   table itself. Owner accepted (b) with that caveat on 2026-08-30.
--
-- Backfill:
--   None. Historical accepts have no provenance row. Readers must render
--   that as "no source recorded", never as "doctor-asserted".
--
-- Rollback (document only):
--   DROP TRIGGER IF EXISTS visit_narrative_provenance_no_update
--     ON visit_narrative_provenance;
--   DROP TRIGGER IF EXISTS visit_narrative_provenance_no_delete
--     ON visit_narrative_provenance;
--   DROP FUNCTION IF EXISTS reject_visit_narrative_provenance_mutation();
--   DROP TABLE IF EXISTS visit_narrative_provenance;
-- ============================================================================

CREATE TABLE IF NOT EXISTS visit_narrative_provenance (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  doctor_id                  UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  patient_id                 UUID REFERENCES patients(id) ON DELETE SET NULL,
  appointment_id             UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  consultation_session_id    UUID NOT NULL REFERENCES consultation_sessions(id) ON DELETE CASCADE,

  -- Erasure anchor. Deleting the transcript takes these rows with it.
  transcript_id              UUID NOT NULL REFERENCES consultation_transcripts(id) ON DELETE CASCADE,

  -- [span_start, span_end) into consultation_transcripts.transcript_text.
  -- Integers only — never store the sliced text.
  span_start                 INTEGER NOT NULL,
  span_end                   INTEGER NOT NULL,

  target_kind                TEXT NOT NULL
                               CHECK (target_kind IN (
                                 'subjective',
                                 'vitals',
                                 'assessment',
                                 'investigations',
                                 'plan',
                                 'prose'
                               )),

  -- Polymorphic. UUID of the chart row created on accept when one exists
  -- (e.g. a prescription_medicines id). NULL when the accept wrote into a
  -- JSON/text field with no row identity. Not a FK.
  created_row_id             UUID,

  accepted_by                UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  accepted_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT visit_narrative_provenance_span_order CHECK (
    span_start >= 0 AND span_end > span_start
  )
);

CREATE INDEX IF NOT EXISTS idx_visit_narrative_provenance_session
  ON visit_narrative_provenance (consultation_session_id);

CREATE INDEX IF NOT EXISTS idx_visit_narrative_provenance_created_row
  ON visit_narrative_provenance (created_row_id)
  WHERE created_row_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_visit_narrative_provenance_transcript
  ON visit_narrative_provenance (transcript_id);

COMMENT ON TABLE visit_narrative_provenance IS
  'Append-only provenance for accepted transcript-derived chart items (VN-Q5 = b). '
  'Stores spans, not text. Quotes are sliced from consultation_transcripts.transcript_text. '
  'ON DELETE CASCADE from consultation_transcripts inherits erasure. '
  'RLS deny-all; service-role API only.';

COMMENT ON COLUMN visit_narrative_provenance.transcript_id IS
  'FK to consultation_transcripts(id) ON DELETE CASCADE. The erasure anchor. '
  'No production path currently deletes a transcript row — CASCADE is correct and may be inert.';

COMMENT ON COLUMN visit_narrative_provenance.span_start IS
  'Inclusive start index into consultation_transcripts.transcript_text. Must be >= 0. Never log the slice.';

COMMENT ON COLUMN visit_narrative_provenance.span_end IS
  'Exclusive end index into consultation_transcripts.transcript_text. Must be > span_start. Never log the slice.';

COMMENT ON COLUMN visit_narrative_provenance.target_kind IS
  'subjective | vitals | assessment | investigations | plan | prose. Mirrors VisitDescribeKind. Not clinical text.';

COMMENT ON COLUMN visit_narrative_provenance.created_row_id IS
  'Optional UUID of the chart row created on accept. Polymorphic — not a FK. NULL when the write has no row identity.';

COMMENT ON COLUMN visit_narrative_provenance.accepted_by IS
  'Auth user who accepted the item. Never log as a name.';

COMMENT ON COLUMN visit_narrative_provenance.consultation_session_id IS
  'Denormalised consult id for the "provenance for this consult" read. CASCADE with the session.';

CREATE OR REPLACE FUNCTION reject_visit_narrative_provenance_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'visit_narrative_provenance is append-only';
  END IF;

  -- Direct DELETE (trigger depth 1) is forbidden.
  -- ON DELETE CASCADE from a parent fires the FK action trigger first,
  -- so this function runs at depth > 1 and is allowed — that is the
  -- inherited erasure path (consultation_transcripts, and also session /
  -- appointment CASCADE).
  IF TG_OP = 'DELETE' AND pg_trigger_depth() <= 1 THEN
    RAISE EXCEPTION 'visit_narrative_provenance is append-only';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS visit_narrative_provenance_no_update ON visit_narrative_provenance;
CREATE TRIGGER visit_narrative_provenance_no_update
  BEFORE UPDATE ON visit_narrative_provenance
  FOR EACH ROW
  EXECUTE FUNCTION reject_visit_narrative_provenance_mutation();

DROP TRIGGER IF EXISTS visit_narrative_provenance_no_delete ON visit_narrative_provenance;
CREATE TRIGGER visit_narrative_provenance_no_delete
  BEFORE DELETE ON visit_narrative_provenance
  FOR EACH ROW
  EXECUTE FUNCTION reject_visit_narrative_provenance_mutation();

ALTER TABLE visit_narrative_provenance ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Reverse migration (documented; kept in-file so the reverse op is one grep
-- away, consistent with 061 / 223).
--
--   DROP TRIGGER IF EXISTS visit_narrative_provenance_no_update
--     ON visit_narrative_provenance;
--   DROP TRIGGER IF EXISTS visit_narrative_provenance_no_delete
--     ON visit_narrative_provenance;
--   DROP FUNCTION IF EXISTS reject_visit_narrative_provenance_mutation();
--   DROP TABLE IF EXISTS visit_narrative_provenance;
--
-- Warning: accepted-item provenance is permanently lost. Prefer superseding
-- with a new migration over reverting.
-- ============================================================================
