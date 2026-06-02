# Task text-A6: Failed-send retry polish (red-bordered bubble; inline retry / discard)

## 28 April 2026 — Batch [Text consult selected features](../Plans/plan-text-consult-selected-features.md) — Sub-batch A (T1 quick wins)

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-text.md](./EXECUTION-ORDER-text.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

When a chat INSERT fails — RLS reject (session ended mid-compose), network drop, signed-URL miss on attachment — today's bubble shows a small "retry" link in red text. It's functional but unfriendly: the bubble looks like a normal message with a stray error word, the user can't tell whether the message was partially sent, and there's no path to discard a failed bubble without opening DevTools.

This task replaces that with an explicit failed-bubble treatment:

```
│ Patient body
│ Failed to send · Retry · Discard      ← inline action row, red text
└─ red left border (subtle, 2 px)
```

The existing `failed` and `retryBody` state already track this; we're swapping the render only.

**Estimated time:** ~3 hours.

**Status:** Done (2026-05-23).

**Depends on:** None. Independent of every other Sub-batch A task.

**Source plan:** [T1 §T1.8](../../../../Product%20plans/text-consult/plan-t1-text-quick-wins.md)

---

## Acceptance criteria

- [x] **Failed-bubble render block** in `TextConsultRoom.tsx` (or in `<MessageBubble>` after B2 extracts; if A6 ships first, in-place; refactor on B2 convergence):
  ```tsx
  <li
    role="listitem"
    className={`message-bubble ${message.failed ? 'border-l-2 border-red-300 pl-2' : ''}`}
    data-failed={message.failed ? 'true' : undefined}
  >
    <div className="message-body">{message.body}</div>
    {message.failed ? (
      <div className="mt-1 flex items-center gap-2 text-xs text-red-700">
        <span>Failed to send</span>
        <button type="button" onClick={() => retryFailed(message.localId)} className="underline">
          Retry
        </button>
        <button type="button" onClick={() => discardFailed(message.localId)} className="underline">
          Discard
        </button>
      </div>
    ) : null}
  </li>
  ```
- [x] **`retryFailed(localId)` reuses the existing optimistic-send path.** Pull `retryBody` from the failed message; call the existing `sendMessage` helper; the bubble re-enters the optimistic queue. **The bubble's position in the list is preserved** — don't re-append; replace in place. Add a short test asserting the array index doesn't change.
- [x] **`discardFailed(localId)` removes the bubble from local state.** No backend call (the row was never persisted). Reuses the existing `mergeMessages` mutation pattern; takes one `localId` and removes it from the local message array.
- [x] **No confirmation dialog on Discard.** Recommendation from the source plan: the message never persisted, the user can always retype, confirmation adds friction. If the user discards by mistake, the body is lost — accept that trade-off.
- [x] **Multiple failed bubbles don't fight each other.** If three sends fail in a row (RLS reject during a session-status race), tapping Retry on the middle one should not re-trigger the other two. Each `localId` is independent.
- [x] **Three-host parity** — same render in `standalone`, `panel`, `canvas`.
- [x] **`mode='readonly'`** — failed bubbles shouldn't exist in readonly (no INSERTs happen), but defensively skip the failed-render branch entirely.
- [x] **Accessibility** — `data-failed="true"` on the `<li>` for screen-reader query selectors; both buttons have proper `type="button"` so they don't accidentally submit a parent form (the composer is a form on some layouts).
- [x] Frontend type-check + lint clean. Manual smoke: simulate an RLS reject (e.g. force-end the session backend-side, then send) → bubble shows red-border + inline action row; tap Retry → bubble re-tries (still fails because session ended) → re-shows failed state; tap Discard → bubble disappears cleanly.

---

## Out of scope

- Server-side error categorization. Today the client gets a generic error; this task doesn't add error-code parsing. If the source of failure was "rate limit" (D5 future state), the existing toast from D5 surfaces it instead.
- "Failed because session ended — view summary?" CTA. Cute but cross-cutting; out of T1.
- Auto-retry with exponential backoff. The user is in control of the retry; auto-retry on RLS reject would loop forever.
- A "show failure reason" tooltip. The reasons are too varied to summarise in a tooltip; the existing console-log path is sufficient for support debugging.

---

## Files expected to touch

**Frontend:**

- `frontend/components/consultation/TextConsultRoom.tsx` — **extend** (failed-bubble render block; `retryFailed` + `discardFailed` handlers if not already present).

**No new files. No backend. No schema.**

---

## Notes / open decisions

1. **`localId` field** — the optimistic message should already have a `localId` (separate from server-assigned `id`) for reconciliation. If it doesn't, this task adds it. Verify in `mergeMessages` that the local→server reconcile keys on `localId`.
2. **Border colour palette** — `border-red-300` (Tailwind 300 weight) is intentional; brighter would scream, darker would hide. If the design system uses a different red, swap.
3. **Coordination with B2 (`<MessageBubble>` extract)** — if A6 ships first, the failed-bubble render lives inline in `TextConsultRoom.tsx`. When B2 extracts the bubble, the failed treatment moves intact. Add a code comment marking the boundary.
4. **No retry counter** ("Failed to send (attempt 3)"). Source plan doesn't ask for it; users have a clear visual signal already.

---

## References

- **Batch plan:** [plan-text-consult-selected-features.md § Sub-batch A](../Plans/plan-text-consult-selected-features.md)
- **Source item:** [T1 §T1.8](../../../../Product%20plans/text-consult/plan-t1-text-quick-wins.md)
- **Refactored by:** [task-text-B2](./task-text-B2-message-bubble-extract.md) (failed-bubble treatment moves into `<MessageBubble>`).

---

**Owner:** TBD
**Created:** 2026-04-28
**Status:** Done (2026-05-23).
