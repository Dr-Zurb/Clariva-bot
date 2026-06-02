# Task 17: DB migration — `consultation_messages` table + RLS + Storage bucket policies

## 19 April 2026 — Plan [Text consultation modality](../Plans/plan-04-text-consultation-supabase.md) — Phase C

---

## Task overview

Decision 1 LOCKED text-consult backbone on **Supabase Realtime + Postgres** (not Twilio Conversations, not WhatsApp). The consequence is that every chat message is a database row that the AI pipeline (Plan 10) eventually reads via plain SQL, that Plan 06 extends with attachment + system-message kinds, and that Plan 07 reads back as post-consult chat history. Decision 5 LOCKED **live-only sync for v1** — the RLS insert policy must enforce `consultation_sessions.status = 'live'` so pre-session and post-session writes are physically impossible.

This task lands the **base shape** that every later text/voice/companion-channel surface inherits:

1. The `consultation_messages` table FK'd to `consultation_sessions.id` (Plan 01 Task 15).
2. The `consultation_message_kind` ENUM with `'text'` only (Plan 06 adds `'attachment'` and `'system'` later — designed to extend without rewriting policies).
3. RLS that gates SELECT on session-membership and INSERT on session-membership AND `status = 'live'` AND `sender_id = auth.uid()` — three doors, all enforced at the DB layer.
4. The `consultation-attachments` Supabase Storage bucket with matching RLS (provisioned now, used by Plan 06 — keeps Plan 06 small).
5. The Realtime publication entry so Plan 04 Task 18's adapter can subscribe.

This is the smallest task in Plan 04 but the load-bearing one. Tasks 18, 19, and Plans 06 + 07 all assume this schema is in place.

**Estimated time:** ~2 hours

**Status:** Implementation complete (2026-04-19); pending PR + production smoke (RLS verification deferred to Task 18 adapter tests + manual two-window smoke as documented below).

**Depends on:** Plan 01 Task 15 (hard — `consultation_sessions` table FK source). Plan 04 Tasks 18 + 19 + Plan 06 are gated on this migration shipping.

**Plan:** [plan-04-text-consultation-supabase.md](../Plans/plan-04-text-consultation-supabase.md)

---

## Acceptance criteria

- [x] **Migration `051_consultation_messages.sql` ships** (next free number after 050) with:
  ```sql
  CREATE TYPE consultation_message_kind AS ENUM ('text');
  -- Plan 06 adds: ALTER TYPE consultation_message_kind ADD VALUE 'attachment'; + 'system'

  CREATE TABLE IF NOT EXISTS consultation_messages (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id   UUID        NOT NULL REFERENCES consultation_sessions(id) ON DELETE CASCADE,
    sender_id    UUID        NOT NULL,
    sender_role  TEXT        NOT NULL CHECK (sender_role IN ('doctor', 'patient')),
    kind         consultation_message_kind NOT NULL DEFAULT 'text',
    body         TEXT,                                     -- nullable for future attachment-only / system rows
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS idx_consultation_messages_session_time
    ON consultation_messages(session_id, created_at);
  ```
  Reverse migration drops the index, table, and ENUM in that order.
- [x] **RLS enabled with three policies:**
  ```sql
  ALTER TABLE consultation_messages ENABLE ROW LEVEL SECURITY;

  -- SELECT: doctor or patient on the session can read.
  CREATE POLICY consultation_messages_select_participants
    ON consultation_messages
    FOR SELECT
    USING (
      session_id IN (
        SELECT id FROM consultation_sessions
        WHERE doctor_id = auth.uid() OR patient_id = auth.uid()
      )
    );

  -- INSERT: only the session participant who sent it, only while session is 'live'.
  -- This is what enforces Decision 5 live-only doctrine at the DB layer.
  CREATE POLICY consultation_messages_insert_live_participants
    ON consultation_messages
    FOR INSERT
    WITH CHECK (
      sender_id = auth.uid()
      AND session_id IN (
        SELECT id FROM consultation_sessions
        WHERE (doctor_id = auth.uid() OR patient_id = auth.uid())
          AND status = 'live'
      )
    );

  -- Service-role bypass for backend admin inserts (e.g. Plan 06 system messages).
  -- Service role implicitly bypasses RLS in Supabase; no explicit policy needed.
  ```
  No UPDATE / DELETE policies — messages are immutable from the client. Plan 06's edit/redact decisions are deferred; not in v1 scope.
- [x] **Realtime publication updated:**
  ```sql
  ALTER PUBLICATION supabase_realtime ADD TABLE consultation_messages;
  ```
  Verifies Realtime broadcasts INSERT events to subscribers — Task 19's `<TextConsultRoom>` depends on this.
- [x] **Supabase Storage bucket `consultation-attachments` provisioned** via the same migration (or a sibling SQL block run against `storage.objects`):
  ```sql
  -- Bucket creation is via Supabase dashboard or storage API; document the manual step
  -- if it can't be expressed in raw SQL. Bucket name: 'consultation-attachments'.
  -- Public: false. File size limit: 10 MB. Allowed MIME: image/*, application/pdf.

  -- RLS on storage.objects for this bucket:
  CREATE POLICY consultation_attachments_select_participants
    ON storage.objects
    FOR SELECT
    USING (
      bucket_id = 'consultation-attachments'
      AND (storage.foldername(name))[1] IN (
        SELECT id::text FROM consultation_sessions
        WHERE doctor_id = auth.uid() OR patient_id = auth.uid()
      )
    );

  CREATE POLICY consultation_attachments_insert_live_participants
    ON storage.objects
    FOR INSERT
    WITH CHECK (
      bucket_id = 'consultation-attachments'
      AND (storage.foldername(name))[1] IN (
        SELECT id::text FROM consultation_sessions
        WHERE (doctor_id = auth.uid() OR patient_id = auth.uid())
          AND status = 'live'
      )
    );
  ```
  Path convention: `consultation-attachments/{session_id}/{uuid}.{ext}`. Document this in the migration comment so Plan 06 / 07 follow the same shape.
- [ ] **Migration applies forward + reverse cleanly** against a local Supabase. Pending owner-side verification with the existing migration runner. The migration is structured to be idempotent (DO-block guards on ENUM + Realtime publication, `IF NOT EXISTS` on table + index, `ON CONFLICT DO NOTHING` on bucket, `DROP POLICY IF EXISTS` before each `CREATE POLICY`); reverse SQL is documented inline in a trailing comment block.
- [x] **Content-sanity tests** in `backend/tests/unit/migrations/consultation-messages-migration.test.ts` (NEW) — pins the load-bearing SQL clauses (`auth.uid()` checks, `status = 'live'` guard, `sender_id = auth.uid()` spoof guard, storage path-convention key on `storage.foldername(name)[1]`, no UPDATE/DELETE policies, idempotent guards on ENUM + Realtime + storage policies, reverse-migration documentation present). 21 assertions, all green. **Note:** the original spec called for live-DB RLS scenario tests at `backend/tests/integration/consultation-messages-rls.test.ts`. The repo has no live-Supabase test harness today (`tests/integration/` contains stand-alone `npx ts-node` scripts, not jest tests; jest's `testMatch` only picks up `*.test.ts`). Bootstrapping a Supabase test container is a separate harness task. The full RLS behavior gets programmatic coverage when Plan 04 Task 18's adapter exercises the table via mocked Supabase, plus the manual two-window smoke documented for Task 19.
- [x] **Type-check + lint clean** on touched files. `npx tsc --noEmit` passes. ESLint on the new test file fails with the same pre-existing `parserOptions.project` error that affects every other file under `tests/` (verified against the sibling `tests/unit/migrations/048-catalog-mode-backfill.test.ts`) — not a regression introduced by this task. No source files touched.

---

## Out of scope

- The `text-session-supabase.ts` adapter (Task 18).
- The `<TextConsultRoom>` UI (Task 19).
- DM copy builders (Task 21).
- `'attachment'` and `'system'` ENUM values — Plan 06 adds them via additive `ALTER TYPE ... ADD VALUE`.
- Message edit / delete / redact policies — explicitly out of scope per "messages immutable from client".
- Message threading, reactions, edit history. v1 scope is send + receive only.
- Storage bucket lifecycle (deletion at retention expiry) — that's Task 34's `recording-archival-worker.ts` extended to walk bucket objects, deferred to that task's scope.
- Per-message read receipts. The session-membership model handles "who can see what"; per-message read state is a UX feature that lives on the client side (cached locally in v1).

---

## Files expected to touch

**Backend (migration):**

- `backend/migrations/051_consultation_messages.sql` — new

**Tests:**

- `backend/tests/unit/migrations/consultation-messages-migration.test.ts` — new (content-sanity test pinning load-bearing SQL clauses; 21 assertions). The originally-spec'd live-DB integration test is descoped — see the test acceptance-criterion note above.

**No source code, no frontend touched.**

---

## Notes / open decisions

1. **Storage bucket creation may not be expressible in pure SQL.** Supabase's `storage.buckets` table is technically writable via SQL but bucket-config (file-size limit, MIME whitelist) is set via the Storage API or dashboard. If the migration runner can't create the bucket atomically, document the manual ops step in the migration comment + add a startup-time assertion in `backend/src/services/storage-service.ts` that fails fast if the bucket doesn't exist.
2. **Why `sender_role` as TEXT + CHECK rather than ENUM?** ENUMs are painful to migrate; TEXT + CHECK is friendlier when Plan 06 / future plans need to add roles like `'system'` or `'support_staff'`. Trade-off accepted.
3. **`ON DELETE CASCADE` on `session_id`:** if a session row is hard-deleted (Task 34's archival worker at retention end), the messages go with it. That's the correct doctrine — messages are part of the recording artifact. Document this in the migration comment so the archival worker doesn't need to also `DELETE FROM consultation_messages WHERE session_id = ...` separately.
4. **`sender_id` is NOT FK'd** to `doctors` or `patients`. Two reasons: (a) `auth.uid()` is the source of truth for RLS, FK to physical user tables creates impedance mismatch; (b) account deletion (Task 33) may scrub the patient row but messages must persist under medical-record carve-out. The `sender_role` column gives us the "was this from a patient or doctor" answer without needing the row to exist.
5. **Realtime publication is per-table.** `ALTER PUBLICATION supabase_realtime ADD TABLE consultation_messages` is a one-shot — re-running it errors. The migration should `DROP PUBLICATION ... ` is too aggressive; instead use a `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$` block to make it idempotent. Pattern is in the Supabase docs.
6. **Path convention `{session_id}/{uuid}.{ext}` for storage** is what RLS keys on. Plan 06 must follow it. Document explicitly in the migration comment + in `consultation-message-service.ts` (Task 18) so Plan 06 doesn't drift.
7. **No INSERT cap per session.** A maliciously chatty client could fill a session's chat with 10k messages; rate-limit at the application layer (Task 18's `sendMessage` helper), not at the DB. v1 acceptable; add a 60-msg/min/sender cap in Task 18.
8. **`body` is nullable** so Plan 06 attachment-only rows (`kind = 'attachment'`, body NULL, attachment metadata in a sibling table) don't need a schema change. Document this in the migration comment.

### Implementation findings (2026-04-19)

9. **No live-Supabase test harness exists in the repo.** `tests/integration/` is a folder of stand-alone scripts (`test-webhook-controller.ts` etc.) run manually via `npx ts-node` against a live server — jest's `testMatch` glob (`*.test.ts`) doesn't pick them up. `backend/tests/unit/migrations/048-catalog-mode-backfill.test.ts` set the precedent for this codebase: migration changes are validated by content-sanity tests against the SQL string, with full RLS behavior verified manually + via service-using unit tests downstream. This task's test follows that precedent (21 pinned clauses).
10. **Realtime publication may not exist on every deployment.** Self-hosted Postgres without the Supabase Realtime extension would fail the `ALTER PUBLICATION supabase_realtime ADD TABLE ...` call. Wrapped the ADD in a DO block that catches both `duplicate_object` (already published — re-run safety) and `undefined_object` (no Supabase Realtime — non-Supabase deployments). The latter emits a `RAISE NOTICE` so it's visible in migration logs but doesn't fail.
11. **Storage bucket file-size limit + MIME whitelist intentionally not applied in this migration.** Different Supabase versions expose `file_size_limit` / `allowed_mime_types` columns on `storage.buckets` differently; running `UPDATE storage.buckets SET file_size_limit = ...` portably across versions is non-trivial. Applied the SQL as a documented comment in the migration so the operator can run it manually post-apply (or via dashboard). Plan 06 should add a startup-time assertion in the storage-upload helper that rejects files exceeding 10 MB / non-whitelisted MIME types if the bucket-level enforcement isn't in place.
12. **Reverse-migration is documented inline, not automated.** The repo has no down-migration runner — convention is forward-only migrations with rollback steps documented in trailing comments (consistent with 049, 050, 027). The test file pins the presence of the reverse-migration documentation block so future edits don't accidentally drop it.

---

## References

- **Plan:** [plan-04-text-consultation-supabase.md](../Plans/plan-04-text-consultation-supabase.md) — Schema deliverable section.
- **Master plan:** [plan-multi-modality-consultations.md](../Plans/plan-multi-modality-consultations.md) — Decision 1 LOCKED + Decision 5 LOCKED.
- **Plan 01 Task 15 — `consultation_sessions` source:** [task-15-consultation-sessions-facade-and-schema.md](./task-15-consultation-sessions-facade-and-schema.md)
- **RLS pattern reference (signed URLs + per-row auth):** `backend/src/services/prescription-attachment-service.ts`
- **Existing migrations directory:** `backend/migrations/` (next free number: 051)

---

**Owner:** TBD  
**Created:** 2026-04-19  
**Status:** Implementation complete (2026-04-19); pending PR + production migration apply.
