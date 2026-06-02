# Task text-A7: Delivered ✓ / Seen ✓✓ indicators (presence-derived `viewed-bottom` broadcast)

## 28 April 2026 — Batch [Text consult selected features](../Plans/plan-text-consult-selected-features.md) — Sub-batch A (T1 quick wins) — **last in A**

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-text.md](./EXECUTION-ORDER-text.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

The single largest "feels MVP" giveaway today: own messages have no acknowledgement signal. The user sends, the bubble appears, and they have no idea whether the counterparty even loaded the chat. WhatsApp's ✓ / ✓✓ pattern is the universal vocabulary; this task brings it to text-consult.

Two derivations, both from existing presence + INSERT data — no new backend:

- **Delivered ✓** — implicit. As soon as the optimistic bubble reconciles with the server-acked id (existing `mergeMessages` flow), render a single ✓. On `failed` (A6), no ✓ ever appears. Pure render change.
- **Seen ✓✓** — extend the existing `text-presence:{sessionId}` channel with a `viewed-bottom` broadcast. Each side broadcasts `{ user_id, at: ISO }` when ALL of:
  1. presence is `online`,
  2. tab is foregrounded (`document.visibilityState === 'visible'`),
  3. scrolled to bottom (`wasAtBottomRef.current === true`).

  On receipt, mark all of THIS-side's messages with `createdAt <= at` as `seen = true`. Render: ✓ → ✓✓ (blue).

This is **last in Sub-batch A** because it touches the presence channel — riskier than the other six items combined. Ship the rest first, verify presence is healthy, then add this.

**Estimated time:** ~4 hours.

**Status:** Done.

**Depends on:** None hard, but **soft-blocks on A1 / A2 / A3 / A4 / A5 / A6 having shipped** so this PR is the only one touching `<TextConsultRoom>` for a clean diff. Reset on `wasAtBottom → true` transition (A1's reset path) gets reused here.

**Source plan:** [T1 §T1.5](../../../../Product%20plans/text-consult/plan-t1-text-quick-wins.md)

---

## Acceptance criteria

- [x] **Per-message `seen: boolean` derived state** — added to the local message representation (not persisted). Defaults `false`. Set to `true` only by the broadcast handler below.
- [x] **Delivered ✓ render** — own messages with a server-assigned `id` and no `failed` flag get a single ✓ at the bottom-right of the bubble. CSS: `text-gray-500 text-xs ml-1`. No animation.
- [x] **Seen ✓✓ render** — own messages with `seen === true` get the double-tick in `text-blue-500`. Same position; replaces the single ✓.
- [x] **`viewed-bottom` broadcast** added to the existing presence channel:
  ```ts
  // Sender side — broadcast on transitions:
  //   - presence becomes 'online' AND visible AND at-bottom → broadcast { user_id, at: lastMessageCreatedAt }
  //   - tab becomes visible AND online AND at-bottom → same
  //   - scroll reaches bottom (wasAtBottom flips false → true) AND visible AND online → same
  //   - new INSERT lands AND we're already at-bottom + visible + online → same (use the new message's createdAt)
  //
  // Throttle: max 1 broadcast / 500ms / sender (don't flood on rapid INSERT bursts).
  client.channel(`text-presence:${sessionId}`).send({
    type: 'broadcast',
    event: 'viewed-bottom',
    payload: { user_id: currentUserId, at: lastVisibleMessageCreatedAt },
  });
  ```
- [x] **`viewed-bottom` receive handler:**
  ```ts
  client.channel(`text-presence:${sessionId}`).on('broadcast', { event: 'viewed-bottom' }, (msg) => {
    const { user_id, at } = msg.payload;
    if (user_id === currentUserId) return;        // ignore own loopback
    setMessages((prev) =>
      prev.map((m) =>
        m.sender_id === currentUserId && m.created_at <= at && !m.seen
          ? { ...m, seen: true }
          : m,
      ),
    );
  });
  ```
- [x] **Honesty cleanup** — when the local tab loses visibility OR scrolls up, broadcast `viewed-bottom: { user_id, at: null }` so the counterparty stops advancing seen state. The receive handler treats `at: null` as a no-op (don't un-seen messages).
- [x] **Seen state is local-only.** Never persisted to DB; on reconnect, advances anew from the next presence sync. Acceptable trade-off (matches WhatsApp behaviour).
- [x] **No new RLS, no new schema, no new endpoint.** All derivation client-side.
- [x] **Three-host parity** — works in `standalone`, `panel`, `canvas`. Verify the canvas-layout's narrow bubble still has room for ✓✓ on the right.
- [x] **`mode='readonly'`** — neither broadcast nor handler runs in readonly (presence isn't subscribed); ticks render based on whatever `seen` state was last persisted (which is `false` for everything since it's local-only — readonly correctly shows no ticks at all).
- [x] Frontend type-check + lint clean. Manual smoke (two windows): window 1 sends 3 messages with window 2 hidden → ✓ on all 3; switch to window 2, scroll to bottom → all 3 flip to ✓✓ within 1 s.

---

## Out of scope

- Per-message read receipts persisted to DB. The local-only model is sufficient for v1; persisting requires a new migration + RLS work + privacy decision (does the patient know the doctor read their message at 3am?).
- Group-chat semantics. Always 2-party.
- "Last seen" timestamp display. Out of scope for T1.
- Push-notification suppression based on seen state. Owned by D6c (Sub-batch D).

---

## Files expected to touch

**Frontend:**

- `frontend/components/consultation/TextConsultRoom.tsx` — **extend** (own-message `<MessageStatus>` render; `viewed-bottom` broadcast + receive handlers; throttle helper).

**Optional small extract** if the status render gets noisy:

- `frontend/components/consultation/MessageStatus.tsx` — **new** (~20 LOC; renders ✓ / ✓✓ based on a single `status` prop). Extract only if useful.

**No backend, no schema.**

---

## Notes / open decisions

1. **Strictness of "scrolled to bottom"** — the source plan recommends "reset on scroll-up" (matches WhatsApp). Do that: when the user scrolls away from bottom, the next `viewed-bottom` broadcast doesn't fire until they scroll back.
2. **Throttling** — 500 ms is the minimum. Without throttle, scrolling through a long list could fire dozens of broadcasts a second. The presence channel handles burst, but it's polite to limit.
3. **Tab-becomes-visible event** — listen to `document.addEventListener('visibilitychange', ...)`. The existing `hiddenAtRef` infrastructure already tracks this; reuse it.
4. **Edge case: presence-channel reconnect** — when the channel reconnects mid-session, re-broadcast `viewed-bottom` if the local conditions hold (visible + online + at-bottom). The existing reconnect path is the place to add this.
5. **"Group sent before I scroll up" interaction** — if I (sender) send 5 messages, and the receiver opens the tab AFTER my 4th message but BEFORE my 5th, my 4 should flip to ✓✓ and my 5th to ✓ only. The `at: lastVisibleMessageCreatedAt` semantics handle this naturally.
6. **Why broadcast and not presence-state** — broadcasts are ephemeral (no persistence overhead) and target the same channel; presence-state would persist `viewed-bottom` in the channel state and make every presence sync replay it. Broadcast is the right primitive.

---

## References

- **Batch plan:** [plan-text-consult-selected-features.md § Sub-batch A](../Plans/plan-text-consult-selected-features.md)
- **Source item:** [T1 §T1.5](../../../../Product%20plans/text-consult/plan-t1-text-quick-wins.md)
- **Existing presence channel:** Plan F04 § Presence (`text-presence:{sessionId}` baseline).
- **Coordinates with:** [task-text-A1](./task-text-A1-jump-to-latest-pill.md) (`wasAtBottomRef` is the shared scroll-position source of truth).

---

**Owner:** TBD
**Created:** 2026-04-28
**Status:** Done (2026-05-23).
