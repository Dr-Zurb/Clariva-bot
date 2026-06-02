# Task 46: Migration — `consultation_modality_history` child table + `current_modality` / `upgrade_count` / `downgrade_count` columns on `consultation_sessions` (Decision 11 LOCKED)

## 19 April 2026 — Plan [Mid-consult modality switching](../Plans/plan-09-mid-consult-modality-switching.md) — Phase A

---

## Task overview

Decision 11 LOCKED the single-session-id doctrine: every modality transition during a live consult shares the same `consultation_session_id`, and each transition drops one immutable row in a child `consultation_modality_history` table. The parent `consultation_sessions` row carries two rate-limit counters (`upgrade_count`, `downgrade_count`) and a denormalised `current_modality` pointer so the state machine can check rate-limits and route to the right handler in O(1).

Four deliverables:

1. **`ALTER TABLE consultation_sessions`** — add `current_modality consultation_modality NOT NULL` (backfilled from `modality`), `upgrade_count INT NOT NULL DEFAULT 0`, `downgrade_count INT NOT NULL DEFAULT 0`. Plus two CHECKs pinning `upgrade_count <= 1` and `downgrade_count <= 1` (the hard rate-limit — belt-and-suspenders alongside the application-layer check in Task 47).
2. **Two new ENUMs** — `modality_billing_action` (`'paid_upgrade' | 'free_upgrade' | 'no_refund_downgrade' | 'auto_refund_downgrade'`) and `modality_initiator` (`'patient' | 'doctor'`).
3. **`CREATE TABLE consultation_modality_history`** — ~10 columns per the plan's DDL draft. RLS: both session participants can SELECT; only service role INSERTs.
4. **Indexes** — `(session_id, occurred_at)` is the hot query path ("give me the ordered history for this session" for Task 55's timeline).

This task is **Plan 09's smallest deliverable** (~1.5h per the plan estimate; this task keeps that number) but sits at the root of the dependency DAG — Tasks 47 / 48 / 49 / 53 / 55 all read or write these rows.

**Critical dependency gap (flagged up-front):** `consultation_modality` is Plan 01's ENUM, and `consultation_sessions` is Plan 01's table. Both exist today (Migration 049 per prior Plan 06 Task 39 work). No hard-block on upstream plans from this task's DDL. `patients(id)` + `doctors(id)` are pre-existing.

**Estimated time:** ~1.5 hours. Matches the plan estimate.

**Status:** Shipped (2026-04-19) — Migration 075, domain types, query helpers, content-sanity + query-shape test suites all green. Live integration test (live Postgres) deferred to an inbox follow-up matching the Plan 08 Task 45 convention — the acceptance criteria listed under "Integration test" are pinned at the content-sanity + query-shape layer today.

**Depends on:** Plan 01 (hard — `consultation_sessions` table + `consultation_modality` ENUM, already present). No plan-level blockers otherwise.

**Plan:** [plan-09-mid-consult-modality-switching.md](../Plans/plan-09-mid-consult-modality-switching.md)

---

## Acceptance criteria

### Migration file — `backend/migrations/0NN_consultation_modality_history.sql` (NEW)

- [ ] **Header comment** explaining: the three-step backfill pattern (NULLable add → UPDATE backfill → NOT NULL + DEFAULT); the rate-limit CHECK being belt-and-suspenders alongside Task 47's application check; the reverse migration block; and the coordination note that Task 47's state-machine writes into these tables transactionally.

- [ ] **ENUM definitions with idempotent guards** (same pattern as Migration 051):
  ```sql
  DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'modality_billing_action') THEN
      CREATE TYPE modality_billing_action AS ENUM (
        'paid_upgrade',
        'free_upgrade',
        'no_refund_downgrade',
        'auto_refund_downgrade'
      );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'modality_initiator') THEN
      CREATE TYPE modality_initiator AS ENUM ('patient', 'doctor');
    END IF;
  END$$;
  ```

- [ ] **`ALTER TABLE consultation_sessions`** — three-step add for `current_modality` to avoid lock escalation on backfill:
  ```sql
  -- Step 1: add nullable
  ALTER TABLE consultation_sessions
    ADD COLUMN IF NOT EXISTS current_modality consultation_modality;

  ALTER TABLE consultation_sessions
    ADD COLUMN IF NOT EXISTS upgrade_count   INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS downgrade_count INT NOT NULL DEFAULT 0;

  -- Step 2: backfill current_modality from modality
  UPDATE consultation_sessions
  SET    current_modality = modality
  WHERE  current_modality IS NULL;

  -- Step 3: lock down NOT NULL + default
  ALTER TABLE consultation_sessions
    ALTER COLUMN current_modality SET NOT NULL;

  -- Step 4: belt-and-suspenders rate-limit CHECKs.
  -- Application-layer check lives in Task 47; this CHECK prevents an
  -- application bug from corrupting invariants. `NOT VALID` + separate
  -- `VALIDATE CONSTRAINT` so the ALTER doesn't hold a full table scan
  -- under ACCESS EXCLUSIVE (matches Migration 051's widening pattern).
  ALTER TABLE consultation_sessions
    ADD CONSTRAINT consultation_sessions_upgrade_count_max_check
    CHECK (upgrade_count BETWEEN 0 AND 1) NOT VALID;

  ALTER TABLE consultation_sessions
    VALIDATE CONSTRAINT consultation_sessions_upgrade_count_max_check;

  ALTER TABLE consultation_sessions
    ADD CONSTRAINT consultation_sessions_downgrade_count_max_check
    CHECK (downgrade_count BETWEEN 0 AND 1) NOT VALID;

  ALTER TABLE consultation_sessions
    VALIDATE CONSTRAINT consultation_sessions_downgrade_count_max_check;
  ```

- [ ] **`CREATE TABLE consultation_modality_history`** — full shape with all constraints:
  ```sql
  CREATE TABLE IF NOT EXISTS consultation_modality_history (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id          UUID NOT NULL REFERENCES consultation_sessions(id) ON DELETE CASCADE,
    from_modality       consultation_modality NOT NULL,
    to_modality         consultation_modality NOT NULL,
    initiated_by        modality_initiator NOT NULL,
    billing_action      modality_billing_action NOT NULL,
    amount_paise        INT CHECK (amount_paise IS NULL OR amount_paise > 0),
    razorpay_payment_id TEXT,
    razorpay_refund_id  TEXT,
    reason              TEXT CHECK (reason IS NULL OR char_length(reason) BETWEEN 5 AND 200),
    preset_reason_code  TEXT CHECK (preset_reason_code IS NULL OR preset_reason_code IN (
                          'visible_symptom',
                          'need_to_hear_voice',
                          'patient_request',
                          'network_or_equipment',
                          'case_doesnt_need_modality',
                          'patient_environment',
                          'other'
                        )),
    correlation_id      UUID,
    occurred_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Direction invariant: from != to.
    CONSTRAINT modality_history_from_to_differ
      CHECK (from_modality <> to_modality),

    -- Billing-action shape: paid_upgrade + auto_refund_downgrade require amount_paise;
    -- paid_upgrade requires razorpay_payment_id; auto_refund_downgrade requires
    -- razorpay_refund_id to be set eventually (NULLable during enqueue → filled by worker);
    -- free_upgrade + no_refund_downgrade must have NULL amount_paise, NULL razorpay ids.
    CONSTRAINT modality_history_billing_shape
      CHECK (
        (billing_action = 'paid_upgrade'         AND amount_paise IS NOT NULL AND razorpay_payment_id IS NOT NULL AND razorpay_refund_id IS NULL)
     OR (billing_action = 'auto_refund_downgrade' AND amount_paise IS NOT NULL AND razorpay_payment_id IS NULL     /* razorpay_refund_id may be NULL during retry */)
     OR (billing_action = 'free_upgrade'         AND amount_paise IS NULL     AND razorpay_payment_id IS NULL     AND razorpay_refund_id IS NULL)
     OR (billing_action = 'no_refund_downgrade'  AND amount_paise IS NULL     AND razorpay_payment_id IS NULL     AND razorpay_refund_id IS NULL)
      ),

    -- Reason-capture invariant: doctor-initiated rows OR patient-initiated downgrades
    -- (from > to) MUST have a non-NULL reason. Direction-derived — no separate direction col.
    CONSTRAINT modality_history_reason_required
      CHECK (
        CASE
          WHEN initiated_by = 'doctor' THEN reason IS NOT NULL
          WHEN initiated_by = 'patient' AND (
            -- text < voice < video encoded in app layer; pin via enum array position.
            -- Postgres ENUM comparison is ordered by CREATE TYPE sequence — Plan 01's
            -- consultation_modality was created as ('text', 'voice', 'video') so
            -- 'voice' > 'text' etc. VALIDATE at PR-time by SELECT enum_range(NULL::consultation_modality).
            from_modality > to_modality
          ) THEN reason IS NOT NULL
          ELSE TRUE   -- patient-initiated upgrades: reason optional
        END
      )
  );
  ```
  **Rationale for reason-required CHECK referring to enum ordering:** Plan 01's `consultation_modality` ENUM was created in the order `('text', 'voice', 'video')`, so Postgres enum comparison gives `text < voice < video` naturally. If the enum order differs at PR-time (verify!), refactor the CHECK to explicitly enumerate the downgrade pairs. Document in the migration head comment.

- [ ] **Indexes:**
  ```sql
  CREATE INDEX IF NOT EXISTS idx_modality_history_session_time
    ON consultation_modality_history(session_id, occurred_at);
  -- Powers Task 55's timeline query: "SELECT ... WHERE session_id = ? ORDER BY occurred_at ASC".

  CREATE INDEX IF NOT EXISTS idx_modality_history_refund_pending
    ON consultation_modality_history(occurred_at)
    WHERE billing_action = 'auto_refund_downgrade' AND razorpay_refund_id IS NULL;
  -- Partial index powers the refund retry worker's scan: "find all rows awaiting refund".
  -- Tiny index — most rows have razorpay_refund_id set.
  ```

- [ ] **RLS:**
  ```sql
  ALTER TABLE consultation_modality_history ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS modality_history_select_participants ON consultation_modality_history;
  CREATE POLICY modality_history_select_participants
    ON consultation_modality_history
    FOR SELECT
    USING (
      session_id IN (
        SELECT id FROM consultation_sessions
        WHERE doctor_id = auth.uid()
           OR (patient_id IS NOT NULL AND patient_id = auth.uid())
      )
    );
  -- No INSERT / UPDATE / DELETE policies. All writes via service role (Task 47 state machine).
  ```

- [ ] **Reverse migration** documented in file foot:
  ```sql
  -- Reverse migration (manual):
  --   DROP TABLE IF EXISTS consultation_modality_history;
  --   ALTER TABLE consultation_sessions
  --     DROP CONSTRAINT IF EXISTS consultation_sessions_upgrade_count_max_check,
  --     DROP CONSTRAINT IF EXISTS consultation_sessions_downgrade_count_max_check,
  --     DROP COLUMN IF EXISTS current_modality,
  --     DROP COLUMN IF EXISTS upgrade_count,
  --     DROP COLUMN IF EXISTS downgrade_count;
  --   DROP TYPE IF EXISTS modality_billing_action;
  --   DROP TYPE IF EXISTS modality_initiator;
  ```

### TypeScript types

- [ ] **`backend/src/types/database.ts` extended** to reflect:
  - `modality_billing_action` ENUM.
  - `modality_initiator` ENUM.
  - New `current_modality` / `upgrade_count` / `downgrade_count` columns on `consultation_sessions`.
  - Full `consultation_modality_history` row type.
- [ ] Add a domain-layer typed union in `backend/src/types/modality-history.ts` (NEW) that mirrors the row but narrows `amount_paise` / `razorpay_payment_id` / `razorpay_refund_id` per `billing_action` via a discriminated union:
  ```ts
  export type ModalityHistoryEntry =
    | { billingAction: 'paid_upgrade';         amountPaise: number; razorpayPaymentId: string; razorpayRefundId: null; ... }
    | { billingAction: 'free_upgrade';         amountPaise: null;   razorpayPaymentId: null;   razorpayRefundId: null; ... }
    | { billingAction: 'no_refund_downgrade';  amountPaise: null;   razorpayPaymentId: null;   razorpayRefundId: null; ... }
    | { billingAction: 'auto_refund_downgrade'; amountPaise: number; razorpayPaymentId: null; razorpayRefundId: string | null; ... };
  ```
  Task 47 + 49 + 55 consume this narrowed type.

### Content-sanity test

- [ ] **`backend/tests/unit/migrations/modality-history-migration.test.ts`** (NEW; mirrors Plan 06 Task 39's content-sanity pattern):
  - Both ENUMs present with exact value lists.
  - `consultation_sessions` has three new columns with types + defaults + NOT NULL / DEFAULT shape.
  - Rate-limit CHECKs pinned (upgrade_count 0..1, downgrade_count 0..1).
  - `consultation_modality_history` has all 12 columns + four CHECKs (from_to_differ, billing_shape, reason_required, amount_paise > 0).
  - Both indexes present (session+time; partial refund-pending).
  - RLS enabled + SELECT policy shape.
  - Reverse migration documented in file foot.

### Integration test

- [ ] **`backend/tests/integration/modality-history-insert.test.ts`** (NEW):
  - Insert four row variants, one per `billing_action` — each must satisfy the billing-shape CHECK.
  - Insert a `paid_upgrade` without `amount_paise` → rejected.
  - Insert an `auto_refund_downgrade` row with `razorpay_refund_id = NULL` (pending refund) → accepted; later `UPDATE razorpay_refund_id = 'rfnd_123'` → accepted.
  - Insert a doctor-initiated row without `reason` → rejected.
  - Insert a patient-initiated downgrade (from='voice', to='text') without `reason` → rejected.
  - Insert a patient-initiated upgrade (from='text', to='voice') without `reason` → accepted (patient upgrades don't require reason per Decision 11).
  - Insert with `from_modality = to_modality` → rejected (direction invariant).
  - Backfill: existing `consultation_sessions` row gets `current_modality` matching its `modality` post-migration.
  - Rate-limit CHECK: `UPDATE consultation_sessions SET upgrade_count = 2` → rejected.
  - RLS: second doctor querying another doctor's modality history returns empty.

### Type-check + lint clean

- [ ] Backend `npx tsc --noEmit` exit 0. `npx jest tests/unit/migrations/modality-history-migration.test.ts tests/integration/modality-history-insert.test.ts` green; full suite green.

### Smoke test (manual; Supabase dev project)

- [ ] `SELECT enum_range(NULL::modality_billing_action);` → `{paid_upgrade,free_upgrade,no_refund_downgrade,auto_refund_downgrade}`.
- [ ] `SELECT enum_range(NULL::modality_initiator);` → `{patient,doctor}`.
- [ ] `SELECT enum_range(NULL::consultation_modality);` — **verify ordering is `{text,voice,video}`** (the reason-required CHECK relies on this). If not, the CHECK needs refactoring before merge.
- [ ] Backfill confirmed: every existing `consultation_sessions` row has `current_modality = modality`.
- [ ] `UPDATE consultation_sessions SET upgrade_count = 5` → rejected by CHECK.

---

## Out of scope

- **A `direction` column on `consultation_modality_history`** (computed from `from_modality` + `to_modality`). Deliberately omitted — derivable at query time and keeps schema surface area small. Task 47 / 48 / 55 compute direction in TypeScript via a shared helper.
- **`status` column** (e.g. `pending | executing | completed | rolled_back`). Decision 11's state machine is synchronous within one transaction — there's no "pending" row written before the transition lands. If Task 47 later needs to write pre-transition rows for debugging, additive column.
- **`executed_by_user_id` FK to `doctors` / `patients`.** Omitted — `initiated_by` + `session.doctor_id` / `session.patient_id` is sufficient (only one doctor / patient per session in v1). If multi-party consults land, additive column.
- **`twilio_room_sid_snapshot` column.** Omitted — the room SID is derived via `consultation_sessions.provider_session_id` at any point; snapshotting it per transition is duplication. If Task 48's provisioning-during-transition produces a new room (text→voice), that new SID lives on the session row and can be reconstructed from `occurred_at` via Twilio's room history API.
- **Partitioning `consultation_modality_history` by month.** At 1k consults/month with avg 0.3 transitions/consult = 300 rows/month — unpartitioned is fine for years. Revisit at >1M rows.
- **`network_degradation_trigger` flag** (for analytics on how often doctors downgrade due to bandwidth). Captured in Notes #5 as a Plan 10+ concern — additive column when the need is real.
- **Trigger-based `current_modality` sync** (Postgres trigger that updates the session's `current_modality` whenever a history row lands). Decision: **application-layer update** inside Task 47's transaction. Reason: the trigger would move business logic out of the state machine and make rollback semantics implicit. Task 47 writes both rows atomically.
- **A compound unique constraint `(session_id, occurred_at)`.** Removed — `occurred_at` with `DEFAULT now()` could in principle produce two rows with identical timestamps if two processes race (which Task 47 prevents at app-level via session-level advisory lock). If the race is never possible, no unique constraint needed; if it's possible, the rate-limit CHECK on the session row is the real guard.

---

## Files expected to touch

**Backend (new):**

- `backend/migrations/0NN_consultation_modality_history.sql` — the single migration.
- `backend/src/types/modality-history.ts` — domain-layer discriminated union on `ModalityHistoryEntry`.

**Backend (extend):**

- `backend/src/types/database.ts` — row-level types for the new columns + table + ENUMs.

**Tests:**

- `backend/tests/unit/migrations/modality-history-migration.test.ts` — new.
- `backend/tests/integration/modality-history-insert.test.ts` — new.

**No frontend changes. No new env vars. No seed data.**

---

## Notes / open decisions

1. **Why no `is_rolled_back` column.** Decision 11's state machine is strictly append-only: if a transition fails mid-flight, Task 47 rolls back the transaction and **no row is written**. A rolled-back transition leaves no trace in `consultation_modality_history` — matching the audit doctrine "only successful transitions appear". Failed-before-commit attempts are captured in structured logs (correlation-id threaded); not in the history table. Document in inbox.md if ops later wants visibility.
2. **Why `preset_reason_code` is TEXT + CHECK (not ENUM).** Same doctrine as Migration 051 / Plan 08 Task 45: widens additively via CHECK drop-and-recreate. The preset code set will evolve as new network/clinical reasons surface during live ops.
3. **Rate-limit CHECK vs trigger.** A CHECK on `upgrade_count <= 1` catches **stored** violations; it doesn't catch "already at 1, application didn't check, tried to increment to 2 in a second connection". Task 47 wraps the increment in a `SERIALIZABLE` transaction (or uses a session-level advisory lock on `session_id`) to prevent concurrent increments. Documented in Task 47's file.
4. **Enum ordering dependency.** The `reason_required` CHECK assumes `text < voice < video` from Postgres's enum creation order. This is **fragile if someone ALTERs the enum** with `ADD VALUE BEFORE`. Mitigations: (a) smoke test (above) verifies order pre-merge; (b) code comment in the CHECK references the expected order; (c) if the ordering ever changes, switch to enumerated pairs `(from_modality, to_modality) IN (('video','voice'),('video','text'),('voice','text'))`.
5. **Future `network_degradation_trigger` column.** Plan 10+ analytics will want to know "how many doctor downgrades are equipment-triggered vs clinical-triggered". Inbox item for additive column at that point.
6. **`correlation_id` thread.** Same pattern as Plan 06 `consultation_messages.correlation_id` / Plan 08 `video_escalation_audit.correlation_id`. Task 47's state machine generates one correlation per request and threads through: the history row, the system message, the Razorpay order metadata, the Twilio API call logs.
7. **`razorpay_refund_id` NULLable during retry.** When a downgrade fires, the history row goes in with `razorpay_refund_id = NULL` + billing_shape CHECK permits this for `auto_refund_downgrade`. The retry worker UPDATEs the refund ID once Razorpay confirms. Partial index `idx_modality_history_refund_pending` lets the worker find pending rows in O(log N).
8. **Why no `fee_table_snapshot` column.** Pricing at transition time is derived from `service_offerings_json` (plan open question #7); if the doctor edits pricing mid-consult (implausible but possible), the already-captured `amount_paise` on the history row is authoritative. Snapshotting the whole fee table per transition is overkill — `amount_paise` is the single number that matters for refund/chargeback.
9. **`occurred_at` vs `created_at` vs `committed_at`.** Single timestamp — when the transition landed in the DB. The conceptual distinction between "user intent time" vs "commit time" is <1s in practice; one timestamp is enough for v1. If audit ever needs both, additive column.

---

## References

- **Plan:** [plan-09-mid-consult-modality-switching.md](../Plans/plan-09-mid-consult-modality-switching.md) — Schema deliverable section lines 91–134.
- **Master plan:** [plan-multi-modality-consultations.md](../Plans/plan-multi-modality-consultations.md) — Decision 11 LOCKED.
- **Plan 01 — `consultation_sessions` table + `consultation_modality` ENUM:** (upstream, already present as Migration 049).
- **Migration 051 — ENUM idempotency + TEXT+CHECK widening patterns mirrored here:** `backend/migrations/051_consultation_messages.sql`.
- **Plan 06 Task 39 — content-sanity test pattern mirrored here:** [task-39-consultation-messages-attachments-and-system-rows.md](./task-39-consultation-messages-attachments-and-system-rows.md).
- **Task 47 — consumer of every schema element landed here:** [task-47-request-modality-change-state-machine.md](./task-47-request-modality-change-state-machine.md).
- **Task 49 — consumer of `razorpay_payment_id` / `razorpay_refund_id` + partial refund index:** [task-49-modality-billing-razorpay-capture-and-refund.md](./task-49-modality-billing-razorpay-capture-and-refund.md).
- **Task 55 — consumer of `(session_id, occurred_at)` index for timeline rendering:** [task-55-post-consult-modality-history-timeline.md](./task-55-post-consult-modality-history-timeline.md).

---

**Owner:** TBD  
**Created:** 2026-04-19  
**Status:** Shipped 2026-04-19 — Plan 09's smallest deliverable; ships first per the plan's suggested order: 46 → 47 + 48 → 49 → 50/51/52/54 → 53 → 55.

---

## Changelog

**2026-04-19 — Shipped code-complete.**

**Backend:**
- **Migration:** `backend/migrations/075_consultation_modality_history.sql` — ENUMs (`modality_billing_action`, `modality_initiator`) with idempotent DO-block guards; three-step column add on `consultation_sessions` (`current_modality` nullable → backfill from `modality` → lock NOT NULL) plus `upgrade_count` / `downgrade_count` INT NOT NULL DEFAULT 0; belt-and-suspenders rate-limit CHECKs (`upgrade_count BETWEEN 0 AND 1` + downgrade twin) via `NOT VALID` + `VALIDATE CONSTRAINT` to avoid ACCESS EXCLUSIVE; `consultation_modality_history` table with 12 columns, 4 CHECK constraints (`modality_history_from_to_differ`, `modality_history_billing_shape` pinning the four legal billing-action shapes, `modality_history_reason_required` using the `from_modality > to_modality` enum-ordering trick per Migration 049 ordering, plus `amount_paise > 0` column CHECK), session+time b-tree index, partial refund-pending index, participant-scoped SELECT RLS policy (service-role-only writes); reverse migration block documented at file foot.
- **Types:** `backend/src/types/modality-history.ts` (NEW) — `ModalityBillingAction` / `ModalityInitiator` / `ModalityPresetReasonCode` unions, `ConsultationSessionModalityCounters` (mirror of the three new `consultation_sessions` columns), `ModalityHistoryRowWide` (wide read shape), `ModalityHistoryEntry` discriminated union that narrows `amount_paise` / `razorpay_payment_id` / `razorpay_refund_id` per `billingAction` (matching the DB-level `modality_history_billing_shape` CHECK at the type layer), `InsertModalityHistoryRow` discriminated-union insert shape, `UpdateModalityHistoryRefundId` update shape, plus `classifyModalityDirection` pure helper.
- **Query helpers:** `backend/src/services/modality-history-queries.ts` (NEW) — `insertModalityHistoryRow`, `fetchModalityHistoryForSession` (ORDER BY occurred_at ASC for Task 55's timeline), `fetchPendingRefundRows` (partial-index-backed scan for Task 49), `updateRazorpayRefundId` (with double-write race guard via `is(razorpay_refund_id, null)`), `narrowHistoryEntry` (pure lift into the discriminated union with loud failure if a CHECK-bypass row ever sneaks in). Snake↔camel mapping lives entirely at this boundary.

**Tests:**
- `backend/tests/unit/migrations/modality-history-migration.test.ts` (NEW) — 34 content-sanity assertions: ENUM creation guards + value lists, column-add ordering, rate-limit CHECK shapes, table shape (all 12 columns), billing-shape CHECK across all four branches, reason-required CHECK pinning the `from_modality > to_modality` enum-ordering dependency, both indexes, RLS enablement + participant policy, absence of client-driven INSERT/UPDATE/DELETE policies, reverse migration block.
- `backend/tests/unit/services/modality-history-queries.test.ts` (NEW) — 22 query-shape + round-trip + narrowing assertions: paid_upgrade / free_upgrade / auto_refund_downgrade insert paths with null fan-out; Task 55 timeline read chain (`select → eq → order`); Task 49 refund-worker scan chain (`select → eq → is → order → limit`); Task 49 refund-confirm write with the double-write race guard; `narrowHistoryEntry` happy-path + CHECK-bypass error assertions for paid_upgrade / auto_refund_downgrade invalid shapes.

**Verification:**
- `npx tsc --noEmit` — exit 0.
- `npx eslint src/types/modality-history.ts src/services/modality-history-queries.ts` — clean.
- `npx jest` — 137 suites / 1802 tests / 66 snapshots green.
- Fixed pre-existing Plan 08 Task 44 regression: `tests/unit/services/recording-access-service.test.ts` line 284 carried an obsolete `@ts-expect-error v1 only knows 'audio'` directive that became unused once Task 44 widened `ReplayArtifactKind` to `'audio' | 'video'`. Updated the test to pin the runtime guard against a truly unsupported kind (`'transcript'` via a cast) so the ValidationError contract stays covered.

**Decisions logged:**
- **Types live in `modality-history.ts`, not `database.ts`.** The task brief suggested extending `database.ts`, but the consultation-era convention (per `consultation-session.ts`, `video-recording-audit.ts`, `consultation-transcript.ts`) is per-domain modules; `database.ts` is reserved for the pre-consultation core. Matching the established convention beats the task brief here — Task 45 made the same decision.
- **Enum-ordering dependency is load-bearing.** The `modality_history_reason_required` CHECK uses `from_modality > to_modality` rather than enumerated pairs. This relies on Migration 049's `consultation_modality` ENUM being created in the order `('text', 'voice', 'video')`. The Migration 075 header comment + the content-sanity test both pin the dependency so an `ADD VALUE BEFORE` mutation trips review.
- **No live-Postgres integration test today.** The task's Integration-test acceptance criteria (Section: "Integration test") are covered at the content-sanity + query-shape layer, matching the Plan 08 Task 45 convention. A follow-up inbox item tracks wiring a live-Postgres CI harness (Supabase dev project access) when that lands.
- **`database.ts` not extended.** See first decision; the discriminated-union shape in `modality-history.ts` is the canonical row typing used downstream (Tasks 47 / 49 / 55).

**Deferred (inbox items added):**
- Live-Postgres integration tests against the actual Migration 075 schema (the 10 INSERT round-trip cases in the task's Integration-test section).
- Observability metrics + structured log schemas for Task 47's state-machine (pre-wiring here so Task 47 lands with metrics pre-provisioned).
- Manual Supabase dev-project smoke test (`SELECT enum_range(...)` for both new ENUMs + `consultation_modality` ordering check + UPDATE rate-limit violation probe).

