# brr-10 — Detail drawer (`Sheet`): signals + candidates + resolved audit + conversation placeholder

| Field | Value |
|---|---|
| **Batch** | [Booking review redesign Phase 3 — depth + platform](../plan-p3-booking-review-depth-batch.md) |
| **Wave** | 1 (Lane A — first, alone) |
| **Depends on** | Phase 2 (brr-05..09, shipped) |
| **Blocks** | brr-11, brr-12, brr-13 |
| **Size** | **M** |
| **Model** | **Auto** |
| **Decision locks** | BR-DL-5, BR-DL-6, P3-BRR-1, P3-BRR-2 |

---

## Objective

Replace the cramped inline "Show technical detail" expander with a proper right-side detail drawer that gives staff the full context to decide — all from data already on the wire. In [`ServiceReviewsInbox.tsx`](../../../../../../frontend/components/service-reviews/ServiceReviewsInbox.tsx) + a new `ReviewDetailSheet`:

- **Open** the drawer on row click (and from mobile tap in brr-11, keyboard `Enter` in brr-12).
- **Content:** match summary + **all** reason codes (via the match-explain helper), candidate services considered, AI proposal + final visit type, and — for resolved rows — the **audit**: `resolved_by_user_id` (rendered plainly / "staff", no name lookup) and `resolution_internal_note`.
- **Conversation section:** a graceful **placeholder** ("Conversation view coming soon", + a safe deep-link if one exists) — **no backend call** (P3-BRR-2 / BR-Q3).
- **Remove** the inline expander row (`expandedReviewId` state + the expanded `<tr>`).
- PHI renders **in-session only**; nothing logged (BR-DL-5).

## Why this task

Staff currently decide from a one-line reason preview, with the matcher's full reasoning hidden behind a tiny expander that also fights the table layout. A drawer is the right home for "everything the matcher knew + who resolved it and why," and it's the shared surface mobile (brr-11) and keyboard (brr-12) both open — so it must exist and be stable first. The conversation is the one piece that needs backend; it's stubbed here (P3-BRR-2) so the rest can ship.

## Files

| File | Change |
|---|---|
| `frontend/components/service-reviews/ReviewDetailSheet.tsx` | **New** — the right `Sheet` for one review: signals, candidates, proposal/final, resolved audit, conversation placeholder. Pure presentational; takes a `review` + `catalog` + `onClose`. |
| `frontend/components/service-reviews/ServiceReviewsInbox.tsx` | **Edit** — add `detailReview` state; open `ReviewDetailSheet` on row click; remove the inline expander (`expandedReviewId` + expanded `<tr>` + the "Show technical detail" button). Keep the action buttons in the row. |

> **Reuse, don't duplicate:** the signals copy comes from `matchExplanationSummary` / `matchReasonChipMeta` / `parseMatchReasonCodes` / `parseCandidateLabels` (already imported). The drawer renders their output; it does not re-author copy.

## Implementation sketch

```tsx
// ReviewDetailSheet.tsx (shape)
export function ReviewDetailSheet({ review, catalog, onClose }: Props) {
  const reasonCodes = parseMatchReasonCodes(review.match_reason_codes);
  const candidates = parseCandidateLabels(review.candidate_labels);
  const isResolved = review.status !== "pending";
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Review detail</SheetTitle>
          <SheetDescription>{patientLabel(review)}</SheetDescription>
        </SheetHeader>

        {/* Proposal / final + confidence */}
        <section>…AI proposal (+ final visit type if resolved) + <ConfidenceBadge />…</section>

        {/* Match signals */}
        <section>
          <h3>Matcher signals</h3>
          <p>{matchExplanationSummary(reasonCodes, review.match_confidence)}</p>
          <ul>{reasonCodes.map((c) => { const m = matchReasonChipMeta(c); return <li>…{m.label} — {m.detail}…</li>; })}</ul>
        </section>

        {/* Candidates */}
        {candidates.length > 0 && <section>…candidate services…</section>}

        {/* Resolved audit */}
        {isResolved && (
          <section>
            <h3>Resolution</h3>
            <p>Outcome: {rowStatusLabel(review.status)}</p>
            {review.resolved_by_user_id && <p>Resolved by: {review.resolved_by_user_id}</p>}
            {review.resolution_internal_note && <p>Note: {review.resolution_internal_note}</p>}
          </section>
        )}

        {/* Conversation — placeholder only (P3-BRR-2) */}
        <section aria-label="Conversation">
          <h3>Instagram conversation</h3>
          <p className="text-sm text-muted-foreground">Conversation view coming soon.</p>
          {/* optional: a safe deep-link if one exists; otherwise nothing */}
        </section>
      </SheetContent>
    </Sheet>
  );
}
```

```tsx
// Inbox: open on row click (avoid hijacking clicks on the action Buttons / patient link)
<tr onClick={() => setDetailReview(r)} className="cursor-pointer">
  …cells… {/* action buttons call stopPropagation so they don't open the drawer */}
</tr>
{detailReview && (
  <ReviewDetailSheet review={detailReview} catalog={catalog} onClose={() => setDetailReview(null)} />
)}
```

- The row's action `Button`s and the patient `Link` must `stopPropagation` so clicking them doesn't also open the drawer.
- Drop `expandedReviewId` and the expanded `<tr>` entirely; the technical detail now lives in the drawer.
- Keep `tableColCount` correct after removing the expander.

## Tests

- [x] Drawer renders match summary, all reason codes, and candidates for a pending fixture.
- [x] For a resolved fixture, the audit section shows outcome + `resolved_by_user_id` + `resolution_internal_note`.
- [x] Conversation section shows the placeholder and makes **no** network call.
- [x] Clicking an action button does not open the drawer (stopPropagation).

## Acceptance criteria

- [x] Row click opens `ReviewDetailSheet` with signals + candidates + proposal/final + (resolved) audit.
- [x] The inline "Show technical detail" expander is removed; no `expandedReviewId` remains.
- [x] Conversation is a graceful placeholder; no backend call; drawer works fully without it (P3-BRR-2 / BR-R4).
- [x] PHI (reason/audit) renders in-session only; nothing logged (BR-DL-5).
- [x] Action buttons / patient link still work and don't trigger the drawer.
- [x] `npx tsc --noEmit` + `npm run lint` clean; targeted test green.
- [x] No backend / `page.tsx` / match-explain edits.

## Out of scope (explicit)

- The live IG conversation read (deferred backend task, P3-BRR-2).
- Mobile card layout (brr-11) — but the drawer must be openable from a tap target.
- Keyboard open (brr-12) — `Enter` will call the same `setDetailReview`.

## Decision log

- **Drawer replaces the expander:** a `Sheet` is the right home for dense detail; the inline expander fought the table and is superseded (P3-BRR-1).
- **Conversation stubbed, not built:** no doctor-facing transcript endpoint exists; building it needs backend + RLS + PHI review and is deferred (P3-BRR-2). The placeholder keeps the drawer shippable now and lit-up later.
- **`resolved_by_user_id` shown raw:** a name lookup would add a fetch; the UUID/"staff" is enough for an audit line (no extra round-trip).

## References

- [`frontend/components/service-reviews/ServiceReviewsInbox.tsx`](../../../../../../frontend/components/service-reviews/ServiceReviewsInbox.tsx) — inline expander ~516–610 (removed here); match-explain usage ~424–427.
- [`frontend/components/ui/sheet.tsx`](../../../../../../frontend/components/ui/sheet.tsx) — `Sheet`/`SheetContent`/`SheetHeader`/`SheetTitle`/`SheetDescription`.
- [`frontend/types/service-staff-review.ts`](../../../../../../frontend/types/service-staff-review.ts) — `resolved_by_user_id`, `resolution_internal_note`, `final_catalog_service_key`.
- [`frontend/lib/staff-review-match-explain.ts`](../../../../../../frontend/lib/staff-review-match-explain.ts) — signals copy (reused).
- Batch: [`plan-p3-booking-review-depth-batch.md`](../plan-p3-booking-review-depth-batch.md) · Order: [`EXECUTION-ORDER-p3-booking-review-depth.md`](./EXECUTION-ORDER-p3-booking-review-depth.md).

---

**Status:** `Done` (2026-05-31).  
**Done when:** acceptance criteria checked; status stamped here.
