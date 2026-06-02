# brr-06 — Visibility-aware auto-refresh + "N new" pill

| Field | Value |
|---|---|
| **Batch** | [Booking review redesign Phase 2 — workflow](../plan-p2-booking-review-workflow-batch.md) |
| **Wave** | 2 (Lane A — serial after brr-05) |
| **Depends on** | brr-05 |
| **Blocks** | brr-09 |
| **Size** | **M** |
| **Model** | **Auto** |
| **Decision locks** | BR-DL-2, BR-DL-5, P2-BRR-4 |

---

## Objective

Make the inbox keep itself current without a manual Refresh and without yanking the list under the cursor. In [`ServiceReviewsInbox.tsx`](../../../../../../frontend/components/service-reviews/ServiceReviewsInbox.tsx):

- **Poll** `getServiceStaffReviews(activeTab)` every 30 s, **visibility-aware** (pause while `document.hidden`, refetch on focus restore), **stale-while-revalidate** — reusing the exact pattern in [`useDashboardCounts`](../../../../../../frontend/hooks/useDashboardCounts.ts).
- **"N new" pill** for the **Pending** tab: new pending rows are **not** spliced live; a non-disruptive pill ("3 new") appears and **merges + re-sorts** on click (P2-BRR-4). Resolved tabs may refresh in place (no destructive reorder).
- **Pause** polling while a dialog is open **or** a brr-05 deferred-commit window is in flight, so a refetch can't clobber an in-progress action; resume after.

No backend, no new endpoint — same `getServiceStaffReviews` read (BR-DL-2).

## Why this task

It's an inbox; staff leave it open. Without auto-refresh they work off a stale list and must remember to click Refresh; with a naive auto-replace, the list reshuffles under their cursor mid-decision. The "N new" pill is the well-known fix (Gmail / Linear): stay fresh, but only move the list when the user asks. Reusing the proven `useDashboardCounts` polling shape keeps this low-risk.

## Files

| File | Change |
|---|---|
| `frontend/lib/service-reviews/useReviewsPolling.ts` | **New** — a small hook wrapping the `useDashboardCounts` polling pattern (interval, `visibilitychange`, focus refetch, stale-while-revalidate) parameterised for `getServiceStaffReviews(tab)`; exposes the latest fetched rows + a `paused` input. |
| `frontend/components/service-reviews/ServiceReviewsInbox.tsx` | **Edit** — consume the polling hook; diff incoming pending ids vs current to compute "N new"; render the pill; merge on click; pause while `dialog !== null` or `pendingCommits` non-empty. |

> **Reuse, don't reinvent:** the visibility + interval + stale-while-revalidate logic already exists in `useDashboardCounts` — mirror it. Don't write a second polling idiom.

## Implementation sketch

### Pause + merge model

```tsx
const polling = useReviewsPolling({
  token,
  tab: activeTab,
  intervalMs: 30_000,
  paused: dialog !== null || pendingCommits.current.size > 0,
});

// New pending detection (pending tab only):
const incoming = polling.rows;                       // latest server snapshot for activeTab
const newPendingIds = useMemo(
  () => (isPendingTab ? incoming.filter((r) => !reviews.some((x) => x.id === r.id)) : []),
  [incoming, reviews, isPendingTab],
);

// Pill → merge:
function mergeNew() {
  setReviews(incoming);   // displayReviews re-sorts via sortPendingByUrgency
  setDataTab(activeTab);
}
```

- The pill renders above the table when `newPendingIds.length > 0`: a `Button variant="outline" size="sm"` "{n} new" with an arrow/refresh icon.
- **Resolved tabs:** apply the freshest snapshot in place (these are append-mostly and not urgency-sorted), or show the pill too if simpler — either is acceptable; pending is the one that must not reorder live.
- **Respect in-flight commits:** while paused, don't surface a pill that would re-add a row the user just optimistically resolved; recompute against `reviews` (which already excludes optimistically-removed rows) so a mid-commit row isn't offered back.
- **Manual Refresh** button stays and shares the merge path (it can merge immediately rather than via pill).

## Tests

- [x] (Hook, fake timers) polls at the interval; stops while `paused`; resumes after.
- [x] New pending id in the snapshot → pill count increments; merge applies the snapshot + clears the pill.
- [x] A row currently mid-deferred-commit (in `pendingCommits`) is not offered by the pill.

> If wiring the hook into a jsdom test is heavy, unit-test the new-id diff + pill-count logic as a pure helper and smoke-test the pause condition.

## Acceptance criteria

- [x] The inbox polls every 30 s, pauses while hidden, refetches on focus (mirrors `useDashboardCounts`), stale-while-revalidate (last good list kept on fetch error).
- [x] New pending rows surface as a "N new" pill — never a live splice; clicking merges + re-sorts.
- [x] Polling pauses while a dialog is open or a deferred commit is in flight; resumes after.
- [x] Resolved tabs refresh without a destructive reorder.
- [x] No PHI logged on the poll path (BR-DL-5).
- [x] `npx tsc --noEmit` + `npm run lint` clean; targeted test green.
- [x] No backend / `page.tsx` / match-explain edits.

## Out of scope (explicit)

- Quick-resolve (brr-07), filters/sort (brr-08).
- Real-time/websocket updates — polling only.
- Toast on new arrivals — the pill is the only new-arrival affordance (avoid notification noise).

## Decision log

- **Pill, not live splice (P2-BRR-4):** reordering under the cursor mid-decision is the cardinal inbox sin; the pill keeps freshness opt-in for list movement.
- **Reuse `useDashboardCounts` pattern:** a second polling idiom would diverge on the visibility/SWR subtleties already solved there.
- **Pause around dialogs + commits:** a refetch landing during an optimistic window could re-add or drop the in-flight row; pausing is the simplest correct guard.

## References

- [`frontend/hooks/useDashboardCounts.ts`](../../../../../../frontend/hooks/useDashboardCounts.ts) — the polling pattern to mirror (interval, `visibilitychange`, focus refetch, stale-while-revalidate).
- [`frontend/components/service-reviews/ServiceReviewsInbox.tsx`](../../../../../../frontend/components/service-reviews/ServiceReviewsInbox.tsx) — `loadTab`/`refresh` ~180–206; `displayReviews`/`sortPendingByUrgency` ~69–178; `pendingCommits` (from brr-05).
- [`frontend/lib/api.ts`](../../../../../../frontend/lib/api.ts) — `getServiceStaffReviews` (~4593).
- Batch: [`plan-p2-booking-review-workflow-batch.md`](../plan-p2-booking-review-workflow-batch.md) · Order: [`EXECUTION-ORDER-p2-booking-review-workflow.md`](./EXECUTION-ORDER-p2-booking-review-workflow.md).

---

**Status:** `Done` (2026-05-31).  
**Done when:** acceptance criteria checked; status stamped here.
