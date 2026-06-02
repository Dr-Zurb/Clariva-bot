# brr-03 — SLA urgency: `SlaCountdown` + queued-age fallback + most-urgent sort + Due<1h count

| Field | Value |
|---|---|
| **Batch** | [Booking review redesign Phase 1 — reskin + SLA](../plan-p1-booking-review-redesign-batch.md) |
| **Wave** | 2 (Lane A) |
| **Depends on** | brr-01 (summary slot, atoms), brr-02 (reskinned rows) |
| **Blocks** | brr-04 |
| **Size** | **M** |
| **Model** | **Auto** |
| **Decision locks** | BR-DL-1, BR-DL-2, BR-DL-3, P1-BRR-4 |

---

## Objective

Render the urgency the backend already computes (R-SLA). These reviews **auto-cancel on a timeout**, and `sla_deadline_at` is fetched today but never shown. In [`ServiceReviewsInbox.tsx`](../../../../../../frontend/components/service-reviews/ServiceReviewsInbox.tsx) + a new atom:

- **`SlaCountdown`** — reads `sla_deadline_at`, renders a live chip ("Due in 38m" / "Due in 4h" / "Overdue 5m"), ticking ~30 s, escalating the `Badge` variant (e.g. `info`/neutral > 1h, `warning` < 1h, `destructive` overdue). Absolute time on hover via `formatDateTime`.
- **Queued-age fallback** — when `sla_deadline_at` is null, show "queued 3h ago" from `created_at` (new small relative-time util; none exists today).
- **Most-urgent sort** — the **Pending** list defaults to soonest-deadline-first; null-deadline rows fall back to queued-age order (older = more urgent). Other tabs keep their resolved-time order.
- **Due < 1h count** — populate the summary-row slot brr-01 created, counting pending rows whose deadline is under 1h (or overdue).

No backend, no new fetch — purely rendering + sorting the rows already on the wire (BR-DL-2 / BR-DL-3).

## Why this task

This is the single highest-value missing signal in the inbox: without it, staff can't tell which reviews are about to silently expire, and the queue is stuck oldest-first. It's "free" because the deadline is already fetched — the only work is a small live-tick component, a sort, and a count. Done after the reskin (brr-01/02), the chip drops cleanly into a reskinned row and the count fills a slot that already exists.

## Files

| File | Change |
|---|---|
| `frontend/components/service-reviews/SlaCountdown.tsx` | **New** — the live countdown chip (deadline → `Badge` + label, ~30 s tick, escalation, overdue). |
| `frontend/lib/relative-time.ts` | **New (small)** — `formatTimeUntil(deadlineIso, nowMs)` → `{ label, urgency }` and `formatAgo(iso, nowMs)` → "3h ago". Pure functions (now passed in) so they're unit-testable; no `toLocale*` (use numeric deltas; absolute strings go through `format-date.ts`). |
| `frontend/components/service-reviews/ServiceReviewsInbox.tsx` | **Edit** — mount `SlaCountdown` (or the queued-age fallback) in the time cell of pending rows; apply the most-urgent pending sort; compute + render the Due<1h count in the summary slot. |
| `frontend/lib/__tests__/relative-time.test.ts` | **New** — threshold + overdue boundary + ago formatting (deterministic via injected `now`). |

> **Determinism:** pass `now` (ms) into the pure formatters so tests don't depend on wall-clock; the component supplies `Date.now()` on each tick. Date *absolute* renders still go through `formatDateTime` (hydration-safe, per `format-date.ts`).

## Implementation sketch

### `relative-time.ts` (pure, testable)

```ts
export type Urgency = "overdue" | "soon" | "later";

/** Time until a deadline, bucketed for SLA escalation. `nowMs` injected for tests. */
export function formatTimeUntil(deadlineIso: string, nowMs: number): { label: string; urgency: Urgency } {
  const t = new Date(deadlineIso).getTime();
  if (Number.isNaN(t)) return { label: "—", urgency: "later" };
  const diffMin = Math.round((t - nowMs) / 60000);
  if (diffMin < 0) return { label: `Overdue ${fmtSpan(-diffMin)}`, urgency: "overdue" };
  return { label: `Due in ${fmtSpan(diffMin)}`, urgency: diffMin <= 60 ? "soon" : "later" };
}

/** "3h ago" / "12m ago" from a past timestamp. */
export function formatAgo(iso: string, nowMs: number): string { /* … */ }

function fmtSpan(min: number): string { /* "38m" / "4h" / "2d" */ }
```

### `SlaCountdown` (live chip)

```tsx
export function SlaCountdown({ deadlineIso }: { deadlineIso: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const { label, urgency } = formatTimeUntil(deadlineIso, now);
  const variant = urgency === "overdue" ? "destructive" : urgency === "soon" ? "warning" : "info";
  return (
    <Badge variant={variant} title={formatDateTime(deadlineIso)} className="tabular-nums">
      <Clock className="mr-1 h-3 w-3" /> {label}
    </Badge>
  );
}
```

> One interval per mounted chip is fine at inbox scale; if row counts grow, a shared ticker is a later optimisation (note it, don't build it now).

### Sort + count (in the inbox)

- Pending sort: by `sla_deadline_at` ascending (soonest first); rows with null deadline sorted after, by `created_at` ascending (older first). Apply only when `activeTab === "pending"`; don't reorder resolved tabs.
- Due<1h count: `pending.filter(r => r.sla_deadline_at && formatTimeUntil(r.sla_deadline_at, Date.now()).urgency !== "later").length`. Render in the summary slot with `tabular-nums`.

## Tests (`relative-time.test.ts`)

- [x] Deadline 38 min out → "Due in 38m", urgency `soon`.
- [x] Deadline 4h out → "Due in 4h", urgency `later`.
- [x] Deadline 5 min past → "Overdue 5m", urgency `overdue`.
- [x] Exactly 60 min → `soon` (boundary inclusive).
- [x] Invalid ISO → "—", `later` (no throw).
- [x] `formatAgo`: 3h ago / 12m ago from injected `now`.

## Acceptance criteria

- [x] Pending rows show a live `SlaCountdown` chip that escalates (`info`→`warning`→`destructive`) and flips to "Overdue" past the deadline.
- [x] Null `sla_deadline_at` shows a queued-age cue ("queued 3h ago") instead, with no layout break.
- [x] Pending list is sorted soonest-deadline-first (null deadlines last, older-first); resolved tabs unchanged.
- [x] The summary row's **Due < 1h** count is accurate and uses `tabular-nums`.
- [x] Absolute deadline shows on hover via `formatDateTime`; no direct `toLocale*` calls added.
- [x] `npx tsc --noEmit` + `npm run lint` clean; `relative-time.test.ts` green.
- [x] No backend / `page.tsx` / match-explain edits; no new fetch.

## Out of scope (explicit)

- Filters / sort controls (Phase 2 / R-FILTERS) — this is a fixed default sort, not a user control.
- Shared/global ticker optimisation — one interval per chip is acceptable at current scale.
- KPIs beyond Pending + Due<1h (resolved/day, avg confidence → analytics, B4.1).

## Decision log

- **Pure formatters with injected `now`:** keeps the SLA math unit-testable and hydration-safe; the component owns the clock.
- **Render-only, no new SLA logic (BR-DL-3):** we display the backend's `sla_deadline_at`; we don't compute or change the timeout.
- **Per-chip interval, not a global ticker:** simplest correct approach at inbox scale; flagged as a later optimisation if row counts grow.

## References

- [`frontend/types/service-staff-review.ts`](../../../../../../frontend/types/service-staff-review.ts) — `sla_deadline_at`, `created_at`.
- [`frontend/lib/format-date.ts`](../../../../../../frontend/lib/format-date.ts) — `formatDateTime` for the absolute hover (the single source for date renders).
- [`frontend/components/service-reviews/ServiceReviewsInbox.tsx`](../../../../../../frontend/components/service-reviews/ServiceReviewsInbox.tsx) — time cell (~445), pending list, summary slot (from brr-01).
- [`frontend/hooks/useDashboardCounts.ts`](../../../../../../frontend/hooks/useDashboardCounts.ts) — the visibility-aware polling pattern (reference for the ~30 s tick cadence; full auto-refresh is Phase 2).
- Batch: [`plan-p1-booking-review-redesign-batch.md`](../plan-p1-booking-review-redesign-batch.md) · Order: [`EXECUTION-ORDER-p1-booking-review-redesign.md`](./EXECUTION-ORDER-p1-booking-review-redesign.md).

---

**Status:** `Done` (2026-05-31).  
**Done when:** acceptance criteria checked; status stamped here.
