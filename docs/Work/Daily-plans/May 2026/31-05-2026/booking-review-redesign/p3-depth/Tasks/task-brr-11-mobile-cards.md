# brr-11 — Mobile card layout (`<lg`) → opens the drawer

| Field | Value |
|---|---|
| **Batch** | [Booking review redesign Phase 3 — depth + platform](../plan-p3-booking-review-depth-batch.md) |
| **Wave** | 2 (Lane A — serial, after brr-10) |
| **Depends on** | brr-10 (`ReviewDetailSheet`) |
| **Blocks** | brr-13 |
| **Size** | **M** |
| **Model** | **Auto** |
| **Decision locks** | BR-DL-8, P3-BRR-3 |

---

## Objective

Make the inbox first-class on a phone. Below the `lg` breakpoint, replace the `overflow-x-auto` table with stacked `ReviewCard`s — no horizontal scrolling. In [`ServiceReviewsInbox.tsx`](../../../../../../frontend/components/service-reviews/ServiceReviewsInbox.tsx) + a new `ReviewCard`:

- **`<lg`:** render a list of `ReviewCard`s over the **same `displayReviews`** (so filters/sort/SLA-sort still apply). Each card shows: patient, reason preview, AI proposal + `ConfidenceBadge`, `SlaCountdown` / queued-age (pending) or resolved time (resolved), and actions — a primary **Confirm** + an **overflow menu** (`⋯`) for Reassign / Cancel.
- **Tap a card** (outside the action controls) → opens brr-10's `ReviewDetailSheet`.
- **`lg+`:** the desktop table is unchanged.
- The Phase-2 toolbar, "N new" pill, and `ActionToast` work in **both** layouts (they already live above the table).

## Why this task

The Phase-1/2 table degrades to horizontal scroll on small screens — unusable for a product whose users are mobile-first. BR-DL-8 commits to a card layout `<lg`. Cards also give a natural tap target for the brr-10 drawer. This is the platform half of "depth + platform."

## Files

| File | Change |
|---|---|
| `frontend/components/service-reviews/ReviewCard.tsx` | **New** — one review as a `Card`: patient, reason, proposal + `ConfidenceBadge`, SLA/queued-age (pending) or resolved time, Confirm + overflow. Takes `review`, `catalog`, action callbacks, `onOpenDetail`, `disabled`. |
| `frontend/components/service-reviews/ServiceReviewsInbox.tsx` | **Edit** — render cards `<lg` and the table `lg+` (CSS `lg:hidden` / `hidden lg:block`, single source list). Wire card callbacks to the **existing** `onConfirm` / `setDialog` handlers and `setDetailReview`. |

> **Overflow menu:** use the existing dropdown/menu primitive if present under `components/ui/`; otherwise a minimal `Popover`/`DropdownMenu`. Check before adding a dependency. Reassign/Cancel still open the existing dialogs (no new flow).

## Implementation sketch

```tsx
// ReviewCard.tsx (shape)
export function ReviewCard({ review, catalog, disabled, onConfirm, onReassign, onCancel, onOpenDetail }: Props) {
  return (
    <Card onClick={() => onOpenDetail(review)} className="cursor-pointer">
      <CardHeader>…patient + SlaCountdown/queued-age…</CardHeader>
      <CardContent>
        <p className="line-clamp-2">{review.reason_for_visit_preview}</p>
        <div>…proposal label… <ConfidenceBadge confidence={review.match_confidence} /></div>
      </CardContent>
      {review.status === "pending" && (
        <CardFooter className="gap-2" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" disabled={disabled} onClick={() => onConfirm(review)}><Check /> Confirm</Button>
          <DropdownMenu>… Reassign → onReassign(review); Cancel → onCancel(review) …</DropdownMenu>
        </CardFooter>
      )}
    </Card>
  );
}
```

```tsx
// Inbox: one list, two layouts
<div className="lg:hidden space-y-3">
  {displayReviews.map((r) => (
    <ReviewCard key={r.id} review={r} catalog={catalog} disabled={busyId === r.id}
      onConfirm={onConfirm}
      onReassign={(rv) => setDialog({ mode: "reassign", review: rv })}
      onCancel={(rv) => setDialog({ mode: "cancel", review: rv })}
      onOpenDetail={setDetailReview} />
  ))}
</div>
<div className="hidden lg:block overflow-x-auto …">{/* existing table */}</div>
```

- **One source of truth:** both layouts map `displayReviews`; the loading/empty/`dataStale` states wrap both.
- The card footer `stopPropagation`s so tapping Confirm/overflow doesn't open the drawer.
- Resolved tabs: cards show outcome + resolved time, no action footer (mirror the table's resolved columns).

## Tests

- [x] `ReviewCard` renders patient, reason, proposal + confidence, and SLA/queued-age for a pending fixture; Confirm/overflow present.
- [x] Tapping the card body calls `onOpenDetail`; tapping Confirm calls `onConfirm` and **not** `onOpenDetail`.
- [x] Resolved fixture renders outcome + resolved time, no action footer.

## Acceptance criteria

- [x] `<lg`: stacked cards, **no horizontal scroll**; each card shows patient, reason, proposal + `ConfidenceBadge`, SLA/queued-age, Confirm + overflow (Reassign/Cancel) (P3-BRR-3 / BR-DL-8).
- [x] Tapping a card opens `ReviewDetailSheet` (brr-10); action controls don't.
- [x] `lg+`: the desktop table is unchanged.
- [x] Toolbar, "N new" pill, and toasts work in both layouts; cards honour the same filter/sort (`displayReviews`).
- [x] Card actions route through the existing handlers (no new call path) → parity (BR-DL-7).
- [x] `npx tsc --noEmit` + `npm run lint` clean; targeted test green.

## Out of scope (explicit)

- Keyboard/bulk (brr-12).
- A bottom-sheet variant — the drawer reuses brr-10's right `Sheet` (it's full-width `<sm`, fine on mobile).
- Any change to the desktop table beyond gating it `lg+`.

## Decision log

- **CSS breakpoint split, one list:** simplest correct approach; avoids duplicating filter/sort/empty logic and keeps a single data source.
- **Confirm primary + overflow for the rest:** Confirm is the common path; Reassign/Cancel are rarer and fit an overflow on a narrow card (BR-DL-8).
- **Reuse the right `Sheet` on mobile:** `SheetContent` is `w-full` under `sm`, so it already behaves like a mobile sheet — no separate component.

## References

- [`frontend/components/service-reviews/ServiceReviewsInbox.tsx`](../../../../../../frontend/components/service-reviews/ServiceReviewsInbox.tsx) — table + handlers to reuse.
- [`frontend/components/service-reviews/ConfidenceBadge.tsx`](../../../../../../frontend/components/service-reviews/ConfidenceBadge.tsx) · [`SlaCountdown.tsx`](../../../../../../frontend/components/service-reviews/SlaCountdown.tsx).
- [`frontend/components/ui/card.tsx`](../../../../../../frontend/components/ui/card.tsx) — `Card` parts.
- Batch: [`plan-p3-booking-review-depth-batch.md`](../plan-p3-booking-review-depth-batch.md) · Order: [`EXECUTION-ORDER-p3-booking-review-depth.md`](./EXECUTION-ORDER-p3-booking-review-depth.md).

---

**Status:** `Done` (2026-05-31).  
**Done when:** acceptance criteria checked; status stamped here.
