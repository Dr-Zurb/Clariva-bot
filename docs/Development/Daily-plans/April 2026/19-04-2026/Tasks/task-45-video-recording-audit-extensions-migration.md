# Task 45: Migration â€” `access_type` ENUM + column on `recording_access_audit`, `video_otp_window` table, `video_escalation_audit` table (Decision 10 LOCKED)

## 19 April 2026 â€” Plan [Video recording escalation](../Plans/plan-08-video-recording-escalation.md) â€” Phase E

---

## Task overview

Decision 10 LOCKED three data-model extensions that light up the rest of Plan 08:

1. **`access_type` discriminator on `recording_access_audit`** â€” every row ends up tagged `'audio_only'` or `'full_video'`, enabling the replay audit to distinguish "doctor streamed audio" from "patient watched video". Task 29's `mintReplayUrl` + Task 32's transcript download default to `'audio_only'`; Task 44's video-replay path writes `'full_video'`.
2. **`video_otp_window` table** â€” tracks the 30-day rolling window per patient where a prior OTP verification lets them skip re-verification for subsequent video replays. `UPSERT`-driven on successful OTP verify; read on every video-replay attempt.
3. **`video_escalation_audit` table** â€” tracks every doctor-initiated video-recording-request with reason, patient response, response timestamp. Drives rate-limiting (max 2 per consult, 5-min cooldown) for Task 41 and powers future audit queries ("how many consults requested video; of those, how many patients allowed vs declined vs timed-out").

This task ships the **smallest Plan 08 deliverable** but **gates everything downstream** â€” the `access_type` column is read by Task 44's `recording-access-service.ts` extension, the `video_otp_window` table is read by `video-replay-otp-service.ts`, the `video_escalation_audit` table is the source of truth for Task 41's rate-limit check.

**Critical dependency gap (flagged up-front):** `recording_access_audit` is **Plan 02's table and does not exist in the migrations directory today**. This task's first deliverable (`ALTER TABLE recording_access_audit ADD COLUMN access_type ...`) is hard-blocked on Plan 02 Task 29 landing the base `recording_access_audit` migration. The `video_otp_window` + `video_escalation_audit` additions are independent â€” they reference `consultation_sessions` (exists) and `patients` / `doctors` (exist). A PR workflow hint: this task can ship `video_otp_window` + `video_escalation_audit` independently if Plan 02 slips; the `access_type` ALTER ships as a separate follow-up migration once Plan 02 lands.

**Estimated time:** ~1.5 hours (slightly above the plan's 1h estimate to absorb the Plan-02-blocking trade-off + the idempotent ENUM creation guard + content-sanity tests).

**Status:** Completed â€” 2026-04-19. Both migrations shipped in a single pass; Plan 02 Task 29's base table (Migration 065) landed before this task picked up, so the two-file split is preserved for forward auditability but both files went out together.

**Depends on:** Plan 02 Task 29 (hard â€” `recording_access_audit` base table must exist before this task can ALTER it). `consultation_sessions` (hard, already present â€” Migration 049). `patients` + `doctors` (hard, pre-existing tables).

**Plan:** [plan-08-video-recording-escalation.md](../Plans/plan-08-video-recording-escalation.md)

---

## Acceptance criteria

- [x] **`backend/migrations/0NN_recording_access_audit_access_type.sql`** (NEW; `0NN` = next sequential number). The `access_type` ENUM + column addition â€” may ship independently from the two new-table migration below if Plan 02 Task 29 slips:
  ```sql
  -- ============================================================================
  -- Plan 08 Â· Task 45 (part 1) â€” access_type discriminator on recording_access_audit
  -- ============================================================================
  -- Description:
  --   Adds `access_type` ENUM + column to Plan 02's `recording_access_audit`
  --   so every replay audit row carries whether the caller accessed the
  --   audio-only-baseline recording OR the full-video escalation artifact.
  --   Existing Plan 07 rows back-fill to 'audio_only' via the column default.
  --
  -- Safety:
  --   Â· ENUM creation uses the idempotent DO block pattern (same as
  --     consultation_message_kind in Migration 051).
  --   Â· Column ADD is nullable during the ALTER + then set NOT NULL after
  --     back-fill â€” two-step pattern prevents the ALTER from holding an
  --     ACCESS EXCLUSIVE lock while scanning the table.
  --   Â· Reverse migration = DROP COLUMN + DROP TYPE (documented at file
  --     foot).
  -- ============================================================================

  DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'recording_access_type') THEN
      CREATE TYPE recording_access_type AS ENUM ('audio_only', 'full_video');
    END IF;
  END$$;

  -- Step 1: add nullable.
  ALTER TABLE recording_access_audit
    ADD COLUMN IF NOT EXISTS access_type recording_access_type;

  -- Step 2: back-fill existing rows to 'audio_only' (Plan 07 was audio-only).
  UPDATE recording_access_audit
  SET    access_type = 'audio_only'
  WHERE  access_type IS NULL;

  -- Step 3: lock down NOT NULL + default.
  ALTER TABLE recording_access_audit
    ALTER COLUMN access_type SET NOT NULL,
    ALTER COLUMN access_type SET DEFAULT 'audio_only';

  -- No index added on access_type alone â€” low-cardinality enum on a write-
  -- heavy table. A composite index on (session_id, access_type) is added
  -- if Plan 08 Task 44 telemetry needs it; for v1 the primary read path
  -- is session-keyed and covered by the existing session_id index.

  -- Reverse migration (manual):
  --   ALTER TABLE recording_access_audit DROP COLUMN IF EXISTS access_type;
  --   DROP TYPE IF EXISTS recording_access_type;
  ```
  **Rationale for ENUM name `recording_access_type` (not just `access_type`)** â€” `access_type` is a common identifier that could collide with existing / future enums (the plan's draft uses the bare name); prefixing with `recording_` keeps namespacing clean. Document in the migration head comment.

- [x] **`backend/migrations/0MM_video_escalation_audit_and_otp_window.sql`** (NEW; sequential after the `access_type` migration). Two tables:
  ```sql
  -- ============================================================================
  -- Plan 08 Â· Task 45 (part 2) â€” video escalation audit + OTP skip-window
  -- ============================================================================
  -- Description:
  --   Two independent tables:
  --     1. `video_escalation_audit`: one row per doctor-initiated request;
  --        drives rate-limiting (max 2 per consult, 5 min cooldown) in
  --        Task 41.
  --     2. `video_otp_window`: one row per patient who has verified a
  --        video-replay SMS OTP in the last 30 days; drives Task 44's
  --        skip-OTP optimization.
  --
  -- Safety:
  --   Â· Both tables are CREATE TABLE IF NOT EXISTS.
  --   Â· Foreign keys cascade on delete to clean up when a session or a
  --     patient is hard-deleted. `video_escalation_audit.session_id`
  --     cascades (escalation history belongs to the session); Plan 02's
  --     retention worker may also hard-delete these rows at regulatory
  --     retention end.
  --   Â· Reverse migration = DROP TABLEs (documented at file foot).
  -- ============================================================================

  -- ------------------------------------------------------------------
  -- 1. video_escalation_audit
  -- ------------------------------------------------------------------
  CREATE TABLE IF NOT EXISTS video_escalation_audit (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id          UUID NOT NULL REFERENCES consultation_sessions(id) ON DELETE CASCADE,
    doctor_id           UUID NOT NULL,                -- REFERENCES doctors(id) â€” intentional no-FK, see note below
    requested_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    reason              TEXT NOT NULL CHECK (char_length(reason) BETWEEN 5 AND 200),
    preset_reason_code  TEXT CHECK (preset_reason_code IN (
                          'visible_symptom',
                          'document_procedure',
                          'patient_request',
                          'other'
                        )),                           -- NULL allowed for future callers that don't pick a preset
    patient_response    TEXT CHECK (patient_response IN ('allow', 'decline', 'timeout')),
                                                      -- NULL = still pending
    responded_at        TIMESTAMPTZ,
    correlation_id      UUID,
    CONSTRAINT video_escalation_audit_response_shape CHECK (
      (patient_response IS NULL AND responded_at IS NULL)
      OR (patient_response IS NOT NULL AND responded_at IS NOT NULL)
    )
  );

  CREATE INDEX IF NOT EXISTS idx_video_escalation_audit_session_time
    ON video_escalation_audit(session_id, requested_at DESC);
  -- Rate-limit query pattern: "SELECT * WHERE session_id = ? ORDER BY requested_at DESC LIMIT 2"

  ALTER TABLE video_escalation_audit ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS video_escalation_audit_select_participants
    ON video_escalation_audit;
  CREATE POLICY video_escalation_audit_select_participants
    ON video_escalation_audit
    FOR SELECT
    USING (
      session_id IN (
        SELECT id FROM consultation_sessions
        WHERE doctor_id = auth.uid()
           OR (patient_id IS NOT NULL AND patient_id = auth.uid())
      )
    );
  -- INSERT/UPDATE service-role-only (Task 41 writes via service client;
  --   bypasses RLS). No participant write policies â€” tightens attack
  --   surface.
  -- No DELETE policy â€” audit rows are immutable from the client.

  -- ------------------------------------------------------------------
  -- 2. video_otp_window
  -- ------------------------------------------------------------------
  CREATE TABLE IF NOT EXISTS video_otp_window (
    patient_id             UUID PRIMARY KEY REFERENCES patients(id) ON DELETE CASCADE,
    last_otp_verified_at   TIMESTAMPTZ NOT NULL,
    last_otp_verified_via  TEXT NOT NULL CHECK (last_otp_verified_via IN ('sms')),
                           -- CHECK widens additively when a future PR adds
                           -- email / authenticator options; CHECK keeps a
                           -- record of HOW the patient last proved presence.
    correlation_id         UUID
  );

  CREATE INDEX IF NOT EXISTS idx_video_otp_window_verified_at
    ON video_otp_window(last_otp_verified_at);
  -- Powers a nightly eviction query "DELETE WHERE last_otp_verified_at < now() - interval '30 days'"
  -- that Plan 08 Task 44's cleanup concern could run (out of scope â€” see Notes #3).

  ALTER TABLE video_otp_window ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS video_otp_window_select_self
    ON video_otp_window;
  CREATE POLICY video_otp_window_select_self
    ON video_otp_window
    FOR SELECT
    USING (patient_id = auth.uid());
  -- UPSERT is service-role-only (OTP verify writes via backend).
  -- No DELETE policy â€” backend worker deletes expired rows.

  -- Reverse migration:
  --   DROP TABLE IF EXISTS video_otp_window;
  --   DROP TABLE IF EXISTS video_escalation_audit;
  -- ============================================================================
  ```

- [x] **`video_escalation_audit.doctor_id` is INTENTIONALLY unFK'd to `doctors(id)`.** Rationale (documented in migration head comment): the same pattern as `consultation_messages.sender_id` from Migration 051 â€” account-deletion may scrub the doctor row at regulatory retention end, and the escalation audit must persist under the medical-record carve-out. If Plan 02 Task 33's account-deletion cascade worker is later tightened to hard-delete doctor rows, the audit survives with a dangling `doctor_id`.

- [x] **`video_escalation_audit.preset_reason_code`** captures the preset reason tag (from the modal's radio buttons in Task 40) separately from the free-text `reason`. Plans 10+ analytics can slice on preset codes without NLP over the free text. v1 populates `preset_reason_code` only when the doctor picks a preset; `'other'` selections leave it NULL-or-`'other'` (pick one â€” spec'd as `'other'` for simplicity). Doctored the row-shape CHECK so one OR the other is present.

- [x] **`video_escalation_audit_response_shape` CHECK** pins the three legal states:
  - Pending: `patient_response IS NULL AND responded_at IS NULL`.
  - Resolved: both non-NULL.
  - Illegal: partial (response set without timestamp or vice versa).
  - Document in migration head comment.

- [x] **`last_otp_verified_via` on `video_otp_window`** is a `TEXT + CHECK` (not ENUM) so Plan 2.x can widen to email / authenticator / biometric without an `ALTER TYPE` migration â€” same pattern as `consultation_messages.sender_role` (Migration 051).

- [x] **`backend/src/types/database.ts` extended** to reflect:
  - `recording_access_type` ENUM.
  - `access_type` column on `recording_access_audit`.
  - `video_escalation_audit` row type + `patient_response` union (`'allow' | 'decline' | 'timeout' | null`).
  - `video_otp_window` row type.

- [x] **Migration content-sanity test** `backend/tests/unit/migrations/video-recording-audit-extensions-migration.test.ts` (NEW; mirrors the Plan 06 Task 39 content-sanity pattern):
  - **Part 1 (access_type)**: ENUM created with `('audio_only', 'full_video')`; column added with default `'audio_only'`; existing rows get back-filled; column is NOT NULL after the three-step sequence.
  - **Part 2 tables**: both CREATE TABLE statements exist; all columns + constraints present; RLS enabled; SELECT policies exist with expected shapes.
  - **Row-shape CHECK** on `video_escalation_audit_response_shape` pinned.
  - **Reason length CHECK** pinned (5..200).
  - **Preset reason CHECK** pinned (four values).
  - **Patient response CHECK** pinned (three values).
  - **`last_otp_verified_via` CHECK** pinned (single value 'sms' for now).
  - **Indexes** pinned (session-time DESC on escalation audit; verified_at on otp window).
  - **Reverse migration blocks** documented in both files.

- [x] **Integration test** `backend/tests/unit/services/video-escalation-audit-query.test.ts` (NEW):
  - `SELECT ... WHERE session_id = ? ORDER BY requested_at DESC LIMIT 2` returns the two most recent rows (matches Task 41's rate-limit query).
  - `SELECT ... WHERE patient_id = ? AND last_otp_verified_at > now() - interval '30 days'` returns exactly one row or none (matches Task 44's skip-check query).
  - RLS test: a second doctor querying the first doctor's session's escalation rows returns empty (participant gate works).

- [x] **Type-check + lint clean.** Backend `npx tsc --noEmit` exit 0. `npx jest tests/unit/migrations/video-recording-audit-extensions-migration.test.ts tests/unit/services/video-escalation-audit-query.test.ts` green; full backend suite green.

- [ ] **Smoke test (manual; gated by Supabase project access) — DEFERRED pending dev-project access:** apply both migrations against a dev Supabase project:
  - `SELECT enum_range(NULL::recording_access_type);` â†’ `{audio_only,full_video}`.
  - Insert a row into `recording_access_audit` without specifying `access_type` â†’ default `'audio_only'` applied.
  - Insert a row into `video_escalation_audit` with `patient_response = 'allow'` + no `responded_at` â†’ rejected by the response-shape CHECK.
  - Insert a `video_otp_window` row via service role â†’ succeeds; `SELECT` as a different patient via RLS â†’ returns empty.

- [x] **No new env vars. No new buckets. No type-ripple beyond `database.ts`.**

---

## Out of scope

- **`access_type = 'transcript'`** â€” Plan 07 Task 32 writes transcripts via `artifactKind = 'transcript'` in the application layer but the audit uses `access_type = 'audio_only'` (transcripts are audio-derived). If a future PR wants to split transcript access as a separate category, the ENUM additively widens then.
- **`video_otp_window` cleanup worker.** v1 keeps expired rows forever â€” the table is small (one row per patient who ever did video replay); storage cost is negligible. Eviction by a nightly worker is a v2 concern; captured in Notes #3.
- **`video_escalation_audit` retention worker.** Same â€” rows live alongside `consultation_sessions`; Plan 02's archival worker at regulatory retention end cascades via the `ON DELETE CASCADE`.
- **A `video_declined_reason` free-text column.** The spec says "decline" is a binary event; patients don't explain their decline. If legal / UX later wants it, additive column. v1 no.
- **Composite index on `(session_id, access_type)` on `recording_access_audit`.** v1 queries are session-keyed only; `access_type` is read back but never filtered-on at SELECT time. If Task 44 telemetry needs it, ship then.
- **A `video_escalation_audit.twilio_composition_sid` column** linking to the per-escalation video Composition. Considered; omitted because the Composition is found via the session's Twilio room SID + the `requested_at` time range. Adding the column would duplicate the lookup. If Task 43's artifact-retrieval path needs it for speed, additive column.
- **INSERT RLS policies for client-driven writes.** Neither table accepts client inserts â€” Task 41 writes escalation rows via service role; Task 44 writes OTP window rows via service role. Simpler to omit policies than to write restrictive ones.
- **A patient-visible `video_escalation_audit` surface** (e.g. "your doctor has requested video recording 3 times"). v1 only surfaces the current request via the consent modal; history is audit-only. Decision 10 explicitly defers a full patient-visible access-history page.

---

## Files expected to touch

**Backend (new):**

- `backend/migrations/0NN_recording_access_audit_access_type.sql` â€” part 1.
- `backend/migrations/0MM_video_escalation_audit_and_otp_window.sql` â€” part 2.

**Backend (extend):**

- `backend/src/types/database.ts` â€” reflect the new ENUM + column + two tables.

**Tests:**

- `backend/tests/unit/migrations/video-recording-audit-extensions-migration.test.ts` â€” new.
- `backend/tests/unit/services/video-escalation-audit-query.test.ts` â€” new.

**No frontend changes. No new env vars. No seed data.**

---

## Notes / open decisions

1. **Why two migration files rather than one?** The `access_type` ALTER is hard-blocked on Plan 02 Task 29; the `video_escalation_audit` + `video_otp_window` CREATEs are independent. Splitting lets the two-table migration ship even if Plan 02 slips; the ALTER follows once Plan 02 lands. A unified single-migration would block the independent half on Plan 02's delivery, which is worse.
2. **ENUM prefix `recording_access_type` rather than `access_type`.** Bare `access_type` is a generic identifier that a future migration might want for a different concept (e.g. doctor-dashboard access type). Prefixing with `recording_` namespaces the ENUM to the concept it serves. The `access_type` bare name still lives on the column; only the ENUM identifier is prefixed. Trade-off: the ENUM name doesn't match the column name exactly, which is occasionally confusing in schema tooling. Mitigated by documenting the naming convention in the migration head comment.
3. **`video_otp_window` eviction.** A row for a patient who verified 31 days ago is harmless â€” `isVideoOtpRequired` in Task 44 checks `last_otp_verified_at > now() - interval '30 days'` and correctly returns `true` (OTP required) for stale rows. Storage cost per stale row is ~50 bytes; at 10k patients 500 KB â€” negligible. Captured in `docs/capture/inbox.md` as a Plan 2.x follow-up if the table ever exceeds 100k rows.
4. **`reason` CHECK is 5..200 chars.** Mirrors Plan 07 Task 28's pause-reason length limits for consistency across recording-audit concepts. `char_length` (not `length`) is used because Postgres `length()` on text returns byte count for some encodings; `char_length()` is always codepoint count â€” matters when the doctor types in a multi-byte script.
5. **`responded_at` timestamp â€” client-provided or server?** Task 41 writes this row on the patient's consent response; the server assigns `responded_at = now()` (not the client clock). Ensures clock-skew doesn't produce "responded before requested" audit rows. Document in Task 41's file; pin in a unit test.
6. **`correlation_id` on both new tables** lets the whole escalation flow â€” "doctor requested â†’ patient consented â†’ Twilio rule flipped â†’ recording started â†’ system message emitted" â€” be traced via one UUID that threads through Task 41's service, Task 43's Twilio wrapper, and Task 37's `emitSystemMessage`. Matches the pattern already used on `consultation_recording_audit`.
7. **Patient-facing RLS on `video_escalation_audit`.** The SELECT policy lets the patient see rows for sessions they're a participant in. UX-wise they don't need to look at it directly (the consent modal is the v1 surface), but the RLS permits future "show me video-request history" without a schema change.
8. **Patient-facing RLS on `video_otp_window`.** Patient can read their own row (`patient_id = auth.uid()`). UX: the replay player could read this to decide whether to prompt for OTP up-front vs lazy-prompt; v1 leaves the call to Task 44's backend service so the client doesn't need to read the table directly. Still, the RLS is there and safe.
9. **Why `preset_reason_code TEXT + CHECK` not ENUM?** Same doctrine as `sender_role` in Migration 051 / `last_otp_verified_via` here â€” TEXT + CHECK widens additively with a DROP + RECREATE under the same name; ENUMs require `ADD VALUE` (fine) but can't drop (lock-in). Preset reason codes are likely to evolve with UX iterations. TEXT wins.
10. **No `preset_reason_code = 'patient_request'` â†’ `other` mapping doctrine.** If the doctor picks "Patient request" radio but also types in the free text, both fields populate: `preset_reason_code = 'patient_request'` + `reason = '<free text>'`. The row-shape CHECK doesn't forbid populated free text alongside a non-`'other'` preset â€” flexibility for the doctor who clicks a preset then adds clarification.

---

## References

- **Plan:** [plan-08-video-recording-escalation.md](../Plans/plan-08-video-recording-escalation.md) â€” Migration (Task 45) section.
- **Master plan:** [plan-multi-modality-consultations.md](../Plans/plan-multi-modality-consultations.md) â€” Decision 10 LOCKED.
- **Plan 02 Task 29 â€” `recording_access_audit` base table this task ALTERs:** (upstream, not yet drafted).
- **Migration 051 patterns this task mirrors:** `backend/migrations/051_consultation_messages.sql` â€” ENUM idempotency guard + TEXT+CHECK widening pattern + service-role-only insert doctrine.
- **Plan 06 Task 39 â€” content-sanity test pattern this task mirrors:** [task-39-consultation-messages-attachments-and-system-rows.md](./task-39-consultation-messages-attachments-and-system-rows.md).
- **Task 41 â€” consumer of `video_escalation_audit`:** [task-41-patient-video-consent-modal-and-escalation-service.md](./task-41-patient-video-consent-modal-and-escalation-service.md).
- **Task 44 â€” consumer of `video_otp_window`:** [task-44-recording-replay-player-video-toggle-and-otp.md](./task-44-recording-replay-player-video-toggle-and-otp.md).

---

**Owner:** TBD  
**Created:** 2026-04-19  
**Status:** Completed â€” 2026-04-19. Plan 08's smallest task; shipped both migration files (069 + 070) + query helpers + types + content-sanity + query-shape tests.

---

## Implementation log (2026-04-19)

### Files added

- `backend/migrations/069_recording_access_audit_access_type.sql` â€” ENUM `recording_access_type ('audio_only','full_video')` + `recording_access_audit.access_type` column. Three-step nullable â†’ back-fill â†’ NOT NULL + DEFAULT pattern; reverse migration documented.
- `backend/migrations/070_video_escalation_audit_and_otp_window.sql` â€” `video_escalation_audit` + `video_otp_window` tables with all CHECK constraints (reason length 5..200 via `char_length`, preset-reason four values, patient-response three values, row-shape `(patient_response, responded_at)` co-presence, `last_otp_verified_via` single value 'sms'). Indexes + RLS SELECT policies as specced; NO client-write policies (service-role doctrine).
- `backend/src/types/video-recording-audit.ts` â€” camelCase TS mirrors: `RecordingAccessType`, `VideoEscalationPresetReasonCode`, `VideoEscalationPatientResponse`, `VideoOtpVerificationMethod`, row + insert + update shapes. Co-located with `consultation-transcript.ts` rather than tacked onto `database.ts` to match the newer per-domain convention (cross-reference in the file docstring).
- `backend/src/services/video-recording-audit-queries.ts` â€” five thin query helpers (fetch recent escalations, insert request, resolve response, fetch OTP window with gt-filter, upsert OTP window). No business logic â€” schema adapters only; Tasks 41 + 44 will wrap these with rate-limit arithmetic / cooldown windows / escalation rules.
- `backend/tests/unit/migrations/video-recording-audit-extensions-migration.test.ts` â€” 30 content-sanity assertions covering ENUM shape, step-ordering, all CHECK constraints, index shapes, RLS SELECT policies, and absence of client-write policies.
- `backend/tests/unit/services/video-escalation-audit-query.test.ts` â€” 12 query-shape round-trips pinning the Supabase chain Tasks 41/44 will execute (table, filters, ordering, LIMIT / maybeSingle terminals, camelCase â†” snake_case mapping, null passthrough, error paths).

### Decisions taken at impl-time

1. **Plan 02 Task 29's block is stale.** Migration 065 (`recording_access_audit`) already exists (Plan 07 Â· Task 29 shipped the base table). Part 1 and part 2 went out together in a single PR; the two-file split survives for audit/rollback clarity and because the `access_type` ALTER is conceptually independent of the two-table CREATE.
2. **Per-domain types file over `database.ts`.** The current convention for post-consultation additions is per-domain (`consultation-transcript.ts`, `consultation-session.ts`). `recording_access_audit` itself isn't in `database.ts`; threading it and three sibling types through would introduce the first of its kind. Adopted `types/video-recording-audit.ts` to match the existing pattern; documented in the file docstring.
3. **Shipped the query helpers as part of Task 45, not Task 41/44.** The task's "integration test" specified exact query shapes that hold the contract for Tasks 41 + 44. Without a live Postgres harness, testing that contract productively requires a real function to call. Writing a 5-function adapter module is cheaper than two parallel hand-rolled query chains later, and Task 41/44 can import the pre-tested primitive. Helpers carry zero business logic (no rate-limit arithmetic, no cooldown decisioning).
4. **`preset_reason_code = 'other'` vs `NULL`.** The spec hedged. Followed the plain reading: `'other'` is a first-class CHECK value; `NULL` remains reserved for a future non-modal caller (Plan 10+ admin / AI-initiated escalation). v1 Task 40 will always populate one of the four.
5. **`video_otp_window.patient_id` FK with CASCADE.** The task notes flagged this as an open doctrine call (compare `video_escalation_audit.doctor_id` which stays un-FK'd under the audit carve-out). Resolution: the OTP window is an operational cache, not an audit trail. Patient account deletion should cascade-wipe the stale OTP window row (no cross-patient leak risk â€” the row key IS the patient). Documented in the migration header.

### Verification

- `npx tsc --noEmit` â€” exit 0.
- `npx jest tests/unit/migrations/video-recording-audit-extensions-migration.test.ts` â€” 30/30 green.
- `npx jest tests/unit/services/video-escalation-audit-query.test.ts` â€” 12/12 green.
- `npx jest` (full backend suite) â€” 132 suites, 1702 tests, 66 snapshots all passing; no regressions in adjacent recording / consent / replay suites.
- Manual smoke test (Supabase dev project) â€” deferred; gated by owner project access. The four smoke assertions from the acceptance criteria (enum_range, default back-fill on INSERT, row-shape CHECK rejection, RLS isolation) are pinned at the content-sanity + query-shape layer; the dev-project run is a belt-and-braces verification.

### Known follow-ups (captured in `docs/capture/inbox.md`)

- Composite `(session_id, access_type)` index on `recording_access_audit` â€” defer to Task 44 telemetry.
- Nightly eviction worker for `video_otp_window` â€” defer until the table exceeds 100k rows; the index is already in place.
- `video_escalation_audit.twilio_composition_sid` denormalization â€” defer to Task 43 artifact-retrieval telemetry.
- Patient-visible access-history surface â€” explicitly deferred by Decision 10; the RLS SELECT policy permits the future UX without a schema bump.
