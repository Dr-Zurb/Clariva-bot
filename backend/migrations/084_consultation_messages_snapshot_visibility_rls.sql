-- ============================================================================
-- 084_consultation_messages_snapshot_visibility_rls.sql
-- Sub-batch C · task-video-C3 — tighten the SELECT RLS so the patient
--                                cannot see snapshots the doctor took
--                                of the patient (Decision §14).
--
-- WHY THIS EXISTS
--   The product rule for snapshots (decision §14 in
--   `docs/.../28-04-2026/Plans/plan-video-consult-selected-features.md`):
--
--     * Patient sees snapshots THEY took (in chat, both parties see them).
--     * Patient does NOT see snapshots the DOCTOR took of the patient
--       (clinical-record-only, doctor-side visible).
--
--   The discriminant lives in the row's `metadata` JSONB (Migration 083
--   added the column). The shape, written by
--   `backend/src/services/snapshot-storage-service.ts`, is:
--
--     {
--       "snapshot": true,
--       "capturer_role": "doctor" | "patient",
--       "target":        "self"   | "remote",
--       "captured_at":   <ISO-8601>,
--       "dimensions":    { "width": <int>, "height": <int> }
--     }
--
--   "Doctor took it of the patient" maps to:
--     metadata->>'snapshot'      = 'true'
--     metadata->>'capturer_role' = 'doctor'
--     metadata->>'target'        = 'remote'
--
--   The patient SELECT branch must hide rows matching ALL THREE.
--
-- HOW THE GATE COMPOSES WITH 078
--   Migration 078 set up the SELECT policy as a `CASE` on consult_role:
--
--     CASE auth.jwt() ->> 'consult_role'
--       WHEN 'patient' THEN <patient predicate>
--       ELSE              <doctor predicate>
--     END
--
--   Postgres RLS is permissive — multiple policies OR together — so we
--   can NOT simply add a second restrictive policy without restructuring.
--   We instead REPLACE the policy with the same CASE shape, narrowing
--   the patient branch to AND-also-not-a-doctor-snapshot-of-patient.
--
--   The doctor branch is unchanged — doctors see every row in their
--   sessions, including the clinical-only ones they took.
--
-- AUDIT TRAIL FOR THE PATIENT
--   The patient still receives the SYSTEM banner when the doctor takes
--   a snapshot (system_event='snapshot_taken' rows are NOT scoped by
--   `metadata.target`; they're general lifecycle events that both
--   parties see). The CLINICAL ARTIFACT (the JPEG) is what's
--   patient-hidden, not the existence-of-a-snapshot.
--
--   Rationale: hiding the system banner too would create a "the doctor
--   did something off-camera" trust gap. Hiding only the JPEG matches
--   how doctors today take physical-record notes — patient knows the
--   note was taken, doesn't see the note's contents.
--
--   The system banner shape is (`emitSystemMessage` is the writer):
--     kind = 'system'
--     system_event = 'snapshot_taken'
--     body = "Snapshot captured at HH:MM."
--     metadata = { "byRole": "doctor" | "patient", "target": ... }
--
--   System rows have `kind='system'`, NOT `kind='attachment'`, so the
--   patient-hidden predicate below (which only fires on
--   `metadata->>'snapshot'='true'`) doesn't apply. The system row is
--   visible; the attachment row is hidden — desired.
--
-- WHAT CHANGES
--   `consultation_messages_select_participants` is dropped + recreated
--   with the same CASE structure as Migration 078, but the patient
--   branch gains an additional predicate:
--
--     AND NOT (
--       metadata IS NOT NULL
--       AND metadata ->> 'snapshot'      = 'true'
--       AND metadata ->> 'capturer_role' = 'doctor'
--       AND metadata ->> 'target'        = 'remote'
--     )
--
--   `NOT (a AND b AND c AND d)` is true when ANY of (a,b,c,d) is false,
--   so:
--     * Rows with NULL metadata (every existing row, every chat
--       attachment, every system banner) → first AND-clause false →
--       predicate true → row visible. Backwards-compatible.
--     * Patient-taken snapshots (`capturer_role='patient'`) → third
--       AND-clause false → predicate true → row visible.
--     * Doctor-taken-of-doctor snapshots (`target='self'`, e.g. doctor
--       captured their own tile) → fourth AND-clause false → predicate
--       true → row visible. Sensible default — a doctor showing their
--       own face has no patient-confidentiality concern.
--     * Doctor-taken-of-patient snapshots → all four clauses true →
--       NOT(true) = false → row hidden. Desired.
--
-- WHAT DOESN'T CHANGE
--   * Doctor branch of the SELECT policy — doctors see everything.
--   * INSERT policy (`consultation_messages_insert_live_participants`)
--     — Migration 078's CASE is preserved as-is.
--   * Storage-bucket SELECT policy — the JPEG is in
--     `consultation-attachments` and Migration 078 set up the same
--     CASE there. Patient still has FOLDER-level read on
--     `${sessionId}/...`. We do NOT scope the storage SELECT by
--     metadata because the discriminant lives on the consultation_messages
--     row, not the storage object. This is fine: a patient who guesses
--     the storage path of a doctor-taken snapshot would still need a
--     signed URL to read it, and `mintAttachmentSignedUrls` will only
--     mint URLs for paths the patient can resolve via the chat row
--     SELECT path. As long as the chat row is hidden, the storage
--     path never reaches the patient frontend; defense-in-depth.
--   * The `metadata` column shape — the predicate uses `IS NOT NULL`
--     and JSON path operators that no-op on NULLs.
--
-- SAFETY
--   * No table scan — RLS policies are evaluated per-row at query time;
--     this is a metadata change only.
--   * Strictly tighter for patients (some rows now hidden), strictly
--     equal for doctors. No row that was visible to a patient
--     pre-migration becomes hidden post-migration in v1, because:
--     - Pre-migration: no row had `metadata IS NOT NULL` (Migration 083
--       just added the column with NULL default).
--     - The first writer of `metadata` is the snapshot-storage-service
--       shipping in this same task.
--   * Therefore VALIDATE is a no-op for existing data.
--
-- RUN ORDER
--   083 (metadata column) MUST commit before 084 (this migration)
--   because the predicate references `metadata`. Postgres' policy
--   creation re-checks expressions against the current schema.
--
-- ROLLBACK
--   To revert to Migration 078 behavior (no snapshot visibility gate):
--
--     DROP POLICY IF EXISTS consultation_messages_select_participants
--       ON consultation_messages;
--
--     -- Then re-run the policy CREATE block from Migration 078 §1.
--
--   Alternative (preserve the column, drop only the visibility gate):
--   create a one-line migration that drops + recreates the policy with
--   the patient branch shortened to just the `session_id` claim check.
-- ============================================================================

DROP POLICY IF EXISTS consultation_messages_select_participants
  ON consultation_messages;

CREATE POLICY consultation_messages_select_participants
  ON consultation_messages
  FOR SELECT
  USING (
    CASE auth.jwt() ->> 'consult_role'
      WHEN 'patient' THEN
        -- Patient branch — synthetic sub, never call auth.uid().
        -- Membership = JWT's session_id claim equals row's session_id.
        auth.jwt() ->> 'session_id' = consultation_messages.session_id::text
        -- Sub-batch C · task-video-C3 (decision §14) — hide
        -- doctor-taken-of-patient snapshots from the patient. Every
        -- other row (text chat, attachments, system banners,
        -- patient-taken snapshots, doctor-taken-of-doctor-self
        -- snapshots) passes through unchanged.
        AND NOT (
          metadata IS NOT NULL
          AND metadata ->> 'snapshot'      = 'true'
          AND metadata ->> 'capturer_role' = 'doctor'
          AND metadata ->> 'target'        = 'remote'
        )
      ELSE
        -- Doctor branch: real auth user; auth.uid() is safe here
        -- because consult_role is NOT 'patient', so sub is a real UUID.
        -- Doctors see every row in their sessions, including the
        -- clinical-only snapshots they took.
        EXISTS (
          SELECT 1
          FROM consultation_sessions
          WHERE id = consultation_messages.session_id
            AND doctor_id = auth.uid()
        )
    END
  );
