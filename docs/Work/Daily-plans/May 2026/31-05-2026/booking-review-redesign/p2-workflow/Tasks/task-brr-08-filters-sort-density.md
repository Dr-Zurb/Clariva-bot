# brr-08 — Filter / search / sort / density toolbar

| Field | Value |
|---|---|
| **Batch** | [Booking review redesign Phase 2 — workflow](../plan-p2-booking-review-workflow-batch.md) |
| **Wave** | 3 (Lane A) |
| **Depends on** | brr-05 (display pipeline), brr-06 (merged list) |
| **Blocks** | brr-09 |
| **Size** | **M** |
| **Model** | **Auto** |
| **Decision locks** | BR-DL-2, P2-BRR-5 |

---

## Objective

Let staff slice the queue, entirely client-side over the rows already on the wire. In [`ServiceReviewsInbox.tsx`](../../../../../../frontend/components/service-reviews/ServiceReviewsInbox.tsx):

- **Text filter** — match patient display name / service label / `service_key` (case-insensitive substring).
- **Confidence filter** — quick chips/select incl. "Low only" (and high/medium/all).
- **Sort control** — **Most urgent** (default, = Phase 1 `sortPendingByUrgency`) / Newest / Oldest / Confidence.
- **Density toggle** — comfortable / compact (row padding), persisted in `localStorage`.
- **"No matches" empty state** — distinct from the empty-queue state when filters exclude all rows.

All composes with the active tab and brr-06's merged list, over the existing `displayReviews` memo. No new fetch (BR-DL-2 / P2-BRR-5).

## Why this task

Pending is urgency-sorted but otherwise unsliceable; at any real volume staff need to find "the low-confidence ones" or "that patient" fast. Because every row is already fetched, this is pure client-side rendering over the existing pipeline — cheap, and it composes with the urgency sort that stays the default.

## Files

| File | Change |
|---|---|
| `frontend/lib/service-reviews/filter-sort.ts` | **New** — pure `filterReviews(rows, { query, confidence })` + `sortReviews(rows, mode, nowMs)` helpers (testable; `Most urgent` delegates to the existing urgency comparator). |
| `frontend/components/service-reviews/ReviewToolbar.tsx` | **New** — the toolbar UI (search `Input`, confidence `Select`/chips, sort `Select`, density toggle). Controlled; lifts state to the inbox. |
| `frontend/components/service-reviews/ServiceReviewsInbox.tsx` | **Edit** — add filter/sort/density state (density from `localStorage`); fold `filterReviews` + `sortReviews` into the `displayReviews` memo; render `ReviewToolbar`; add the "no matches" state; apply density classes to rows. |
| `frontend/lib/service-reviews/__tests__/filter-sort.test.ts` | **New** — filter by name/label/key; "Low only"; each sort mode incl. Most-urgent parity with Phase 1. |

> **Extend, don't replace, `displayReviews`.** Phase 1's `sortPendingByUrgency` becomes the implementation of the "Most urgent" sort mode; don't fork the comparator.

## Implementation sketch

```ts
// filter-sort.ts
export type SortMode = "urgent" | "newest" | "oldest" | "confidence";
export type ConfidenceFilter = "all" | "high" | "medium" | "low";

export function filterReviews(
  rows: ServiceStaffReviewListItem[],
  opts: { query: string; confidence: ConfidenceFilter },
): ServiceStaffReviewListItem[] { /* substring over name/label/key + confidence match */ }

export function sortReviews(
  rows: ServiceStaffReviewListItem[],
  mode: SortMode,
  nowMs: number,
): ServiceStaffReviewListItem[] {
  if (mode === "urgent") return sortPendingByUrgency(rows);   // reuse Phase 1
  // newest/oldest by created_at; confidence by high>medium>low
}
```

```tsx
// inbox displayReviews memo (extended):
const displayReviews = useMemo(() => {
  const filtered = filterReviews(reviews, { query, confidence });
  return dataTab === "pending"
    ? sortReviews(filtered, sortMode, tickNow)
    : filtered;                       // resolved tabs keep server order unless a sort is chosen
}, [reviews, dataTab, query, confidence, sortMode, tickNow]);
```

- **Service label** for filtering: resolve via the existing `labelForServiceKey(catalog, r.proposed_catalog_service_key)`; also match the raw `service_key` and `patient_display_name`.
- **Density:** a `"comfortable" | "compact"` state initialised from `localStorage` (key e.g. `booking-review:density`), toggled in the toolbar, applied as a row-padding class (`py-3` vs `py-1.5`). Read in a `useEffect`/lazy initialiser to avoid SSR mismatch.
- **No-matches state:** when `reviews.length > 0` but `displayReviews.length === 0`, show a `Card` "No reviews match your filters" + a "Clear filters" `Button` — distinct from the empty-queue `Card`.
- **Confidence filter** uses the same level mapping as `ConfidenceBadge` (case-insensitive) — consider exporting `levelOf` from `ConfidenceBadge.tsx` to avoid duplicating the mapping.

## Tests (`filter-sort.test.ts`)

- [x] Text filter matches patient name, service label, and `service_key` (case-insensitive); non-match excluded.
- [x] "Low only" returns only low-confidence rows; "all" returns everything.
- [x] `urgent` sort == Phase 1 `sortPendingByUrgency` output (parity).
- [x] `newest`/`oldest` order by `created_at`; `confidence` orders high→low.
- [x] Empty query + "all" + "urgent" is a no-op vs the Phase 1 pipeline.

## Acceptance criteria

- [x] Text filter, confidence filter, sort control, and density toggle render in `ReviewToolbar` and compose with the active tab over `displayReviews`.
- [x] "Most urgent" is the default sort and matches Phase 1 behaviour; other modes sort correctly.
- [x] Density persists across reload via `localStorage` with no SSR hydration mismatch.
- [x] A distinct "no matches" state (with Clear filters) shows when filters exclude all rows; empty-queue state unchanged.
- [x] Filters/sort survive a brr-06 merge (applying to the merged list).
- [x] `npx tsc --noEmit` + `npm run lint` clean; `filter-sort.test.ts` green.
- [x] No backend / `page.tsx` / match-explain edits; no new fetch.

## Out of scope (explicit)

- Saved views / per-doctor default filter (B4.4 fast-follow).
- Server-side filtering / pagination.
- Date-range filters / resolved-by filter (revisit with the drawer's audit data in Phase 3 if needed).

## Decision log

- **Client-side only (P2-BRR-5):** all rows are already fetched per tab; filtering on the client is instant and needs no API change.
- **"Most urgent" stays default:** Phase 1 established urgency-first as the right default; the sort control adds options without demoting it.
- **Reuse the urgency comparator + confidence mapping:** avoids two sources of truth for "what's urgent" and "what's low confidence."

## References

- [`frontend/components/service-reviews/ServiceReviewsInbox.tsx`](../../../../../../frontend/components/service-reviews/ServiceReviewsInbox.tsx) — `displayReviews` ~175; `sortPendingByUrgency` ~69; `labelForServiceKey` ~93; empty-state `Card` ~340.
- [`frontend/components/service-reviews/ConfidenceBadge.tsx`](../../../../../../frontend/components/service-reviews/ConfidenceBadge.tsx) — confidence level mapping to reuse.
- [`frontend/components/ui/input.tsx`](../../../../../../frontend/components/ui/input.tsx) · [`select.tsx`](../../../../../../frontend/components/ui/select.tsx) — toolbar primitives.
- Batch: [`plan-p2-booking-review-workflow-batch.md`](../plan-p2-booking-review-workflow-batch.md) · Order: [`EXECUTION-ORDER-p2-booking-review-workflow.md`](./EXECUTION-ORDER-p2-booking-review-workflow.md).

---

**Status:** `Done` (2026-05-31).  
**Done when:** acceptance criteria checked; status stamped here.
