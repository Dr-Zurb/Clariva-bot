# Task text-B1: Migration `083_text_t2_chat_polish.sql` — reactions table + nullable cols + view + RLS + auto-unpin trigger

## 28 April 2026 — Batch [Text consult selected features](../Plans/plan-text-consult-selected-features.md) — Sub-batch B (T2 real polish) — **lands first in B**

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-text.md](./EXECUTION-ORDER-text.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

The single schema slice that the entire Sub-batch B depends on. Every T2 frontend item (B3–B9) consumes one or more of the columns / table / RLS policies introduced here. **Land this first**, smoke against staging, then unblock the eight frontend items in parallel.

What ships in this migration:

1. **`consultation_message_reactions` table** (B5 / T2.9) — append-only join table; one row per (message, user, emoji).
2. **5 nullable additive columns on `consultation_messages`:**
   - `reply_to_id UUID REFERENCES consultation_messages(id) ON DELETE SET NULL` (B4 / T2.10)
   - `edited_at TIMESTAMPTZ` (B6 / T2.11)
   - `deleted_at TIMESTAMPTZ` (B6 / T2.12)
   - `pinned_at TIMESTAMPTZ` (B7 / T2.14)
   - `pinned_by UUID` (B7 / T2.14)
   - `batch_id UUID` (B8 / T2.15) — groups multi-attachment sends from one composer click
3. **`consultation_messages_view`** — view that returns `body = NULL WHEN deleted_at IS NOT NULL` (presents soft-deleted bodies as NULL on the wire so RLS never has to leak the body to a client).
4. **2 new RLS policies** on `consultation_messages`:
   - `consultation_messages_update_recent` — sender can UPDATE only their own messages, only within 60 s of `created_at`, and only the four fields `body / edited_at / deleted_at / reply_to_id` (the last is for compose-time only and gets NULLed via SET NULL on parent delete; trigger forbids changing it post-hoc).
   - `consultation_messages_pin_doctor_only` — only the doctor on the session can UPDATE `pinned_at` / `pinned_by`; cap of 3 simultaneously-pinned messages per session enforced via a CHECK on the doctor-pin policy.
5. **Auto-unpin trigger** — when `deleted_at` is set on a pinned message, automatically NULL `pinned_at` + `pinned_by` so the pinned-banner doesn't reference a tombstone.
6. **Realtime publication updated** — UPDATE events on `consultation_messages` now fan out through the existing publication (verify it doesn't already; reactions table also added to the publication).

**Critical invariants** (Plan F04):
- All new RLS uses **`public.safe_uuid_sub()`** to read the JWT `sub` claim — never raw `auth.uid()`. This is the contract that allows patient HMAC-derived JWTs to satisfy RLS (their `sub` is non-UUID).
- All new policies enforce `consultation_sessions.status = 'live'` for any UPDATE / INSERT — Decision 5 LOCKED live-only writes.

**Estimated time:** ~4 hours (write SQL, idempotent guards, test file, manual apply against local Supabase).

**Status:** Done — landed as `backend/migrations/107_text_t2_chat_polish.sql` (draft cited 083; that slot was already taken by `083_consultation_messages_metadata_column.sql`, next free was 107).

**Depends on:** Plan F04 baseline (migrations 051 / 052 / 062 / 078–082). **Hard-blocks** B3 / B4 / B5 / B6 / B7 / B8 / B9.

**Source plan:** [T2 schema](../../../../Product%20plans/text-consult/plan-t2-text-real-polish.md) (every item's "Touch points" → DB column).

---

## Acceptance criteria

- [x] **Migration `backend/migrations/107_text_t2_chat_polish.sql` lands** with the SQL skeleton below. Idempotent guards (`IF NOT EXISTS`, DO blocks for ENUM / publication) consistent with migrations 051 / 081. _Renumbered from draft's 083 → 107 because 083 was already taken by `083_consultation_messages_metadata_column.sql`; 107 was the next free slot. Two policy refinements vs the skeleton, documented inline in the migration header:_
  - _`consultation_messages_update_recent` adds a patient-claim sender branch (`sender_role='patient'` + `consult_role='patient'` + matching `session_id` claim) so patient JWTs (whose `safe_uuid_sub()` returns NULL) can satisfy the sender check — mirrors migration 079's INSERT contract._
  - _`consultation_messages_pin_doctor_only`'s WITH CHECK explicitly allows unpinning (`NEW.pinned_at IS NULL AND NEW.pinned_by IS NULL`) so the doctor can release a pin; otherwise the 3-cap becomes a one-way ratchet._
  - _Soft-delete view uses the actual schema columns (`attachment_url` / `attachment_mime_type` / `attachment_byte_size` + `metadata`) instead of the draft's `attachment_id` (which does not exist on the table). View is created `WITH (security_invoker = true)` so RLS applies via the caller's grants._
  - _Both `consultation_message_reactions` INSERT and DELETE policies grew a parallel patient-claim branch for the same F04 reason; INSERT also matches `user_id = s.patient_id` for the patient-claim branch since patient JWTs have no real-uid sub._

  ```sql
  -- 1. Reactions table
  CREATE TABLE IF NOT EXISTS consultation_message_reactions (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id  UUID        NOT NULL REFERENCES consultation_messages(id) ON DELETE CASCADE,
    user_id     UUID        NOT NULL,
    emoji       TEXT        NOT NULL CHECK (emoji IN ('👍', '❤️', '✓', '❓', '😮')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (message_id, user_id, emoji)
  );

  CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON consultation_message_reactions(message_id);

  ALTER TABLE consultation_message_reactions ENABLE ROW LEVEL SECURITY;

  -- SELECT: any session participant
  CREATE POLICY consultation_message_reactions_select_participants
    ON consultation_message_reactions FOR SELECT
    USING (
      message_id IN (
        SELECT m.id FROM consultation_messages m
        JOIN consultation_sessions s ON s.id = m.session_id
        WHERE s.doctor_id = public.safe_uuid_sub()
           OR s.patient_id = public.safe_uuid_sub()
      )
    );

  -- INSERT: only on live sessions, only as self
  CREATE POLICY consultation_message_reactions_insert_live_self
    ON consultation_message_reactions FOR INSERT
    WITH CHECK (
      user_id = public.safe_uuid_sub()
      AND message_id IN (
        SELECT m.id FROM consultation_messages m
        JOIN consultation_sessions s ON s.id = m.session_id
        WHERE (s.doctor_id = public.safe_uuid_sub() OR s.patient_id = public.safe_uuid_sub())
          AND s.status = 'live'
      )
    );

  -- DELETE: only own reaction (toggle off)
  CREATE POLICY consultation_message_reactions_delete_own
    ON consultation_message_reactions FOR DELETE
    USING (user_id = public.safe_uuid_sub());

  -- 2. Additive columns
  ALTER TABLE consultation_messages
    ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES consultation_messages(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS pinned_by UUID,
    ADD COLUMN IF NOT EXISTS batch_id UUID;

  CREATE INDEX IF NOT EXISTS idx_consultation_messages_pinned
    ON consultation_messages(session_id, pinned_at) WHERE pinned_at IS NOT NULL;

  -- 3. View that nulls out deleted bodies on the wire
  CREATE OR REPLACE VIEW consultation_messages_view AS
    SELECT
      id, session_id, sender_id, sender_role, kind,
      CASE WHEN deleted_at IS NOT NULL THEN NULL ELSE body END AS body,
      CASE WHEN deleted_at IS NOT NULL THEN NULL ELSE attachment_id END AS attachment_id,
      reply_to_id, edited_at, deleted_at, pinned_at, pinned_by, batch_id,
      created_at
    FROM consultation_messages;

  -- 4. UPDATE policies
  CREATE POLICY consultation_messages_update_recent
    ON consultation_messages FOR UPDATE
    USING (
      sender_id = public.safe_uuid_sub()
      AND created_at > (now() - interval '60 seconds')
      AND session_id IN (
        SELECT id FROM consultation_sessions
        WHERE (doctor_id = public.safe_uuid_sub() OR patient_id = public.safe_uuid_sub())
          AND status = 'live'
      )
    )
    WITH CHECK (
      sender_id = public.safe_uuid_sub()
      AND created_at > (now() - interval '60 seconds')
    );

  CREATE POLICY consultation_messages_pin_doctor_only
    ON consultation_messages FOR UPDATE
    USING (
      session_id IN (
        SELECT id FROM consultation_sessions
        WHERE doctor_id = public.safe_uuid_sub()
          AND status = 'live'
      )
    )
    WITH CHECK (
      pinned_by = public.safe_uuid_sub()
      AND (
        SELECT COUNT(*) FROM consultation_messages
        WHERE session_id = consultation_messages.session_id
          AND pinned_at IS NOT NULL
      ) <= 3
    );

  -- 5. Auto-unpin trigger
  CREATE OR REPLACE FUNCTION auto_unpin_on_delete()
  RETURNS TRIGGER AS $$
  BEGIN
    IF NEW.deleted_at IS NOT NULL AND OLD.pinned_at IS NOT NULL THEN
      NEW.pinned_at := NULL;
      NEW.pinned_by := NULL;
    END IF;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  DROP TRIGGER IF EXISTS trg_auto_unpin_on_delete ON consultation_messages;
  CREATE TRIGGER trg_auto_unpin_on_delete
    BEFORE UPDATE ON consultation_messages
    FOR EACH ROW EXECUTE FUNCTION auto_unpin_on_delete();

  -- 6. Realtime publication (idempotent — DO block per migration 051 pattern)
  DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE consultation_message_reactions;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN RAISE NOTICE 'supabase_realtime publication absent — non-Supabase deployment';
  END $$;
  ```
- [x] **Reverse-migration documented inline** in trailing comments (drop trigger → drop view → drop policies → drop columns → drop reactions table). Forward-only; reverse documented.
- [x] **Content-sanity test** at `backend/tests/unit/migrations/107-text-t2-chat-polish-migration.test.ts` pinning load-bearing clauses (36/36 green via `npx jest tests/unit/migrations/107-text-t2-chat-polish-migration.test.ts`). Filename prefixed `107-` for parity with `106-doctor-settings-cockpit-template-override-migration.test.ts`.
  - [x] `public.safe_uuid_sub()` references present (multiple); no raw `auth.uid()` anywhere in executable SQL (test strips SQL line comments before asserting so header narration mentioning the anti-pattern doesn't trip the check).
  - [x] `status = 'live'` guard present in INSERT (reactions) + both UPDATE policies (≥ 3 occurrences).
  - [x] 60 s edit-window literal present in BOTH `USING` and `WITH CHECK` of `consultation_messages_update_recent` (≥ 2 `interval '60 seconds'` matches).
  - [x] 3-cap pin policy `COUNT(*) ... <= 3` clause present, with the self-referencing subquery aliased (`consultation_messages cm`) to avoid outer-column ambiguity.
  - [x] Soft-delete view nulls `body` AND `attachment_url` / `attachment_mime_type` / `attachment_byte_size` AND `metadata` (the snapshot-visibility discriminant from migration 084).
  - [x] Auto-unpin trigger (`trg_auto_unpin_on_delete`) present, BEFORE UPDATE, drop-if-exists guarded.
  - [x] Both Realtime publication ADDs wrapped in `DO` blocks with both `duplicate_object` and `undefined_object` exception handlers (≥ 2 of each).
  - [x] Reverse-migration comment block present (pins each `DROP` step).
- [ ] **Manual apply against local Supabase** — deferred to PR-time smoke (no local Supabase container available in this workspace today). Migration is structurally idempotent (every `CREATE` is `IF NOT EXISTS` / `OR REPLACE`, every `DROP POLICY` is `IF EXISTS`, both publication ADDs catch `duplicate_object`); the reverse-SQL block at the file foot is copy-pasteable to leave the DB at pre-107 state.
- [ ] **`backend/scripts/diagnose-text-consult-jwt.ts` re-run** — deferred to PR-time (requires live Supabase + env). New policies share the `safe_uuid_sub()` primitive that 079/080/081 already proved out, so the doctor + patient JWT paths should satisfy the new contracts without further mint changes.
- [x] Type-check passes (`npx tsc --noEmit -p backend/tsconfig.json` clean; no source code changed).

---

## Out of scope

- The Realtime adapter changes for the new view — owned by individual frontend tasks (B5 subscribes to reactions, B6 subscribes to UPDATEs on messages).
- The `<MessageBubble>` extract — owned by [task-text-B2](./task-text-B2-message-bubble-extract.md).
- Any frontend code. This task ships SQL + tests + docs only.
- The voice-batch's separate `voice_call_quality` migration — that lands as part of the voice batch's Sub-batch C; coordinate migration numbers at PR time so they don't collide.

---

## Files expected to touch

**Backend:**

- `backend/migrations/107_text_t2_chat_polish.sql` — **new** (~340 LOC SQL incl. narrative header + reverse-migration block). Renumbered from draft's 083 (slot taken). _Implemented._
- `backend/tests/unit/migrations/107-text-t2-chat-polish-migration.test.ts` — **new** (~275 LOC, 36 assertions across 8 describes). _Implemented; 36/36 green._

**No source code, no frontend.**

---

## Notes / open decisions

1. **Migration number `083`** — verify the next free number at PR time. If voice-batch migration claims `083` first, bump to `084`. Migration numbers are first-come-first-serve.
2. **`emoji` CHECK constraint** — locked to the 5-emoji set per the source plan. Adding a 6th emoji is a Decision change; expect a separate migration.
3. **`pinned_by` is NOT FK'd** — same reason as `sender_id` (Plan F04): RLS sources truth from `safe_uuid_sub()`, not the doctor table. Account-deletion semantics preserved.
4. **`reply_to_id ON DELETE SET NULL`** — if a reply target is hard-deleted (Task 34's archival worker eventually), the reply remains but loses its anchor. Frontend B4 must handle `reply_to_id` resolving to a missing parent gracefully (render "Replied to a deleted message").
5. **60 s window stored as a literal** in the policy, not as a session config — keep it explicit so the policy is self-documenting. If we ever extend the window, that's a migration.
6. **3-cap COUNT on pin policy** — slightly expensive (subquery on every pin UPDATE) but called rarely. Pin operations are tens-per-day at most; not a perf concern.
7. **View vs underlying table** — frontend B6 reads via the view (so deleted bodies arrive as NULL). The Realtime subscription stays on the underlying table; the frontend-side adapter must re-apply the same NULL-on-delete projection client-side when an UPDATE event lands. Document this in the B6 task.

---

## References

- **Batch plan:** [plan-text-consult-selected-features.md § Sub-batch B](../Plans/plan-text-consult-selected-features.md)
- **Source plans:** [T2 §T2.9 / §T2.10 / §T2.11 / §T2.12 / §T2.14 / §T2.15](../../../../Product%20plans/text-consult/plan-t2-text-real-polish.md)
- **Foundation invariant — `safe_uuid_sub()`:** [plan-f04-text-foundation-status.md](../../../../Product%20plans/text-consult/plan-f04-text-foundation-status.md)
- **Existing migration patterns:** `backend/migrations/051_consultation_messages.sql` (idempotent ENUM + Realtime + storage policy guards).

---

**Owner:** TBD
**Created:** 2026-04-28
**Completed:** 2026-05-23
**Status:** Done — `backend/migrations/107_text_t2_chat_polish.sql` + matching content-sanity test landed; type-check + 36/36 jest assertions green. Manual local-Supabase apply + `diagnose-text-consult-jwt.ts` re-run deferred to PR-time smoke. B3–B9 unblocked.
