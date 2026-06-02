# Task text-A1: Jump-to-latest pill (`<TextChatJumpToLatest>` + unread counter)

## 28 April 2026 — Batch [Text consult selected features](../Plans/plan-text-consult-selected-features.md) — Sub-batch A (T1 quick wins)

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-text.md](./EXECUTION-ORDER-text.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

Today, when a user has scrolled up in `<TextConsultRoom>` and a new message arrives, nothing visually signals it. The chat happily ignores the user's scroll position; the only way they realise they missed something is to scroll back down. Every other modern chat product has a "↓ N new" pill above the composer that appears when (a) `wasAtBottom = false` and (b) ≥1 message arrived since the user scrolled up.

This task ships that pill. The infrastructure is already there: `wasAtBottomRef` and `isAtBottom` exist; the new INSERT subscription handler already checks them when deciding whether to auto-scroll. We're adding a counter that increments on the same condition and a small floating component that consumes it.

**Estimated time:** ~2 hours.

**Status:** Drafted. Pending pickup.

**Depends on:** None (Plan F04 baseline). Independent of every other Sub-batch A task.

**Source plan:** [T1 §T1.1](../../../../Product%20plans/text-consult/plan-t1-text-quick-wins.md)

**Batch plan:** [plan-text-consult-selected-features.md § Sub-batch A](../Plans/plan-text-consult-selected-features.md#sub-batch-a--quick-wins-15-days)

---

## Acceptance criteria

- [ ] **New component `frontend/components/consultation/TextChatJumpToLatest.tsx`** with this contract:
  ```ts
  interface TextChatJumpToLatestProps {
    unreadCount: number;       // count of new messages received while wasAtBottom = false
    onJump: () => void;        // smooth-scroll to bottom + reset unread
  }
  ```
  Renders nothing when `unreadCount === 0`. Renders a floating, centred-bottom pill when `unreadCount > 0`. Pill content: `↓ {unreadCount} new {unreadCount === 1 ? 'message' : 'messages'}`. Tap → calls `onJump`.
- [ ] **`TextConsultRoom.tsx` adds an `unreadSinceScrollUp` state** initialised to 0.
  - Increments by 1 when an INSERT lands AND `wasAtBottomRef.current === false` AND the row is not the user's own optimistic send.
  - Resets to 0 whenever `wasAtBottomRef.current` flips back to `true` (existing scroll-bottom check).
  - Resets to 0 on tap of the pill (via `onJump`).
- [ ] **`onJump` smooth-scrolls** the message-list container to the bottom (reuses the existing `scrollToBottom` helper if present; otherwise add one that calls `messageListRef.current?.scrollTo({ top: scrollHeight, behavior: 'smooth' })`).
- [ ] **Pill is positioned within the message-list area, not the composer.** Floating, not absolute relative to the page. Z-index above message bubbles, below the composer overlay (so an open attachment-preview from B8 wouldn't obscure it).
- [ ] **Visible in all three layouts** (`standalone`, `panel`, `canvas`) — Plan F06 invariant. No per-layout branching.
- [ ] **Hidden when `mode === 'readonly'`** — Plan F07 invariant. Readonly views don't get new INSERTs anyway, but defensively gate the render path so no "0 new" stub renders.
- [ ] **Pill renders within 100 ms** of the new INSERT (visual measurement; no formal test required — flag if perf regresses).
- [ ] Frontend type-check + lint clean. Manual smoke: open standalone in two windows; scroll the second up; have the first send 5 messages; verify pill says "↓ 5 new messages"; tap → scrolls + clears.

---

## Out of scope

- Any change to the INSERT-subscription path beyond the counter increment (no reconnect / retry / RLS work).
- Animations beyond a basic fade-in (200 ms). No spring physics; the pill exists to signal, not to delight.
- Per-message preview in the pill ("from Dr. X"). Counter only — full message context is one tap away.
- Sound / haptic. Notifications are owned by D7 + D6 (Sub-batch D).

---

## Files expected to touch

**Frontend:**

- `frontend/components/consultation/TextChatJumpToLatest.tsx` — **new** (~50 LOC).
- `frontend/components/consultation/TextConsultRoom.tsx` — **extend** (add `unreadSinceScrollUp` state + increment hook + reset path + render the pill).

**No backend, no schema, no DM-copy, no service worker.**

---

## Notes / open decisions

1. **Pill copy** — the source plan says "↓ N new messages". For singular, render "↓ 1 new message" (no leading number-only style). Avoid "1 new" abbreviation; clinical UI tone prefers full words.
2. **Reset on scroll-up vs reset only on tap** — recommendation: reset only on `wasAtBottom → true` transition. If the user scrolls up, scrolls down (clearing), then scrolls up again, the counter starts from 0 again. Matches WhatsApp.
3. **Counter overflow** — at 100+ messages the pill should render `↓ 99+ new messages` to keep width bounded. Cheap to implement; do it now.
4. **Test surface** — no jest test required (component is a leaf with one prop branch); manual smoke is sufficient. Add a snapshot test only if `<TextConsultRoom>` extracts already have snapshot tests in the repo.

---

## References

- **Batch plan:** [plan-text-consult-selected-features.md § Sub-batch A](../Plans/plan-text-consult-selected-features.md)
- **Source item:** [T1 §T1.1](../../../../Product%20plans/text-consult/plan-t1-text-quick-wins.md)
- **Foundation:** [plan-f04](../../../../Product%20plans/text-consult/plan-f04-text-foundation-status.md) — `<TextConsultRoom>` baseline; `wasAtBottomRef` already exists.
- **Three-host parity:** [plan-f06](../../../../Product%20plans/text-consult/plan-f06-companion-text-status.md).

---

**Owner:** TBD
**Created:** 2026-04-28
**Status:** Drafted; ready for pickup.
