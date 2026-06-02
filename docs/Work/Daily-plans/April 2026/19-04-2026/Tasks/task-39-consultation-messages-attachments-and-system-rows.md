# Task 39: Extend `consultation_messages` schema — `kind = 'attachment' | 'system'`, attachment metadata columns, `system_event` column, `sender_role = 'system'` widening

## 19 April 2026 — Plan [Companion text channel](../Plans/plan-06-companion-text-channel.md) — Phase C

---

## Task overview

Plan 04 Task 17 shipped `consultation_messages` (Migration 051) with the **base shape**: `kind` ENUM seeded with a single value `'text'`, `sender_role` CHECK restricted to `'doctor' | 'patient'`, `body` nullable so attachments can land later without a schema change. The migration's head comment explicitly forecasts Plan 06's additive widening:

> "Plan 06 will additively widen the ENUM with `'attachment'` + `'system'` and the `sender_role` CHECK with `'system'`."

Task 39 cashes that promise. It is a **purely additive** migration that lights up:

1. The two new ENUM values on `consultation_message_kind` so attachment + system rows can be persisted.
2. Attachment metadata columns (`attachment_url`, `attachment_mime_type`, `attachment_byte_size`) — the Storage bucket itself was already provisioned in Migration 051, so this task only adds the message-level pointer.
3. The `system_event` column carrying the canonical event tag (`'consult_started'`, `'recording_paused'`, …) for system rows. NULL when `kind != 'system'`.
4. The `sender_role` CHECK widening to permit `'system'`.
5. A row-level CHECK constraint that pins the per-`kind` shape (system rows must have `system_event` set + `body` set; attachment rows must have `attachment_url` set; text rows must have `body` set).
6. The Plan 04 Task 18 `text-session-supabase.ts#sendMessage` early-throw on `senderRole === 'system'` is removed in this task — that throw was load-bearing only until Plan 06 widened the schema, and Task 37 will rely on the helper accepting `'system'`.

This is the **first task in Plan 06** per the suggested order — backend lifecycle (Task 36) + emitter (Task 37) cannot fire system rows without the schema additions here, and the `<TextConsultRoom>` extensions (Tasks 38 + 24c) cannot render attachment/system rows without them either.

The migration is small (~80 lines including the head comment). The risk is bounded: every change is additive, every existing row continues to SELECT identically, and a reverse migration is straightforward (drop the new policies and columns; ENUM values cannot be dropped in PG without recreating the type — documented as a known reverse-migration limitation).

**Estimated time:** ~1.5 hours (actual: ~1h 15m).

**Status:** Code-complete 2026-04-19 (awaiting manual Supabase smoke test — see Decision log).

**Depends on:** Plan 04 Task 17 (hard — base table + ENUM exist; this migration extends both). Plan 04 Task 18 (soft — its `sendMessage` early-throw on `'system'` is removed in this task; Task 37 then immediately starts emitting system rows via the same helper).

**Plan:** [plan-06-companion-text-channel.md](../Plans/plan-06-companion-text-channel.md)

---

## Acceptance criteria

- [ ] **`backend/migrations/0NN_consultation_messages_attachments_and_system.sql`** (NEW; `0NN` = next sequential migration number — verify against `backend/migrations/` glob at PR-time, currently 053+ given Task 25 may also add 053). Final migration shape:
  ```sql
  -- ============================================================================
  -- Plan 06 · Task 39 — companion-channel attachment + system message support
  -- ============================================================================
  -- Migration: 0NN_consultation_messages_attachments_and_system.sql
  -- Date:      2026-04-19
  -- Description:
  --   Extends Migration 051's `consultation_messages` to support the two
  --   non-text row shapes that Decision 9 LOCKED requires for the
  --   companion-channel UX:
  --
  --     1. Attachment rows  (kind='attachment') — point at a file already
  --                          uploaded to the `consultation-attachments`
  --                          Storage bucket (provisioned in Migration 051).
  --     2. System rows      (kind='system')     — backend-emitted lifecycle
  --                          banners (consult-started, party-joined,
  --                          consult-ended, recording-paused/resumed [Plan 07],
  --                          modality-switched [Plan 09], video-recording-
  --                          started/stopped [Plan 08]).
  --
  -- Safety:
  --   · Additive only — no existing row is altered, no constraint is
  --     tightened on existing rows.
  --   · ENUM additions guarded with `ADD VALUE IF NOT EXISTS` (PG 12+).
  --   · The new row-shape CHECK constraint (`consultation_messages_kind_shape_check`)
  --     uses NOT VALID + VALIDATE pattern so it does NOT scan existing rows
  --     during the ALTER (existing rows are all kind='text' with body set;
  --     they pass the shape check trivially).
  --   · The `sender_role` CHECK widening drops + recreates the constraint
  --     under the same name — Postgres cannot ALTER a CHECK in place. The
  --     drop is safe because the new constraint is strictly broader than
  --     the old one (every value the old constraint allowed, the new one
  --     also allows).
  --
  -- Reverse migration (manual; documented at file foot):
  --   · Drop new policies, columns, and the row-shape CHECK.
  --   · Restore the original sender_role CHECK.
  --   · ENUM values cannot be dropped in Postgres without recreating the
  --     type — documented limitation; in practice this means the rollback
  --     leaves the ENUM with two unused values, which is harmless.
  -- ============================================================================

  -- 1. ENUM additions (idempotent via IF NOT EXISTS — PG 12+)
  ALTER TYPE consultation_message_kind ADD VALUE IF NOT EXISTS 'attachment';
  ALTER TYPE consultation_message_kind ADD VALUE IF NOT EXISTS 'system';

  -- 2. Attachment metadata + system_event column (all nullable; per-kind
  --    presence enforced by the row-shape CHECK below).
  ALTER TABLE consultation_messages
    ADD COLUMN IF NOT EXISTS attachment_url        TEXT,
    ADD COLUMN IF NOT EXISTS attachment_mime_type  TEXT,
    ADD COLUMN IF NOT EXISTS attachment_byte_size  INTEGER CHECK (attachment_byte_size IS NULL OR attachment_byte_size >= 0),
    ADD COLUMN IF NOT EXISTS system_event          TEXT;

  -- 3. Widen sender_role CHECK to allow 'system'.
  --    Drop + recreate under the same name. The new constraint is strictly
  --    broader than the old one, so existing rows (all 'doctor' | 'patient')
  --    pass it trivially; no NOT VALID dance needed for this one.
  ALTER TABLE consultation_messages
    DROP CONSTRAINT IF EXISTS consultation_messages_sender_role_check;
  ALTER TABLE consultation_messages
    ADD CONSTRAINT consultation_messages_sender_role_check
    CHECK (sender_role IN ('doctor', 'patient', 'system'));

  -- 4. Row-shape CHECK — pins the per-kind required-fields contract:
  --      kind='text'       → body NOT NULL, attachment_* NULL, system_event NULL
  --      kind='attachment' → attachment_url NOT NULL, attachment_mime_type NOT NULL,
  --                          system_event NULL  (body optional caption)
  --      kind='system'     → body NOT NULL, system_event NOT NULL,
  --                          attachment_* NULL, sender_role = 'system'
  --
  --    Added NOT VALID first to avoid a full-table scan on rollout, then
  --    VALIDATE-d separately. Existing rows are all kind='text' with body
  --    NOT NULL (Plan 04 enforced this at the application layer in
  --    text-session-supabase.ts#sendMessage), so VALIDATE will succeed.
  ALTER TABLE consultation_messages
    ADD CONSTRAINT consultation_messages_kind_shape_check
    CHECK (
      (kind = 'text'       AND body IS NOT NULL
                            AND attachment_url IS NULL
                            AND attachment_mime_type IS NULL
                            AND attachment_byte_size IS NULL
                            AND system_event IS NULL)
      OR
      (kind = 'attachment' AND attachment_url IS NOT NULL
                            AND attachment_mime_type IS NOT NULL
                            AND system_event IS NULL)
      OR
      (kind = 'system'     AND body IS NOT NULL
                            AND system_event IS NOT NULL
                            AND sender_role = 'system'
                            AND attachment_url IS NULL
                            AND attachment_mime_type IS NULL
                            AND attachment_byte_size IS NULL)
    )
    NOT VALID;

  ALTER TABLE consultation_messages
    VALIDATE CONSTRAINT consultation_messages_kind_shape_check;

  -- 5. RLS — extend the INSERT door for system rows.
  --    The existing consultation_messages_insert_live_participants policy
  --    (Migration 051) blocks system rows from any non-service-role caller
  --    because (a) the patient JWT branch from Migration 052 enforces
  --    sender_role='patient', and (b) the doctor branch enforces
  --    sender_id = auth.uid() which won't match the synthetic 'system'
  --    sender. Service-role inserts bypass RLS entirely, so the backend
  --    `emitSystemMessage` path (Task 37) works unchanged.
  --
  --    No new INSERT policy is added in this migration. Service-role
  --    bypass is the v1 path. If a future caller needs to insert system
  --    rows under a non-service-role JWT (no current use case), an
  --    additive policy can ship in a follow-up migration.
  --
  --    Documented as part of Task 37's contract: system rows MUST be
  --    written via the service-role Supabase client.

  -- 6. Index hint — no new indexes in this migration. The existing
  --    `idx_consultation_messages_session_time` covers the canonical
  --    `WHERE session_id = ? ORDER BY created_at` query that the
  --    <TextConsultRoom> renders for all kinds. A `WHERE kind = 'system'`
  --    workload is not anticipated in v1; revisit if Plan 10's AI
  --    pipeline starts filtering by kind at query time.

  -- ============================================================================
  -- Reverse migration (manual; no automated down-migration tooling):
  --
  --   ALTER TABLE consultation_messages
  --     DROP CONSTRAINT IF EXISTS consultation_messages_kind_shape_check;
  --   ALTER TABLE consultation_messages
  --     DROP CONSTRAINT IF EXISTS consultation_messages_sender_role_check;
  --   ALTER TABLE consultation_messages
  --     ADD  CONSTRAINT consultation_messages_sender_role_check
  --     CHECK (sender_role IN ('doctor', 'patient'));
  --   ALTER TABLE consultation_messages
  --     DROP COLUMN IF EXISTS system_event,
  --     DROP COLUMN IF EXISTS attachment_byte_size,
  --     DROP COLUMN IF EXISTS attachment_mime_type,
  --     DROP COLUMN IF EXISTS attachment_url;
  --   -- Note: cannot DROP the 'attachment' / 'system' values from the
  --   -- consultation_message_kind ENUM without recreating the type.
  --   -- Leaving them in place is harmless (no rows reference them after
  --   -- rollback because the row-shape CHECK is gone and any kind='text'
  --   -- rows are intact).
  -- ============================================================================
  ```
- [ ] **No changes to Migration 051 itself** — Migration 051 is the source of truth for the base shape and its head comment already forecasts Plan 06's additions. This migration is purely additive.
- [ ] **`backend/src/services/text-session-supabase.ts#sendMessage` early-throw removed.** Per Plan 04 Task 18 Departures #5, `sendMessage` currently throws if `senderRole === 'system'` with the message `"Plan 06 lights this up"`. Remove the throw + the surrounding guard; `sendMessage` now accepts `'system'` and persists the row with `kind = 'system'` and the caller-supplied `system_event` (new optional field on the helper's input). The helper signature gains `systemEvent?: SystemEvent` (typed against the new union added in Task 37; if Task 37 hasn't merged yet, type as `string` here and Task 37 narrows). Update the helper's JSDoc to match.
- [ ] **`backend/src/services/consultation-message-service.ts#listMessagesForSession` already handles attachment + system rows** because it returns the full row shape; verify by adding a unit-test case that lists a session containing all three kinds and asserts the rows come back ordered by `created_at` with all columns populated. No code change expected here, just the regression test.
- [ ] **`backend/src/types/database.ts` types extended** to mirror the new columns (`attachment_url`, `attachment_mime_type`, `attachment_byte_size`, `system_event`) and the widened `sender_role` union. The `kind` field already exists; just add `'attachment' | 'system'` to the union. Search for `consultation_message` in `database.ts` and update each appearance.
- [ ] **Migration content-sanity test** in `backend/tests/unit/migrations/consultation-messages-attachments-and-system-migration.test.ts` (NEW; mirrors the Plan 04 Task 18 "Departure 4" pattern). Pins:
  - The two ENUM additions use `ADD VALUE IF NOT EXISTS`.
  - The four new columns are nullable and added with `ADD COLUMN IF NOT EXISTS`.
  - The `sender_role` CHECK is dropped + re-added with the broader `('doctor', 'patient', 'system')` set.
  - The `consultation_messages_kind_shape_check` CHECK is added with `NOT VALID` then `VALIDATE`-d.
  - The `attachment_byte_size` non-negative check exists.
  - No INSERT policy named `consultation_messages_insert_system` exists in the migration body (the plan's draft included it; this task explicitly does NOT ship it because service-role bypass already works — see Notes #1).
  - The reverse-migration block in the file foot comment exists and includes the four DROP COLUMNs in the documented order.
- [ ] **Unit tests** in `backend/tests/unit/services/text-session-supabase.test.ts` (UPDATE — the existing "sendMessage rejects senderRole='system'" test must be inverted):
  - Replace the `expect(...).toThrow(/Plan 06/)` assertion with a happy-path assertion: `sendMessage({ senderRole: 'system', systemEvent: 'consult_started', body: '…' })` succeeds and the row is persisted with `kind = 'system'` + `system_event = 'consult_started'`.
  - Add a negative case: `sendMessage({ senderRole: 'system', /* no systemEvent */ })` throws a `ValidationError` (the application-layer guard mirrors the DB-layer row-shape CHECK; helpful error message rather than a Postgres CHECK violation).
- [ ] **Integration test** in `backend/tests/unit/services/consultation-message-service.test.ts` (UPDATE):
  - `listMessagesForSession` returns text + attachment + system rows in `created_at` order with all columns populated. Fixture inserts one of each kind via the service-role client (bypasses RLS).
- [ ] **No frontend changes in this task.** Tasks 38 + 24c handle the rendering of attachment + system rows in `<TextConsultRoom>`. This task only ships the schema + backend type extensions.
- [ ] **No new env vars.** No new buckets (the `consultation-attachments` bucket already exists from Migration 051).
- [ ] **Type-check + lint clean** on touched files. Backend `npx tsc --noEmit` exit 0. `npx jest tests/unit/migrations/consultation-messages-attachments-and-system-migration.test.ts tests/unit/services/text-session-supabase.test.ts tests/unit/services/consultation-message-service.test.ts` green; full backend suite green.
- [ ] **Smoke test (manual; gated by Supabase project access):** apply the migration to a dev Supabase project; verify via `psql`:
  - `SELECT enum_range(NULL::consultation_message_kind);` → `{text,attachment,system}`.
  - `INSERT INTO consultation_messages (session_id, sender_id, sender_role, kind, system_event, body) VALUES (...)` for a system row succeeds via service-role.
  - The same insert via a patient JWT (Migration 052's RLS shape) is rejected — system rows are service-role-only.
  - `INSERT` of an attachment row without `attachment_url` is rejected by the row-shape CHECK.

---

## Out of scope

- **Storage bucket changes.** The `consultation-attachments` bucket + its session-membership RLS already shipped in Migration 051. This task only ships the message-level pointer.
- **Application-layer attachment helpers.** Task 37 / a follow-up Task 37-extension owns the `sendAttachment(...)` helper that uploads to Storage and inserts the row. This task only ships the schema.
- **Frontend rendering of attachment / system rows.** Tasks 38 + 24c own the `<TextConsultRoom>` rendering changes.
- **Attachment size + MIME enforcement at the bucket level.** Migration 051 documents the `UPDATE storage.buckets SET file_size_limit = 10485760, allowed_mime_types = ARRAY[...]` SQL but doesn't run it (Supabase version-skew). Acceptable v1 — application-layer enforcement is the v1 contract; bucket-level is defense-in-depth captured as an inbox follow-up.
- **`system_event` ENUM.** Deliberately kept as plain `TEXT` so Plan 07, 08, 09 can each ADD VALUE additively without a migration coordination dance. The TypeScript `SystemEvent` union (Task 37) is the source of truth; Postgres-side it's a free-form string. Trade-off: no DB-side validation that an unknown `system_event` value crept in. Acceptable because the only writer is `emitSystemMessage` which is centrally typed in TS.
- **Index on `(session_id, kind)`.** Not added — current query workload is `WHERE session_id = ? ORDER BY created_at` (renders all kinds inline). If a future Plan 10 AI workload starts filtering by `kind`, add the index then.
- **Migration of existing Plan 04 rows.** All existing rows are `kind = 'text'` with `body NOT NULL`; they pass the new row-shape CHECK trivially. No data migration needed.
- **Patient-side ability to insert system rows.** Per Notes #1, no new RLS policy. System rows are backend-emitted via service-role only.
- **An `INSERT` RLS policy explicitly for service-role system writes.** The plan's draft included `consultation_messages_insert_system`; this task deliberately does **not** ship it. Service-role bypass already covers it (Notes #1).

---

## Files expected to touch

**Backend:**

- `backend/migrations/0NN_consultation_messages_attachments_and_system.sql` — new (the migration; ~120 lines including head comment + reverse-migration block).
- `backend/src/services/text-session-supabase.ts` — remove the `sendMessage` early-throw on `senderRole === 'system'`; thread the new optional `systemEvent` field through the insert.
- `backend/src/types/database.ts` — extend the `consultation_messages` type definitions (new columns + widened `kind` / `sender_role` unions). Search for `consultation_message` and update each occurrence.

**Tests:**

- `backend/tests/unit/migrations/consultation-messages-attachments-and-system-migration.test.ts` — new (content-sanity test).
- `backend/tests/unit/services/text-session-supabase.test.ts` — update existing system-rejection test + add new system-happy-path + missing-systemEvent test cases.
- `backend/tests/unit/services/consultation-message-service.test.ts` — add the mixed-kind list-ordering test.

**No frontend changes. No new env vars. No bucket provisioning (already shipped).**

---

## Notes / open decisions

1. **Why no `consultation_messages_insert_system` RLS policy?** The plan's draft included it as `kind = 'system' AND sender_role = 'system' AND auth.role() = 'service_role'`. Inspection of Supabase's RLS model: **service-role keys bypass RLS entirely** — the policy would never actually execute on the service-role write path because RLS is short-circuited. Adding it is technically harmless but misleading (suggests there's a non-service-role path that doesn't exist). The decision: keep the migration honest — service-role bypass is the only system-write path; document it in Task 37's contract. If a future use case needs a non-service-role system writer (e.g. a workflow user with a special JWT claim), a focused additive migration ships then.
2. **Why a row-shape CHECK instead of three separate CHECKs?** A single CHECK with three OR'd branches gives Postgres one constraint to evaluate per insert — same cost as three branchy CHECKs. The single constraint is also easier to read in psql (`\d+ consultation_messages` shows one constraint that visually maps to the three kinds). Trade-off: when the CHECK fails, the error message says `consultation_messages_kind_shape_check` without telling you which branch failed; the application-layer guards (Task 37 in `emitSystemMessage`, Task 39 in `sendMessage`) produce clearer errors before the DB sees the row.
3. **Why `NOT VALID` then `VALIDATE` for the row-shape CHECK?** The migration runs against a live database; without `NOT VALID`, Postgres scans every existing `consultation_messages` row to check the new constraint, holding an `ACCESS EXCLUSIVE` lock for the duration. Migrations 051 + 052 only seeded a tiny number of rows (no production data yet), but the pattern is right — when Plan 04's text consults start producing rows in volume, the same `NOT VALID + VALIDATE` shape supports zero-downtime rollouts.
4. **`system_event` is `TEXT`, not an ENUM.** Three reasons: (a) Plans 07, 08, 09 each want to add their own event tags without coordinating an `ALTER TYPE` migration ordering; (b) the TypeScript `SystemEvent` union in `consultation-message-service.ts` is the actual source of truth — DB-side enforcement would duplicate it; (c) the row-shape CHECK already enforces "non-NULL when kind='system'", which is the only DB-level invariant we care about. The cost of an unknown event tag slipping in is purely cosmetic (renders an unrecognized banner client-side); not worth a migration coordination dance to prevent.
5. **`sender_role = 'system'` rows have no real `sender_id`.** What goes in the `sender_id` column for system rows? Two options: (a) a synthetic constant UUID like `'00000000-0000-0000-0000-000000000000'`; (b) `NULL` — but `sender_id` is `NOT NULL` in Migration 051, and changing that would be a tightening (rows already use it). Recommendation: option (a) — define `SYSTEM_SENDER_ID` as a constant in `consultation-message-service.ts`, document in the file comment, write all system rows with it. Filtering "what messages did Dr. Sharma send?" trivially excludes system rows by `sender_role`. Pin the constant in a unit test so it never drifts.
6. **What about a `kind = 'prescription'` future row?** Plan 04 already delivers prescriptions inside the chat as `kind = 'text'` rows with the prescription PDF URL in the body (the `buildPrescriptionReadyDm` shape). They're message bubbles, not a distinct kind. If a future redesign wants prescription rows to render differently, a new ENUM value can be added additively with another migration following the same pattern as this task. v1 keeps prescriptions as text.
7. **Reverse migration cannot drop ENUM values** — Postgres has no syntax for it short of recreating the type and rewriting every dependent column / index. The reverse-migration block documents this as a known limitation; in practice, leaving `'attachment'` and `'system'` in the ENUM after a rollback is harmless because no rows reference them (the row-shape CHECK has been dropped, but `kind` columns can only be `'text'` once the application layer stops writing the others — which is what the rollback implies).
8. **`attachment_byte_size INTEGER` (not `BIGINT`).** Max file size in v1 is 25 MB (Plan 06 spec); INTEGER (32-bit signed, max ~2.1 GB) is plenty. If a future plan wants to support 100 MB+ attachments, a widening to BIGINT is a one-line additive ALTER.

---

## References

- **Plan:** [plan-06-companion-text-channel.md](../Plans/plan-06-companion-text-channel.md) — Schema deliverable (Task 39) section.
- **Master plan:** [plan-multi-modality-consultations.md](../Plans/plan-multi-modality-consultations.md) — Decision 9 LOCKED.
- **Migration 051 (the table this extends):** `backend/migrations/051_consultation_messages.sql` — base ENUM, table, RLS, Storage bucket. Head comment forecasts Plan 06's additive widening.
- **Migration 052 (patient JWT RLS this task does NOT touch):** `backend/migrations/052_consultation_messages_patient_jwt_rls.sql` — Plan 04 / Task 18 Departure #1.
- **Plan 04 Task 17 — base table source:** [task-17-consultation-messages-table-rls-storage.md](./task-17-consultation-messages-table-rls-storage.md)
- **Plan 04 Task 18 — `sendMessage` helper this task unlocks for system rows:** [task-18-text-session-supabase-adapter.md](./task-18-text-session-supabase-adapter.md) (Departure #5: "`senderRole = 'system'` rejected at the service layer until Plan 06").
- **Plan 06 Task 36 — lifecycle hook that writes the first system rows:** [task-36-companion-channel-lifecycle-hook.md](./task-36-companion-channel-lifecycle-hook.md)
- **Plan 06 Task 37 — `emitSystemMessage` central writer:** [task-37-system-message-emitter.md](./task-37-system-message-emitter.md)

---

**Owner:** TBD  
**Created:** 2026-04-19  
**Status:** Code-complete 2026-04-19 — unblocks Tasks 37, 36, 38, and 24c. See Decision log.

---

## Decision log — 2026-04-19

### What shipped

**Migration (`backend/migrations/062_consultation_messages_attachments_and_system.sql`):**

- Numbered `062_` (next sequential after `061_consultation_transcripts.sql` from Task 25).
- Four ENUM + table extensions, all additive:
  1. `ALTER TYPE consultation_message_kind ADD VALUE IF NOT EXISTS 'attachment'` + `'system'`.
  2. Four new nullable columns on `consultation_messages`: `attachment_url TEXT`, `attachment_mime_type TEXT`, `attachment_byte_size INTEGER CHECK (… IS NULL OR … >= 0)`, `system_event TEXT`.
  3. Widened the `sender_role` CHECK from `('doctor','patient')` → `('doctor','patient','system')` via drop + re-add under the same constraint name (the new CHECK is strictly broader than the old).
  4. New row-shape CHECK `consultation_messages_kind_shape_check` with three OR'd branches pinning the per-kind required-fields contract. Added with `NOT VALID` then `VALIDATE`-d as a separate statement (avoids the `ACCESS EXCLUSIVE` full-table scan during ADD).
- Migration header + trailing reverse-migration block document every step and the known PG limitation (ENUM values cannot be dropped without recreating the type).
- **No new RLS policy.** Service-role bypass is the v1 system-write path (Notes #1); any future non-service-role caller gets a focused additive migration. Existing `consultation_messages_insert_live_participants` policy is deliberately left untouched.
- **No new index.** `idx_consultation_messages_session_time` (Migration 051) still covers the canonical `WHERE session_id = ? ORDER BY created_at` query for all kinds.

**Migration content-sanity test (`backend/tests/unit/migrations/consultation-messages-attachments-and-system-migration.test.ts`):**

- 18 assertions pinning: ENUM additions (`IF NOT EXISTS`), the four column adds (shape + IF NOT EXISTS + nullability), `sender_role` CHECK drop-and-recreate shape, the three row-shape CHECK branches (text / attachment / system) with their required-NULL and required-NOT-NULL columns, `NOT VALID` + `VALIDATE` pattern, **absence** of a `consultation_messages_insert_system` policy (per Notes #1), **absence** of any `DROP POLICY IF EXISTS consultation_messages_insert_live_participants` (can't accidentally regress Migration 051's live-only door), and the reverse-migration documentation for all four column drops + sender_role restore + ENUM-cannot-drop note.

**Service layer:**

- `backend/src/services/consultation-message-service.ts`:
  - Exported new `ConsultationMessageKind = 'text' | 'attachment' | 'system'` union.
  - Widened `MessageRow` with four new fields: `attachmentUrl`, `attachmentMimeType`, `attachmentByteSize`, `systemEvent` (all `string | null` / `number | null` — null for the kinds that don't populate them).
  - Extended `listMessagesForSession` SELECT to include the four new columns and map them (including a defensive `Number(…)` cast on `attachment_byte_size` in case a driver surfaces it as a stringified bigint; null-safe throughout).
- `backend/src/services/text-session-supabase.ts`:
  - Removed the `senderRole === 'system'` early-throw (was blocking Plan 06; no longer needed).
  - Added optional `systemEvent?: string` to `SendMessageInput`. Typed as `string` per task doc ("Task 37 narrows later to the canonical `SystemEvent` union").
  - Application-layer row-shape guard mirrors Migration 062's CHECK: `systemEvent` REQUIRED when `senderRole === 'system'`, REJECTED otherwise. Both throw `ValidationError` with clear breadcrumbs — catches the mistake in the helper instead of surfacing a raw Postgres CHECK violation.
  - Inserts now include `kind: 'text'` by default and `kind: 'system'` + `system_event` for system rows.
  - Exported new `SYSTEM_SENDER_ID = '00000000-0000-0000-0000-000000000000'` constant (Notes #5) — the all-zeros UUID callers MUST use for system rows. Pinned by a unit test so the value never drifts.
- **Attachment writes are NOT exposed via `sendMessage`.** The helper only serves `text` + `system` today. An `sendAttachment` helper (Storage upload + metadata insert) ships in Task 37 or a follow-up — shipping it alongside the schema would overload Task 39. Documented in `sendMessage` JSDoc.

**Tests:**

- **Updated** `backend/tests/unit/services/text-session-supabase.test.ts` (doctor-happy-path assertion now includes the new `kind: 'text'` column; the old "rejects 'system' until Plan 06" test was replaced with four focused system-lifecycle tests: happy path with `systemEvent`, missing-`systemEvent` ValidationError, `systemEvent`-set-without-role ValidationError, and the `SYSTEM_SENDER_ID` pin).
- **Updated** `backend/tests/unit/services/consultation-message-service.test.ts` (existing tests widened to populate the four new columns as null; new mixed-kind test exercises all three kinds in one `listMessagesForSession` call, asserts correct mapping for each, and asserts chronological order is preserved).
- **No changes to** `backend/src/types/database.ts`. The task doc said "Search for `consultation_message` in `database.ts` and update each appearance" — grep returned zero matches. The only type representation of a `consultation_messages` row is `MessageRow` in `consultation-message-service.ts` (which is now extended). Documented this assumption-correction here.

### Scope clarifications

- **Migration number was 062**, not `0NN` placeholder — confirmed via `Get-ChildItem backend/migrations` at PR-start.
- **`database.ts` untouched** — see above. The only consumer of the row shape is the service helper.
- **No `attachment` row write path in this task** — deliberately punted to Task 37 / follow-up per the task doc's Out-of-scope "Application-layer attachment helpers" entry.
- **`SYSTEM_SENDER_ID` owned by `text-session-supabase.ts`, not `consultation-message-service.ts`.** Originally contemplated placing it in the service (where it's read); placed it in the insert helper instead because that's the file that actually writes the value. Re-exported into Task 37's call sites is a one-import addition at that PR-time.
- **No new RLS `INSERT` policy for system rows.** Per Notes #1: service-role bypass makes the policy vestigial; adding it would misleadingly suggest a non-service-role path. Migration content-sanity test explicitly asserts the policy is absent so a future contributor doesn't "helpfully" add it back.

### Verification

- `npx tsc --noEmit` → exit 0 (after swapping a string-concatenated `.select(...)` call back to a single literal — `postgrest-js` type inference reads the column list from the literal).
- `npx jest tests/unit/migrations/consultation-messages-attachments-and-system-migration.test.ts tests/unit/services/text-session-supabase.test.ts tests/unit/services/consultation-message-service.test.ts` → **3 suites / 52 tests** all pass.
- Full backend suite: **107 suites / 1396 tests / 63 snapshots** all pass (+1 suite, +25 tests vs. Task 26 baseline of 106 / 1371).
- `ReadLints` on all five touched files → no lint errors.

### Merge-time checklist (human owner; Supabase project access required)

- [ ] Apply migration `062_` against the dev Supabase project. Confirm:
  - `SELECT enum_range(NULL::consultation_message_kind);` returns `{text, attachment, system}`.
  - `\d+ consultation_messages` shows the four new columns + both CHECKs (`consultation_messages_sender_role_check` widened; `consultation_messages_kind_shape_check` present and `VALID`).
- [ ] Service-role `INSERT` of a system row (`kind='system'`, `sender_role='system'`, `system_event='consult_started'`, `body='…'`, `sender_id='00000000-0000-0000-0000-000000000000'`) succeeds.
- [ ] The same INSERT under a patient-JWT client (Migration 052's RLS shape) is rejected — system rows are service-role-only.
- [ ] `INSERT` of an attachment row missing `attachment_url` is rejected by the row-shape CHECK (Postgres error `consultation_messages_kind_shape_check`).
- [ ] `INSERT` of a text row with `system_event` set is rejected by the row-shape CHECK.
- [ ] Spot-check the existing `<TextConsultRoom>` Supabase Realtime subscription still fires on text-row inserts (Migration 051's publication membership is untouched; smoke test catches any surprise).

### Dependency status

- **Migration 051 (base table)** — shipped. This migration's head comment explicitly forecast Plan 06's additive widening; Task 39 delivers on that forecast.
- **Migration 052 (patient JWT RLS)** — shipped. Untouched by Task 39 — the patient JWT branch still enforces `sender_role='patient'` and correctly blocks patient-JWT'd system-row attempts.
- **Task 37 (`emitSystemMessage`)** — not started. Unblocked by this task; will import `sendMessage` + `SYSTEM_SENDER_ID` from `text-session-supabase.ts` and layer LRU dedup + canonical `SystemEvent` union narrowing on top.
- **Task 36 (companion-channel lifecycle hook)** — not started. Unblocked; will call `emitSystemMessage({ kind: 'consult_started', … })` at facade `createSession` + `endSession` time.
- **Tasks 38 + 24c (frontend rendering)** — not started. Unblocked on the type side (`MessageRow` now exposes all four non-text columns); frontend Realtime subscribers can branch on `row.kind` for rendering.

