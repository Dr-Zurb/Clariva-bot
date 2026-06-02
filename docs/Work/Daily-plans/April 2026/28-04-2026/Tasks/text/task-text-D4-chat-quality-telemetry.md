# Task text-D4: Chat quality telemetry (`text_chat_quality` migration + ingest + sampler + doctor-side badge)

## 28 April 2026 — Batch [Text consult selected features](../Plans/plan-text-consult-selected-features.md) — Sub-batch D (T5 reliability)

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-text.md](./EXECUTION-ORDER-text.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

Today we have no visibility into chat quality. Doctors complain "the chat felt slow" — we have no objective signal whether it actually was. This task ships a vertical slice: a small `text_chat_quality` table, a frontend sampler that periodically posts the per-side metrics, a backend ingest endpoint, and a doctor-side "Connection: Excellent / Fair / Poor" badge derived from recent samples.

**Metrics tracked per sample (one POST every 30 s, per side):**
- `roundtrip_p95_ms` — local-only optimistic-send → server-INSERT-ack RTT, p95 over the sample window.
- `realtime_reconnects` — count of channel reconnects in the window.
- `presence_flaps` — count of presence `online`↔`offline` transitions in the window.
- `messages_in_window` — context (a window with 0 messages can have inflated p95 from a single outlier).

**Doctor badge derivation:**
- **Excellent** — `p95 < 500 ms AND reconnects = 0 AND flaps ≤ 1`.
- **Fair** — `p95 < 2000 ms AND reconnects ≤ 1 AND flaps ≤ 3`.
- **Poor** — anything worse.

Patient side has no badge — too noisy and unhelpful for them; they'd just panic.

**Estimated time:** ~7 hours (migration + backend ingest + frontend sampler + UI badge + tests).

**Status:** Done (2026-05-24).

**Depends on:** None hard.

**Source plan:** [T5 §T5.35](../../../../Product%20plans/text-consult/plan-t5-text-reliability-safety.md)

---

## Acceptance criteria

### Migration

- [x] **Migration `108_text_chat_quality.sql`** (next free after 107; 084 was taken by snapshot RLS):
  ```sql
  CREATE TABLE IF NOT EXISTS text_chat_quality (
    id                 BIGSERIAL    PRIMARY KEY,
    session_id         UUID         NOT NULL REFERENCES consultation_sessions(id) ON DELETE CASCADE,
    sender_id          UUID         NOT NULL,
    sender_role        TEXT         NOT NULL CHECK (sender_role IN ('doctor', 'patient')),
    sample_at          TIMESTAMPTZ  NOT NULL,
    roundtrip_p95_ms   INTEGER,
    realtime_reconnects INTEGER     NOT NULL DEFAULT 0,
    presence_flaps     INTEGER      NOT NULL DEFAULT 0,
    messages_in_window INTEGER      NOT NULL DEFAULT 0,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS idx_text_chat_quality_session_time
    ON text_chat_quality (session_id, sample_at DESC);

  ALTER TABLE text_chat_quality ENABLE ROW LEVEL SECURITY;

  -- INSERT: only via service role (backend ingest endpoint). No client-direct insert.
  -- (No INSERT policy → effectively service-role-only by default RLS.)

  -- SELECT: only the doctor on the session (patient-side never reads this table).
  CREATE POLICY text_chat_quality_select_doctor
    ON text_chat_quality FOR SELECT
    USING (
      session_id IN (
        SELECT id FROM consultation_sessions
        WHERE doctor_id = public.safe_uuid_sub()
      )
    );
  ```
  Idempotent guards consistent with B1's pattern.
- [x] **Reverse migration documented** in trailing comment.
- [x] **Content-sanity test** at `backend/tests/unit/migrations/text-chat-quality-migration.test.ts` pinning load-bearing clauses (`safe_uuid_sub()`, no client-INSERT policy, doctor-only SELECT).

### Backend ingest

- [x] **`POST /api/v1/consultation/:sessionId/text-quality-sample` endpoint** in `backend/src/controllers/text-consult-quality-controller.ts`:
  - Body: `{ session_id, roundtrip_p95_ms, realtime_reconnects, presence_flaps, messages_in_window }`.
  - Auth: HMAC consultation token (patient) OR doctor JWT (doctor) — reuse existing `requireConsultationParticipant` middleware.
  - Validates the session id matches the auth principal.
  - Inserts via service-role client (bypasses RLS by design).
  - Returns `204 No Content` on success.
- [x] **Rate-limit** — 1 sample per 25 s per (session, sender) — in-memory map in `text-chat-quality-service.ts` (documented single-instance v1 limitation).
- [x] **Endpoint registered** in `backend/src/routes/api/v1/consultation.ts`.
- [x] **Unit tests** at `backend/tests/unit/controllers/text-consult-quality-controller.test.ts` + `backend/tests/unit/services/text-chat-quality-service.test.ts` (happy-path 204, missing auth, rate-limit, session_id mismatch).

### Frontend sampler

- [x] **`useChatQualitySampler(sessionId, role)` hook** at `frontend/lib/text/use-chat-quality-sampler.ts`:
  - Internally tracks: rolling window (30 s) of optimistic-send → server-ack RTTs, reconnect events, presence-flap events, messages-in-window count.
  - On every 30 s tick, computes p95 over the window and posts to `/api/text-consult/quality-sample`. Resets counters after post.
  - Pauses when tab hidden (`document.visibilityState !== 'visible'`); resumes on visibility-change.
  - PHI-safe — sample never contains body, sender_role string only, no message ids.
- [x] **`<TextConsultRoom>` mounts the hook** for both doctor and patient. Hook on its own provides no UI; just posts samples.
- [x] **RTT tracking** — optimistic send uses `performance.now()`; server-ack via Realtime merge + INSERT success path. p95 derived each 30s tick.
- [x] **Reconnect / flap event sources** — INSERT channel `CHANNEL_ERROR` / `CLOSED`; counterparty presence online↔offline transitions.

### Doctor-side badge

- [x] **`<ConnectionQualityBadge>` new component** at `frontend/components/consultation/ConnectionQualityBadge.tsx`:
  ```ts
  // Renders for doctor only. Reads recent samples (last 5 minutes) for the session
  // via supabase.from('text_chat_quality').select(...).eq('session_id', sessionId)
  // .gt('sample_at', fiveMinutesAgo).order('sample_at', { ascending: false }).limit(10)
  ```
  Derives Excellent / Fair / Poor from the most-recent sample; renders a small color-coded pill ("● Excellent" green, "● Fair" yellow, "● Poor" red) at the top of `<TextConsultRoom>` next to the counterparty name.
- [x] **Realtime subscription on `text_chat_quality`** — INSERT subscription + 30s poll fallback.
- [x] **Patient never renders the badge** — `if (currentUserRole !== 'doctor') return null` early.
- [x] **`mode='readonly'`** — badge doesn't render (live signal only).
- [x] **Three-host parity** — badge in header (`standalone` / `canvas`) + slim bar (`panel`) for doctor.
- [x] Unit tests pass (`chat-quality-utils`, `use-chat-quality-sampler`). Manual smoke (Slow 3G → Fair/Poor) still recommended on a live session.

---

## Out of scope

- **Patient-side QoS surface.** Doctor-only.
- **Per-message QoS attribution.** Sample-level only.
- **Long-window QoS aggregation** (per-doctor weekly average). Out of scope; raw table is enough for now.
- **Alerting / paging on sustained Poor.** Out of scope; humans monitor.
- **Per-network-type breakdown** (WiFi vs 4G). Out of scope.

---

## Files expected to touch

**Backend:**

- `backend/migrations/084_text_chat_quality.sql` — **new** (~50 LOC).
- `backend/tests/unit/migrations/text-chat-quality-migration.test.ts` — **new** (~30 LOC).
- `backend/src/controllers/text-consult-quality-controller.ts` — **new** (~80 LOC).
- `backend/src/routes/text-consult.ts` — **edit** (register endpoint).
- `backend/tests/unit/controllers/text-consult-quality-controller.test.ts` — **new** (~80 LOC).

**Frontend:**

- `frontend/lib/text/use-chat-quality-sampler.ts` — **new** (~120 LOC).
- `frontend/lib/text/__tests__/use-chat-quality-sampler.test.ts` — **new** (~80 LOC).
- `frontend/components/consultation/ConnectionQualityBadge.tsx` — **new** (~80 LOC).
- `frontend/components/consultation/TextConsultRoom.tsx` — **extend** (mount sampler hook for both roles; mount badge for doctor only).

---

## Notes / open decisions

1. **Why service-role insert instead of client RLS-allowed insert** — patient JWTs already deal with `safe_uuid_sub()`; service-role insert avoids a third RLS branch and keeps the rate-limit at the controller layer.
2. **Why 30 s window** — short enough to feel responsive, long enough to gather a meaningful p95. Tune later if signal is too noisy.
3. **PHI in samples** — none. The table contains no body, no message ids, only counts and aggregates.
4. **Realtime publication ADD** — include `text_chat_quality` in the publication for live badge updates. Use the same DO-block guard pattern as B1.
5. **Sampler clock-skew** — uses `performance.now()` for RTT (monotonic) and `Date.now()` for `sample_at`. Mixing OK for sample-level granularity.
6. **Backend rate-limit** — per-session/sender 25 s in-memory; if backend horizontally scales later, move to Redis. Document the limitation in the controller comment.

---

## References

- **Batch plan:** [plan-text-consult-selected-features.md § Sub-batch D](../Plans/plan-text-consult-selected-features.md)
- **Source item:** [T5 §T5.35](../../../../Product%20plans/text-consult/plan-t5-text-reliability-safety.md)
- **Foundation invariant — `safe_uuid_sub()`:** [plan-f04](../../../../Product%20plans/text-consult/plan-f04-text-foundation-status.md).

---

**Owner:** TBD
**Created:** 2026-04-28
**Status:** Done (2026-05-24).
