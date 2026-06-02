# Task text-A4: Day separators in message list (Today / Yesterday / "Mon, 28 Apr")

## 28 April 2026 — Batch [Text consult selected features](../Plans/plan-text-consult-selected-features.md) — Sub-batch A (T1 quick wins)

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-text.md](./EXECUTION-ORDER-text.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

Clinical chats stretch across days more often than people expect — a patient asks a follow-up question 36 hours after the consult ended (Plan F07's `mode='readonly'` archive view also wants this), or an asynchronous patient reply lands the morning after a doctor's evening message. Today the message list reads as one undifferentiated stream; the only date hint is the existing per-bubble timestamp, which is the wrong granularity for "when did the conversation move from one day to another?"

This task injects a centred, low-contrast separator label between bubble groups whenever the calendar date changes:

```
[bubble] [bubble]
─────── Today ───────
[bubble] [bubble]
```

Labels:
- `Today` — same calendar day as `Date.now()` in the user's timezone.
- `Yesterday` — exactly one calendar day ago.
- `Mon, 28 Apr` — anything older. Format MUST be `en-GB` to avoid the hydration mismatch documented in [the deferred date-locale sweep](../../../../deferred/deferred-date-locale-hydration-sweep-2026-04-28.md). Do NOT pass `undefined` to `toLocaleDateString` — that's the bug that caused the original incident.

**Estimated time:** ~2 hours.

**Status:** Done.

**Depends on:** None. Independent of every other Sub-batch A task. Will be touched again by [task-text-D3](./task-text-D3-message-list-virtualization.md) (virtualization needs to render separators as sentinel rows).

**Source plan:** [T1 §T1.4](../../../../Product%20plans/text-consult/plan-t1-text-quick-wins.md)

---

## Acceptance criteria

- [x] **`formatDayLabel(date: Date | string): string` helper added** to a new file `frontend/lib/text/format-day-label.ts`:
  ```ts
  export function formatDayLabel(input: Date | string): string {
    const d = typeof input === 'string' ? new Date(input) : input;
    const today = new Date();
    const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
    const dayDiff = Math.round(
      (startOfDay(today).getTime() - startOfDay(d).getTime()) / 86_400_000,
    );
    if (dayDiff === 0) return 'Today';
    if (dayDiff === 1) return 'Yesterday';
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    //                              ^^^^^ MUST be 'en-GB' — see deferred-date-locale-hydration-sweep-2026-04-28.md
  }
  ```
  Pure function; no React deps; trivially unit-testable.
- [x] **Render-loop integration** — in `TextConsultRoom.tsx`'s message-list render, track `lastRenderedDate: string | null` (YYYY-MM-DD). Before each bubble, compute the bubble's date string. If it differs from `lastRenderedDate`, emit:
  ```tsx
  <div
    className="text-center text-xs text-gray-500 my-3 select-none"
    role="separator"
    aria-label={formatDayLabel(message.createdAt)}
  >
    {formatDayLabel(message.createdAt)}
  </div>
  ```
  Then set `lastRenderedDate` to the bubble's date string.
- [x] **System messages count as boundary triggers too** (a `consult_started` system row from a previous day correctly emits a "Yesterday" separator above it).
- [x] **No hydration mismatch** — server-render and client-render produce the same label. The `'en-GB'` lock is the entire mechanism. Verify with `console.error` listener in browser dev mode (Next.js dev throws on mismatch).
- [x] **Three-host parity** — same render in `standalone`, `panel`, `canvas`.
- [x] **`mode='readonly'`** — separators visible (history view especially benefits from them).
- [x] **Unit test** at `frontend/lib/text/__tests__/format-day-label.test.ts`:
  - Same-day → `'Today'`.
  - 1 day ago → `'Yesterday'`.
  - 5 days ago → matches `/^\w{3}, \d{1,2} \w{3}$/` (e.g. `'Mon, 23 Apr'`).
  - String input round-trips through `new Date(string)`.
- [x] Frontend type-check + lint clean. Manual smoke: in dev, mock `Date.now()` to walk forward 2 days mid-session; verify separators render in correct positions.

---

## Out of scope

- Sticky day-headers (the separator stays pinned to the top of the viewport while scrolling). Nice but a separate task; not in T1.
- Tooltip / hover for the separator showing the full date. The separator is the full date for older days; same-day cases need no tooltip.
- Localisation. `'en-GB'` for everyone in v1; see the deferred locale sweep for the broader plan.
- The repo-wide locale sweep itself. This task fixes ONLY the day-separator surface; the other ~18 sites listed in the deferred sweep are out of scope.

---

## Files expected to touch

**Frontend:**

- `frontend/lib/text/format-day-label.ts` — **new** (~15 LOC).
- `frontend/lib/text/__tests__/format-day-label.test.ts` — **new** (~20 LOC).
- `frontend/components/consultation/TextConsultRoom.tsx` — **extend** (render-loop integration; tracks `lastRenderedDate` across the map).

**No backend, no schema.**

---

## Notes / open decisions

1. **Why `Math.round` and not `Math.floor`** — DST transitions can give `dayDiff` values like `0.96` or `1.04`. `round` is correct; `floor` produces off-by-one on those days.
2. **Why a startOfDay normalisation** — comparing `today.getTime() - d.getTime()` directly fails when the two dates straddle midnight by a few minutes (yesterday's 23:55 vs today's 00:05 would show as 0 days apart). Normalising to local midnight before subtracting fixes it.
3. **Virtualization coordination** — task-text-D3 converts the message list to `react-virtuoso`. Day separators need to render as sentinel rows in the data array (not as render-time inserts), or virtualization will mis-measure heights. Add a `__type: 'separator'` row to the message data array OR use Virtuoso's `groupedRender` API. Decide at D3 PR time; for now, render-time insert is fine.
4. **No need for memoisation.** `formatDayLabel` is fast; the render loop runs once per render and the label string can be re-derived per bubble cheaply.

---

## References

- **Batch plan:** [plan-text-consult-selected-features.md § Sub-batch A](../Plans/plan-text-consult-selected-features.md)
- **Source item:** [T1 §T1.4](../../../../Product%20plans/text-consult/plan-t1-text-quick-wins.md)
- **Locale sweep context:** [deferred-date-locale-hydration-sweep-2026-04-28.md](../../../../deferred/deferred-date-locale-hydration-sweep-2026-04-28.md).
- **Coordinates with:** [task-text-D3](./task-text-D3-message-list-virtualization.md) (separator rendering under virtualization).

---

**Owner:** TBD
**Created:** 2026-04-28
**Status:** Done (2026-05-23).
