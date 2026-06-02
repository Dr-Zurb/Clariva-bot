# Task text-D5: Rate limit (`110_consultation_messages_rate_limit.sql` + `check_chat_insert_rate(...)` SQL function + RLS rewrite + UI toast)

## 28 April 2026 — Batch [Text consult selected features](../Plans/plan-text-consult-selected-features.md) — Sub-batch D (T5 reliability)

> **Status:** ✅ **Done** — 2026-05-24. Migration renumbered to `110_consultation_messages_rate_limit.sql` (next free after 109 from rx-polish-favorites batch). Two-branch (patient + doctor) RLS preserved verbatim from migration 079 with the rate-check ANDed onto both branches. Frontend wires `useRateLimitCooldown` (per-second window of own-INSERT timestamps) into the `<SendButtonState>` machine, the failed-bubble label, and a 5s dismissable toast.

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-text.md](./EXECUTION-ORDER-text.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

Today the only INSERT throttle is client-side (a recommended 60-msg/min cap noted in Plan F04 task 17, never enforced). A malicious or buggy client could fill a session with 10k messages in a minute. Beyond DB load, this is a risk vector for:

- **Spam** by a malicious patient.
- **Storage attack** (10k messages × 4KB body ≈ 40 MB per session).
- **AI pipeline poisoning** (T3 / Plan 10 reads messages; flooding distorts the input).

This task ships server-side rate limiting AT THE RLS LAYER so any client (web, mobile, scripted) hits the same wall:

- **30 messages / minute / sender / session** (soft).
- **200 messages / hour / sender / session** (hard).

Implementation: a SQL function `check_chat_insert_rate(p_session_id, p_sender_id)` returns boolean by counting recent INSERTs from `consultation_messages` with `created_at > now() - interval '1 minute'` (and similar for hour). The existing `consultation_messages_insert_live_participants` RLS policy is rewritten to chain in the rate-check.

Frontend handles the RLS rejection with an inline composer toast `You're sending too fast — wait a few seconds.` The composer auto-recovers after the cooldown (re-enables Send when the rate-window allows).

**Estimated time:** ~6 hours (migration + SQL function + RLS rewrite + frontend toast + composer cooldown UX + tests).

**Status:** Drafted. Pending pickup.

**Depends on:** None hard. Coordinates with [task-text-A3](./task-text-A3-send-button-states.md) (send-state machine gets a new `'rate-limited'` branch).

**Source plan:** [T5 §T5.34](../../../../Product%20plans/text-consult/plan-t5-text-reliability-safety.md)

---

## Acceptance criteria

### Migration

- [x] **Migration `110_consultation_messages_rate_limit.sql`** (next free after 109 from rx-polish-favorites; original draft cited 085 but 085–109 are now claimed):
  ```sql
  -- 1. Rate-check function
  CREATE OR REPLACE FUNCTION public.check_chat_insert_rate(
    p_session_id UUID,
    p_sender_id  UUID
  ) RETURNS BOOLEAN
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = public
  AS $$
  DECLARE
    v_minute_count INTEGER;
    v_hour_count   INTEGER;
  BEGIN
    SELECT COUNT(*) INTO v_minute_count
    FROM consultation_messages
    WHERE session_id = p_session_id
      AND sender_id = p_sender_id
      AND created_at > (now() - interval '1 minute');

    IF v_minute_count >= 30 THEN
      RETURN FALSE;
    END IF;

    SELECT COUNT(*) INTO v_hour_count
    FROM consultation_messages
    WHERE session_id = p_session_id
      AND sender_id = p_sender_id
      AND created_at > (now() - interval '1 hour');

    IF v_hour_count >= 200 THEN
      RETURN FALSE;
    END IF;

    RETURN TRUE;
  END;
  $$;

  -- 2. Rewrite the INSERT RLS policy to chain in the rate-check.
  --    Implementation note: the original draft below collapsed the
  --    two-branch (patient + doctor) shape from migration 079 into a
  --    single doctor-style branch, which would have BROKEN patient
  --    INSERTs (safe_uuid_sub() is NULL for patients). Shipped code
  --    preserves the dual-branch structure and ANDs the rate-check
  --    onto BOTH branches; see backend/migrations/110_*.sql §2.
  DROP POLICY IF EXISTS consultation_messages_insert_live_participants ON consultation_messages;

  CREATE POLICY consultation_messages_insert_live_participants
    ON consultation_messages FOR INSERT
    WITH CHECK (
      sender_id = public.safe_uuid_sub()
      AND session_id IN (
        SELECT id FROM consultation_sessions
        WHERE (doctor_id = public.safe_uuid_sub() OR patient_id = public.safe_uuid_sub())
          AND status = 'live'
      )
      AND public.check_chat_insert_rate(session_id, sender_id)
    );

  COMMENT ON FUNCTION public.check_chat_insert_rate IS
    'Returns FALSE when the sender has hit the per-minute (30) or per-hour (200) rate cap on a session.';
  ```
- [x] **Reverse migration documented** — drop function + restore prior policy (header doctrine in `110_*.sql` includes the full migration-079 CREATE POLICY block verbatim for one-paste rollback).
- [x] **Content-sanity test** at `backend/tests/unit/migrations/consultation-messages-rate-limit-migration.test.ts` (13 tests, all passing):
  - Function present with `SECURITY DEFINER` + `STABLE` + `SET search_path = public`.
  - Policy rewrite drops and recreates with `safe_uuid_sub()` preserved.
  - 30 / 200 / 1 minute / 1 hour literals present.
  - Rate-check is AND-chained on BOTH branches (regression guard against the single-branch draft).
  - SELECT / UPDATE / DELETE policies are untouched.

### Frontend handling

- [x] **Detect rate-limit RLS reject** — `doSendInsert` (in `TextConsultRoom.tsx`) checks `rateLimitRef.current.isRateLimited` on every non-401 error path. When the local in-window count has hit the cap, the failure is tagged `failureReason: 'rate-limited'` on the optimistic bubble; otherwise it falls through to the existing A6 `'unknown'` failure path. Local mirror is a UX hint only — server-side `check_chat_insert_rate()` is the enforcer.
- [x] **`'rate-limited'` send-button state** — extended `SendButtonState` union + `deriveSendButtonState({ rateLimited })` in `TextConsultRoom.tsx`. Button renders disabled with a clock icon + `{N}s` countdown label + `Wait {N}s before sending again` tooltip; precedence rules (char-cap > sending > rate-limited > queued > ready) verified by the 5 new branch tests in `sendButtonState.test.ts`.
- [x] **Cooldown derivation** — `useRateLimitCooldown` (in `frontend/lib/text/use-rate-limit-cooldown.ts`) maintains a rolling 60s window of own-send timestamps and exposes `cooldownSecondsRemaining` computed from the oldest entry; per-second tick keeps the display fresh; 9 tests in `frontend/lib/text/__tests__/use-rate-limit-cooldown.test.ts` cover trip threshold, countdown, sliding window, custom cap, reset, and the documented constants.
- [x] **Toast on first hit** — `"You're sending too fast — wait a few seconds."` shown via the existing `actionToast` surface with a 5s timeout (longer than the 4s `flashActionToast` default to match the spec).
- [x] **No retry-spam-loop** — `retryFailed` early-returns with a `Wait {N}s before retrying.` toast when the bubble is `'rate-limited'` AND the cooldown is still active; the bubble itself stays red-bordered with `Rate limit hit` label (vs the legacy `Failed to send`) until the user retries past the cooldown. `markMessageRetrying` clears `failureReason` so the retried bubble starts clean — covered by the new `failed-message-mutations.test.ts` test.
- [x] **Three-host parity** — the hook + button derivation are pure host-agnostic JS; no per-layout branch needed. (Composer is hidden in `mode='readonly'`, where the hook is mounted but recordOwnSend is never invoked.)
- [x] **`mode='readonly'`** — composer is gone; rate-limit logic is dormant (hook stays mounted but never tracks any sends because the send path is gated by `mode === 'live'`).
- [x] Frontend type-check + lint clean (touched files only; pre-existing errors in unrelated `PreviousRxSideSheet`, `VoiceConsultRoom`, etc. are out of scope). All 25 tests across the three changed test files pass; the broader text-lib test suite (18 files, 115 tests) is green.

---

## Out of scope

- **Server-side rate limit on read operations.** Read volume is bounded by message-list size; no concern.
- **Per-account rate limit across sessions.** Per-session is sufficient.
- **Telemetry on rate-limit events.** D4's quality table doesn't capture this; could add a sample dimension later. Out of v1.
- **Configurable rate per doctor / per practice.** Hard-coded to 30/min, 200/hour.
- **Distinguishing reaction-INSERTs from message-INSERTs in the rate.** Only `consultation_messages` rate-limited; `consultation_message_reactions` is separate (and B5 is unrate-limited because reactions are rare and self-throttle by user behavior).

---

## Files expected to touch

**Backend:**

- `backend/migrations/110_consultation_messages_rate_limit.sql` — **new** (~200 LOC including header doctrine + rollback runbook).
- `backend/tests/unit/migrations/consultation-messages-rate-limit-migration.test.ts` — **new** (~140 LOC, 13 tests).

**Frontend:**

- `frontend/components/consultation/TextConsultRoom.tsx` — **extended** (`useRateLimitCooldown` mount; `recordOwnSend` on ack; rate-limit detection on RLS failure path; `rate-limited` send-state branch; cooldown countdown on button; 5s toast; retry guard).
- `frontend/components/consultation/MessageBubble.tsx` — **extended** (failed-bubble label switches to `Rate limit hit` when `failureReason === 'rate-limited'`; new `data-failure-reason` attribute for tests).
- `frontend/lib/text/use-rate-limit-cooldown.ts` — **new** (~130 LOC; hook + exported `RATE_LIMIT_PER_MINUTE_CAP` + `RATE_LIMIT_WINDOW_MS` constants).
- `frontend/lib/text/__tests__/use-rate-limit-cooldown.test.ts` — **new** (~180 LOC, 9 tests).
- `frontend/lib/text/types.ts` — **extended** (added `failureReason?: 'rate-limited' | 'unknown'` to `ConsultationMessage`).
- `frontend/lib/text/failed-message-mutations.ts` — **extended** (`RetryableMessage` carries `failureReason`; `markMessageRetrying` clears it on retry).
- `frontend/lib/text/__tests__/failed-message-mutations.test.ts` — **extended** (+1 test for failureReason clearing).
- `frontend/components/consultation/__tests__/sendButtonState.test.ts` — **extended** (+5 tests for the rate-limited branch + precedence rules).

**No A3 extraction file** (`sendButtonState.ts`) was created — the state machine remains co-located with `TextConsultRoom.tsx` as A3 originally landed; the new branch was added inline to the existing `deriveSendButtonState` export.

**No new Supabase Storage policies; the bucket is unaffected.**

---

## Notes / open decisions

1. **`SECURITY DEFINER` on the function** — required so the function can read `consultation_messages` regardless of the calling RLS context. With `SET search_path = public` to prevent search-path attacks. Standard pattern.
2. **Function performance** — two COUNT queries per INSERT against an indexed `(session_id, created_at)`. Each is ms-level. Even at 30 inserts/min/session, total overhead is negligible.
3. **Why not store the count in `consultation_sessions.message_counts` JSONB** — the source plan suggests extending the JSONB; rejected because it adds write pressure on the parent row and complicates concurrent updates. Counting on the table is cheap and accurate.
4. **Frontend can't perfectly attribute reject reason** — acceptable; the local-count heuristic gives the right UX 99% of the time. If a session ends mid-burst, the user sees "rate limited" instead of "session ended" — minor.
5. **Rate-limit IS NOT a hard security boundary** — a sufficiently motivated attacker with multiple JWTs (e.g. across multiple patient accounts) can still flood. v1 acceptable; future hardening could add a per-IP rate-limit at the API gateway.
6. **Reactions UNCOUNTED** — reactions go through a separate table; rate-limit only on `consultation_messages`. Document for future-proofing.

---

## References

- **Batch plan:** [plan-text-consult-selected-features.md § Sub-batch D](../Plans/plan-text-consult-selected-features.md)
- **Source item:** [T5 §T5.34](../../../../Product%20plans/text-consult/plan-t5-text-reliability-safety.md)
- **Foundation invariant — `safe_uuid_sub()`:** [plan-f04](../../../../Product%20plans/text-consult/plan-f04-text-foundation-status.md).
- **Coordinates with:** [task-text-A3](./task-text-A3-send-button-states.md), [task-text-A6](./task-text-A6-failed-send-retry-polish.md).

---

**Owner:** TBD
**Created:** 2026-04-28
**Completed:** 2026-05-24
**Status:** ✅ Done. Migration 110, server-side `check_chat_insert_rate()` (SECURITY DEFINER, STABLE, search_path-pinned), dual-branch RLS rewrite (patient + doctor) with rate-check AND'd onto both branches, frontend `useRateLimitCooldown` + `'rate-limited'` send-button state + countdown UI + 5s toast + retry guard + `Rate limit hit` failed-bubble label. 13 backend migration tests + 9 hook tests + 6 (1 prior + 5 new) sendButtonState branch tests + 1 new failed-message-mutations test — all passing.
