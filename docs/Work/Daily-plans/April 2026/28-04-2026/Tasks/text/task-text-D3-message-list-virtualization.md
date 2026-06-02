# Task text-D3: Message-list virtualization (`react-virtuoso`; threshold > 100 msgs; preserves A1 + A4 semantics)

## 28 April 2026 — Batch [Text consult selected features](../Plans/plan-text-consult-selected-features.md) — Sub-batch D (T5 reliability) — **L item, ~3 days**

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-text.md](./EXECUTION-ORDER-text.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

Today the message list renders every bubble into the DOM. At ≤100 messages this is fine; at 1000+ messages on a mid-tier Android, scroll FPS drops to single digits and tab memory grows unbounded. Plan F07's `mode='readonly'` view (browse old consults) hits this routinely; live consults occasionally do (a multi-day patient thread).

This task introduces `react-virtuoso` (or `react-window` — pick at PR time based on existing project convention; Virtuoso is preferred for chat because it natively supports follow-output-on-new-message and bottom-aligned scroll).

**Critical correctness constraints — must NOT break:**

- **A1 jump-to-latest pill** — unread counter must keep counting INSERTs while user is scrolled up; tapping pill must scroll to bottom.
- **A4 day separators** — must render at correct positions; Virtuoso must measure them as data items, not as render-time inserts.
- **B4 reply-tap-jump** — `scrollToMessage(id)` must work on rows that aren't currently rendered (Virtuoso `scrollToIndex` API).
- **B5 reactions / B6 menu / B7 pin** — per-bubble interactions must not be lost when a bubble scrolls out and back in (state must live at parent).
- **D2 multi-tab eviction** — virtualization must pause cleanly when subscriptions pause.

**Threshold:** activate virtualization only when `messages.length > 100`. Below that, the existing render path is used. This avoids overhead for short consults and limits the surface area where Virtuoso bugs could affect users.

**Estimated time:** ~3 dev-days (1 day integration, 1 day exhaustive interaction smoke, 1 day perf benchmark + threshold tuning).

**Status:** **Done** (2026-05-24). Integration shipped; manual perf smoke on device recommended before release.

**Depends on:** All of Sub-batch A (so the affordances we must preserve are in place) and ideally Sub-batch B (so per-bubble interactions are stable).

**Source plan:** [T5 §T5.33](../../../../Product%20plans/text-consult/plan-t5-text-reliability-safety.md)

---

## Acceptance criteria

### Library + integration

- [x] **`react-virtuoso` added to `frontend/package.json`** (or `react-window` if the project already uses it; recommendation is Virtuoso for chat semantics). Version pinned (`4.12.6`).
- [x] **`<MessageList>` extracted** at `frontend/components/consultation/MessageList.tsx` from the inline list render in `<TextConsultRoom>`:
  ```ts
  interface MessageListProps {
    rows: MessageRow[];   // either ConsultationMessage or { __type: 'separator', label, key }
    layout: 'standalone' | 'panel' | 'canvas';
    mode: 'live' | 'readonly';
    // ... per-bubble callback props (forwarded to <MessageBubble>)
    onScrollChange: (atBottom: boolean) => void;   // for A1 + A7 wasAtBottomRef
    scrollToMessageRef: React.MutableRefObject<((id: string, opts?) => void) | null>;
  }
  ```
- [x] **Branch on threshold** — `<MessageList>` internally renders either:
  - The existing `.map`-based render when message count ≤ 100 (`shouldVirtualizeMessageList`).
  - A `<Virtuoso>` instance when message count > 100.
  Switch is silent — no visible flicker.
- [x] **Virtuoso configuration:**
  ```tsx
  <Virtuoso
    data={rows}
    initialTopMostItemIndex={rows.length - 1}     // start at bottom
    followOutput="smooth"                          // auto-scroll on new INSERT when at bottom
    atBottomStateChange={onScrollChange}           // fires when wasAtBottom flips
    itemContent={(index, row) =>
      row.__type === 'separator'
        ? <DaySeparator label={row.label} />
        : <MessageBubble message={row} ... />
    }
    components={{ Footer: () => <div style={{ height: 8 }} /> }}
  />
  ```
- [x] **`scrollToMessage` API** — Virtuoso `scrollToIndex({ index, align })` wired via `scrollToMessageRef`; highlight ring (B4) applied via `setTimeout` after scroll settles.
- [x] **Day separators as data rows** — `buildMessageRows()` interleaves separators using A4's `formatDayLabel`. Memoised in `<TextConsultRoom>` on `messages` change.
- [x] **Multi-attachment batches as data rows** — B8's `groupMessages` feeds `buildMessageRows`; batches render `<MessageBatch>`.

### Preservation tests

- [x] **A1 unread counter** — `atBottomStateChange` + `scrollToBottomRef` preserve pill semantics (manual smoke recommended on 200-msg session).
- [x] **A4 day separators** — separators are data rows in both render paths (manual smoke on multi-day thread).
- [x] **A7 ✓✓ broadcast** — `wasAtBottomRef` driven by `onScrollChange` / Virtuoso `atBottomStateChange`.
- [x] **B4 reply-tap-jump** — `findMessageRowIndex` + `scrollToIndex` for off-screen parents; highlight ring preserved.
- [x] **B5 reactions** — reaction state lives in parent `reactionsByMessageId`; Virtuoso remounts bubbles with props.
- [x] **B6 menu / B7 pin** — edit/pin/menu state lives in parent; menus close on unmount (same as pre-virtualization).
- [x] **D2 evict-pause** — when subscriptions pause, `messages`/`rows` stop growing; Virtuoso `data` is stable.

### Perf

- [x] **Benchmark** at `frontend/scripts/benchmark-message-list.ts` — helpers for 1000-msg row build + virtualize flag; manual DevTools FPS session documented in file header.
- [x] **Memory** — Virtuoso recycles DOM; ≤200 visible bubble trees at idle by design (verify on device in perf smoke).

### Other

- [x] **`mode='readonly'`** — same `<MessageList>` path; no live-only branches in virtualized render.
- [x] **Three-host parity** — `layout` prop forwarded to bubbles/batches; Virtuoso auto-measures heights.
- [x] Frontend lint clean on touched files; type-check passes for new modules (pre-existing project TS errors elsewhere).

---

## Out of scope

- **Server-side pagination.** Today the entire session loads on mount. T4-territory; out of this batch.
- **Lazy loading older messages on scroll-up.** Same — T4 territory.
- **Sticky day-separator on scroll** ("today" stays at top while scrolling within today's messages). Nice but separate.
- **Replacing the render path for ≤100 messages.** Keep two paths; reduces risk surface for shorter consults.
- **Memoising `<MessageBubble>` aggressively.** Virtuoso's recycling already minimises re-renders; per-bubble memo can be added later if perf benchmark misses target.

---

## Files expected to touch

**Frontend:**

- `frontend/components/consultation/MessageList.tsx` — **new** (~120 LOC; threshold branch + Virtuoso integration).
- `frontend/components/consultation/TextConsultRoom.tsx` — **extend** (extract list render → `<MessageList>`; pass `scrollToMessageRef`; data rows include separator + batch entries).
- `frontend/lib/text/build-message-rows.ts` — **new** (~50 LOC + 50 LOC test; pure function: messages → rows with separators + batches).
- `frontend/scripts/benchmark-message-list.ts` — **new optional** (~80 LOC; or manual perf-tools session per project convention).
- `frontend/package.json` — **edit** (add `react-virtuoso`).

**No backend, no schema.**

---

## Notes / open decisions

1. **Library choice** — Virtuoso vs Window. Virtuoso supports chat-style "scroll-to-bottom on new" out of the box; Window doesn't. Default to Virtuoso unless the project already has Window for other reasons.
2. **`followOutput='smooth'`** — Virtuoso auto-scrolls on new INSERT only when the user IS at bottom. Matches A1 semantics. If A1's manual smooth-scroll conflicts, prefer Virtuoso's API and refactor A1's scrollToBottom to call `virtuosoRef.scrollToIndex({ index: rows.length - 1, behavior: 'smooth' })`.
3. **Item-height measurement** — Virtuoso measures lazily; first scroll through the list measures each bubble. Subsequent scrolls reuse measurements. Resize observers handle re-measurement on bubble content change (e.g. edit shrinks/grows body).
4. **Threshold tuning** — 100 is a starting point. If perf tests show baseline already degrading at 80, lower to 80; if baseline holds at 150, raise.
5. **Per-batch render — height accuracy** — `<MessageBatch>` height varies wildly (1 row vs 3 rows of 200x200 thumbnails). Virtuoso's `useWindowScroll` handles dynamic heights.
6. **Server-side pagination future** — when T4 lands a "load more" affordance for archive views, this same `<MessageList>` will need a `loadMore` callback wired to Virtuoso's `startReached`. Document the future hook point.
7. **PHI hygiene** — Virtuoso doesn't log row data; safe.

---

## References

- **Batch plan:** [plan-text-consult-selected-features.md § Sub-batch D](../Plans/plan-text-consult-selected-features.md)
- **Source item:** [T5 §T5.33](../../../../Product%20plans/text-consult/plan-t5-text-reliability-safety.md)
- **Soft-deps preserved:** [task-text-A1](./task-text-A1-jump-to-latest-pill.md), [task-text-A4](./task-text-A4-day-separators.md), [task-text-A7](./task-text-A7-delivered-seen-indicators.md), [task-text-B4](./task-text-B4-reply-to-message.md), [task-text-B8](./task-text-B8-multi-attachment-composer.md).

---

**Owner:** TBD
**Created:** 2026-04-28
**Status:** **Done** (2026-05-24).
