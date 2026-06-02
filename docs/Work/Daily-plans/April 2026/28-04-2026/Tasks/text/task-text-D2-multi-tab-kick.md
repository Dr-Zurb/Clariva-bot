# Task text-D2: Multi-tab kick (patient-only; `chat-presence-claim` broadcast; "Take over" CTA)

## 28 April 2026 — Batch [Text consult selected features](../Plans/plan-text-consult-selected-features.md) — Sub-batch D (T5 reliability)

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-text.md](./EXECUTION-ORDER-text.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

Patient opens the consult on their laptop, then opens it again on their phone. Two tabs subscribe to the same Supabase Realtime channel; both can send messages. Result: split-brain composer state, doubled typing indicators, occasional INSERT race conditions where the same logical "user" appears to send two unrelated messages a millisecond apart.

This task lets the **newer tab take over** and explicitly evict the older one with an "Open in another tab" overlay + "Take over" CTA. Patient-only — doctors legitimately use multi-monitor setups (chart on one screen, chat on another) and shouldn't be evicted.

Mechanism: a new `chat-presence-claim` broadcast over the existing presence channel. On consult open, every patient tab broadcasts a `claim` with its tab id + a timestamp. Any tab that receives a `claim` with a NEWER timestamp than its own self-claim flips to "evicted" mode (overlay shows; subscriptions paused; composer hidden).

The evicted tab can "Take over" — broadcast a fresh claim with `now()` to win back the channel.

**Estimated time:** ~6 hours.

**Status:** Done.

**Depends on:** None hard.

**Source plan:** [T5 §T5.29](../../../../Product%20plans/text-consult/plan-t5-text-reliability-safety.md)

---

## Acceptance criteria

- [x] **`useTabPresenceClaim(sessionId, role)` hook** at `frontend/lib/text/use-tab-presence-claim.ts`:
  ```ts
  // Only active when role === 'patient'.
  // Returns { evicted: boolean, takeOver: () => void }
  ```
- [x] **Tab id generation** — `crypto.randomUUID()` on hook init; persisted to `sessionStorage` (so a tab refresh keeps its id).
- [x] **Initial claim broadcast** — on mount + on Realtime channel `'SUBSCRIBED'` event, broadcast `{ tab_id, claimed_at: now() }` on `text-presence:{sessionId}` with event `chat-presence-claim`.
- [x] **Claim receipt handler:**
  ```ts
  channel.on('broadcast', { event: 'chat-presence-claim' }, ({ payload }) => {
    if (payload.tab_id === selfTabId) return;
    if (payload.claimed_at > selfClaimedAt) {
      setEvicted(true);
    }
  });
  ```
- [x] **`takeOver` action** — generates a fresh `claimed_at = now()`, re-broadcasts; sets `evicted = false`. Receiving tab(s) flip to evicted on the new timestamp.
- [x] **Eviction overlay** — when `evicted === true`, render an absolutely-positioned overlay covering the entire `<TextConsultRoom>` (implemented in `TextConsultRoom.tsx` with `data-testid="text-consult-eviction-overlay"`).
- [x] **Subscriptions paused while evicted** — message INSERTs, presence broadcasts, typing indicators all stop firing (or the listeners no-op). Cheapest implementation: keep subscriptions active but ignore incoming events. Cleaner: unsubscribe from channels on evict, resubscribe on take-over. Pick the cleaner option since the primary motivation is to avoid duplicate writes.
- [x] **Composer hidden while evicted** — render the overlay above the composer; the user can't type or send.
- [x] **Doctor side never evicted** — `if (role !== 'patient') return { evicted: false, takeOver: () => {} }` early.
- [x] **Three-host parity** — patient sees evict overlay in `standalone`. `panel` and `canvas` are voice/video room hosts where the patient doesn't reach via direct URL today, so eviction there is unlikely; render the overlay anyway for safety.
- [x] **`mode='readonly'`** — read-only views don't subscribe to presence; eviction never triggers. Skip the hook.
- [x] **Drafts preserved** — the evicted tab's `sessionStorage` (D1) remains. Reopening the tab + taking over restores any unsent draft. Document this interaction in the D1 task.
- [ ] **Manual smoke** — open consult on laptop; open same consult on phone; laptop tab flips to "Open in another tab" within 2 s; tap "Take over" on laptop; phone tab flips to evicted; both tabs are exclusive throughout.

---

## Out of scope

- **Doctor multi-tab kick.** Doctors use multi-monitor; explicitly excluded.
- **Cross-device confirmation** ("Are you sure you want to take over?"). Trust the user; one tap.
- **Presence-of-evicted-self surfacing** ("You're evicted — last seen by Take Over from device X"). Out of scope.
- **Persistence of "this device is the active one" across browser restart.** Each new session starts fresh.
- **Server-side enforcement** of single-tab-per-patient. RLS doesn't have presence semantics; this is a UX guarantee, not a security one. A malicious patient with split tabs would defeat this — that's an irrelevant threat model.

---

## Files expected to touch

**Frontend:**

- `frontend/lib/text/use-tab-presence-claim.ts` — **new** (~70 LOC).
- `frontend/lib/text/__tests__/use-tab-presence-claim.test.ts` — **new** (~80 LOC; mock Realtime channel; assert eviction logic).
- `frontend/components/consultation/TextConsultRoom.tsx` — **extend** (mount hook; render eviction overlay; pause/resume subscriptions on evict/take-over).

**No backend, no schema** (uses existing presence channel).

---

## Notes / open decisions

1. **Why broadcast and not presence-state** — broadcast is fire-and-forget; presence-state is persistent on the channel. We want the LATEST claim to win; broadcast suits that. Use a single timestamp comparison.
2. **Clock-skew risk** — if two tabs have meaningfully different system clocks (rare), the later-claiming tab might have an EARLIER timestamp and be evicted by the earlier tab. Acceptable failure mode; user can tap "Take over".
3. **Tab id persistence in `sessionStorage`** — survives reload of the SAME tab. A new tab gets a new id. Correct.
4. **Performance** — claim broadcasts are rare (once on mount + once on each take-over). No throttling needed.
5. **Overlay z-index** — must be above all other layout elements including the pinned-banner (B7) and any open lightbox (C2). `z-50` should suffice; verify.
6. **Take-over loop** — two patient devices both spamming "Take over" would bounce eviction back and forth. Acceptable degradation; the user will pick one device.
7. **Edge case: doctor on patient consult page (impersonation testing)** — `role !== 'patient'` early-return handles this; doctor accessing `/c/text/...` directly doesn't trip eviction.

---

## References

- **Batch plan:** [plan-text-consult-selected-features.md § Sub-batch D](../Plans/plan-text-consult-selected-features.md)
- **Source item:** [T5 §T5.29](../../../../Product%20plans/text-consult/plan-t5-text-reliability-safety.md)
- **Coordinates with:** [task-text-D1](./task-text-D1-composer-draft-crash-recovery.md) (evicted tab's draft survives in sessionStorage).

---

**Owner:** TBD
**Created:** 2026-04-28
**Status:** Done (2026-05-24). Manual smoke pending.
