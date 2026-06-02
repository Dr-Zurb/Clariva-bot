# brr-07 — One-tap quick-resolve from assist hints

| Field | Value |
|---|---|
| **Batch** | [Booking review redesign Phase 2 — workflow](../plan-p2-booking-review-workflow-batch.md) |
| **Wave** | 2 (Lane A — serial after brr-06) |
| **Depends on** | brr-05 (dispatch flow), brr-06 (so the merged list stays consistent) |
| **Blocks** | brr-09 |
| **Size** | **M** |
| **Model** | **Auto** |
| **Decision locks** | BR-DL-2, BR-DL-4, BR-DL-7, P2-BRR-1 |

---

## Objective

Turn the AI's already-computed assist hint into the fastest path to clearing a confident row. In [`ServiceReviewsInbox.tsx`](../../../../../../frontend/components/service-reviews/ServiceReviewsInbox.tsx):

- On pending rows with `assist_hint.top_resolutions`, render the top 1–2 resolutions as **action buttons**: "Resolve as {label} · {count}×".
- Clicking dispatches **through the brr-05 optimistic/deferred-commit flow** (so it's instant + Undo-able):
  - **Confirm** when the resolution's `final_catalog_service_key` equals `proposed_catalog_service_key` (the AI's proposal was right).
  - **Reassign** to that service (`catalogServiceKey` + `catalogServiceId`, **no teaching append**) when it differs.
- Keep Confirm / Reassign / Cancel visible and unchanged; quick-resolve is additive and never auto-fires (BR-DL-4 / P2-BRR-1).

Same endpoints, same payload shapes as the manual path (BR-DL-2).

## Why this task

The bot already aggregates "similar cases resolved as X (5×)" and Phase 1 renders it as prose. For the common case where staff would just agree, one tap should resolve it — instead of reading the hint, then hunting for Confirm or opening the Reassign dialog. Dispatching through brr-05 means quick-resolve inherits the instant feel + the 5-second Undo safety net for free.

## Files

| File | Change |
|---|---|
| `frontend/components/service-reviews/ServiceReviewsInbox.tsx` | **Edit** — in the assist-hint block (~455), render the top resolution(s) as `Button`s; add a `quickResolve(r, resolution)` handler that routes to the brr-05 confirm path or the immediate-reassign path based on the key comparison; resolve the `catalogServiceId` from `settings.service_offerings_json` for the reassign case. |

> The catalog lookup mirrors the existing `labelForServiceKey` / `ReassignDialog` resolution: find the offering whose `service_key` matches the resolution key (lowercased) to get its `service_id`.

## Implementation sketch

```tsx
function quickResolve(r: ServiceStaffReviewListItem, resolutionKey: string) {
  const key = resolutionKey.trim().toLowerCase();
  const proposed = r.proposed_catalog_service_key.trim().toLowerCase();

  if (key === proposed) {
    // AI proposal was right → confirm (deferred-commit + Undo, via brr-05)
    startDeferredConfirm(r);
    return;
  }
  // Different service → reassign, no teaching append (P2-BRR-1)
  const offering = catalog?.services.find((s) => s.service_key === key);
  if (!offering) return;                       // resolution not in catalog → skip (defensive)
  void reassignImmediate(r, {
    catalogServiceKey: key,
    catalogServiceId: offering.service_id,
    // no consultationModality, no correct/wrongServiceHintAppend
  });
}
```

```tsx
// In the assist-hint paragraph (pending rows):
<div className="mt-2 flex flex-wrap gap-1.5">
  {r.assist_hint.top_resolutions.slice(0, 2).map((h) => (
    <Button
      key={h.final_catalog_service_key}
      size="sm"
      variant="secondary"
      disabled={busyId === r.id}
      onClick={() => quickResolve(r, h.final_catalog_service_key)}
    >
      Resolve as {h.label ?? h.final_catalog_service_key} · {h.count}×
    </Button>
  ))}
</div>
```

- `startDeferredConfirm` / `reassignImmediate` are the brr-05 entry points (the same ones the Confirm button / Reassign dialog submit use). Quick-resolve must **not** introduce a parallel call path — it reuses them so parity + Undo + reconcile come for free.
- Keep the existing prose ("Similar cases were resolved as …") above or alongside the buttons — the buttons replace the *call to action*, not the explanation.
- If a resolution key isn't in the current catalog, omit that button (don't fire a reassign to an unknown service).

## Tests

- [x] Resolution key == proposal → routes to the confirm (deferred) path; the toast + Undo appear (assert via the brr-05 entry being called / `postConfirm…` fired after the window).
- [x] Resolution key != proposal and in catalog → fires `postReassignServiceStaffReview` with `{ catalogServiceKey, catalogServiceId }` and **no** teaching append.
- [x] Resolution key not in catalog → no call; button omitted.
- [x] No assist hint → no quick-resolve buttons rendered.

## Acceptance criteria

- [x] Top 1–2 assist resolutions render as "Resolve as {label} · {count}×" on pending rows; hidden when `assist_hint` is empty/absent.
- [x] Quick-resolve fires **confirm** (== proposal) or **reassign** (differs, no teaching append) via the brr-05 flow — same payloads as the manual path; inherits the Undo window (confirm case) and 409 reconcile.
- [x] Confirm / Reassign / Cancel remain visible and unchanged; quick-resolve never auto-fires.
- [x] Unknown-catalog resolution is skipped safely.
- [x] `npx tsc --noEmit` + `npm run lint` clean; targeted test green.
- [x] No backend / `page.tsx` / match-explain edits.

## Out of scope (explicit)

- Quick-resolve with a teaching append (the manual Reassign dialog remains the teaching path).
- Bulk quick-resolve across rows (Phase 3 / R-KEYBOARD bulk select).
- Changing the assist-hint aggregation or copy.

## Decision log

- **Routes through brr-05, not a new call path:** guarantees payload parity, the Undo window, and 409 reconcile without duplication.
- **No teaching append on quick-reassign (P2-BRR-1):** quick-resolve is the "I agree with the aggregate" path; teaching is a deliberate act left to the dialog. Keeps the one-tap action unsurprising.
- **Skip unknown-catalog resolutions:** a hint may reference a service no longer in the catalog; firing a reassign to it would error — omit the button instead.

## References

- [`frontend/components/service-reviews/ServiceReviewsInbox.tsx`](../../../../../../frontend/components/service-reviews/ServiceReviewsInbox.tsx) — assist-hint block ~455–475; `labelForServiceKey` ~93; reassign payload shape ~681–695.
- [`frontend/types/service-staff-review.ts`](../../../../../../frontend/types/service-staff-review.ts) — `ServiceMatchAssistHint.top_resolutions` (`final_catalog_service_key`, `count`, `label`).
- brr-05 task: [`task-brr-05-optimistic-undo-and-toast.md`](./task-brr-05-optimistic-undo-and-toast.md) — the dispatch entry points reused here.
- Batch: [`plan-p2-booking-review-workflow-batch.md`](../plan-p2-booking-review-workflow-batch.md) · Order: [`EXECUTION-ORDER-p2-booking-review-workflow.md`](./EXECUTION-ORDER-p2-booking-review-workflow.md).

---

**Status:** `Done` (2026-05-31).  
**Done when:** acceptance criteria checked; status stamped here.
