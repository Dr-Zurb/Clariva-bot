# brr-02 — Reskin rows + Reassign/Cancel dialogs (preserve actions, 409, teaching)

| Field | Value |
|---|---|
| **Batch** | [Booking review redesign Phase 1 — reskin + SLA](../plan-p1-booking-review-redesign-batch.md) |
| **Wave** | 1 (Lane A — second, serial after brr-01) |
| **Depends on** | brr-01 |
| **Blocks** | brr-03 (rows must exist for the SLA chip), brr-04 |
| **Size** | **M** |
| **Model** | **Auto** |
| **Decision locks** | BR-DL-1, BR-DL-2, BR-DL-5, BR-DL-7, P1-BRR-1, P1-BRR-3 |

---

## Objective

Reskin the **row bodies and the two modals** onto primitives, preserving every behaviour. In [`ServiceReviewsInbox.tsx`](../../../../../../frontend/components/service-reviews/ServiceReviewsInbox.tsx):

- **Row cells** (patient, reason preview, AI proposal + assist hint, match signals, queued/resolved time, actions) re-authored with token classes; confidence renders via the brr-01 `ConfidenceBadge`; match signals still come from `staff-review-match-explain.ts` (reused, not rewritten).
- **Action buttons** → `Button` variants: Confirm = `default`, Reassign = `outline`, Cancel = `destructive` (or `ghost` + destructive text), each with a small `lucide-react` icon and the existing `disabled`/busy logic.
- **`ReassignDialog`** → `Dialog` / `DialogContent` / `DialogHeader` / `DialogTitle` / `DialogDescription` / `DialogFooter`; the catalog + modality pickers → `Select`; **preserve the teaching-moment logic verbatim** (`sanitizeReasonForHintSuggestion`, include-when / exclude-when appends, Skip-teaching checkbox, the same submit payload).
- **`CancelDialog`** → `Dialog`, preserving the optional internal-note `textarea` and submit.
- **Keep** the inline "Show technical detail" expander row (the detail `Sheet` is Phase 3 / R-DRAWER, P1-BRR-3).

Behaviour is frozen: same `runAction`, same okMessages, same **409 "already resolved → refetch"** branch, same payloads. Only the markup changes (BR-DL-2 / BR-DL-7).

## Why this task

The rows and modals are the bulk of the component's surface and the most behaviourally load-bearing part — confirming/reassigning sends a real booking link to a real patient, and the reassign payload teaches the matcher. Reskinning them onto `Button` + `Dialog` + `Select` finishes the "looks basic" fix while the strict behaviour-preservation contract keeps patient-facing outcomes identical. Splitting this from brr-01 keeps each diff reviewable: brr-01 = chrome, brr-02 = the cells + the two dialogs.

## Files

| File | Change |
|---|---|
| `frontend/components/service-reviews/ServiceReviewsInbox.tsx` | **Edit** — reskin the `<tbody>` row cells + action buttons; convert `ReassignDialog` and `CancelDialog` to `Dialog`-based components (same props, same submit logic). Keep `runAction`, okMessages, the 409 branch, and the technical-detail expander. |

> **Do not change** the `onSubmit` payload shapes, the `runAction` signature, or the success/error copy intent. If a string moves, it moves verbatim. The reassign teaching payload (`correctServiceHintAppend` / `wrongServiceHintAppend`) must be byte-identical to today.

## Implementation sketch

### Action buttons (replace the hand-rolled `<button>`s, lines ~450–479)

```tsx
<div className="flex flex-wrap gap-2">
  <Button size="sm" disabled={disabled} onClick={() => onConfirm(r)}>
    <Check /> Confirm
  </Button>
  <Button size="sm" variant="outline" disabled={disabled}
          onClick={() => setDialog({ mode: "reassign", review: r })}>
    <ArrowLeftRight /> Reassign
  </Button>
  <Button size="sm" variant="ghost" disabled={disabled}
          className="text-destructive hover:text-destructive"
          onClick={() => setDialog({ mode: "cancel", review: r })}>
    <X /> Cancel
  </Button>
</div>
```

> `onConfirm` / `setDialog` / `busyId` (`disabled`) are unchanged. Only the elements change.

### `ReassignDialog` → `Dialog` (preserve the teaching logic)

- Wrap in `<Dialog open onOpenChange={(o) => !o && onClose()}>` with `DialogContent` (the component already mounts only when `dialog.mode === "reassign"`, so `open` is effectively true; wire `onOpenChange` to `onClose` so Esc / overlay close still works).
- Replace the two native `<select>`s with the `Select` primitive (catalog service, modality). Keep `serviceKey` / `modality` state and the `useEffect` that resets the suggestion text on service change.
- Keep the entire teaching block: `suggestionSeed`, `skipTeaching`, `correctIncludeWhen`, `wrongExcludeWhen`, `selectedIsSameAsProposed`, the `MATCHER_TX_MAX` counters, and the exact `submit()` that builds `correctServiceHintAppend` / `wrongServiceHintAppend`. **This is unchanged logic in new wrappers.**
- Footer → `DialogFooter` with a `Button variant="outline"` Close + a `Button` Save (disabled while saving / no offering).

### `CancelDialog` → `Dialog`

- Same wrap; keep the optional `note` textarea and `submit()`; footer = Back (`outline`) + Cancel request (`destructive`).

### Rows + match signals

- Patient cell: keep the `Link` to `/dashboard/patients-v2/{id}` (optionally wrap the name in `Button asChild variant="link"`); keep the non-link fallback.
- Match-signals cell: keep calling `matchExplanationSummary` / `matchReasonChipMeta` / `parseCandidateLabels`; render reason codes as small `Badge variant="outline"` chips (still `title=` tooltip or wrap in `Tooltip`). The assist-hint paragraph keeps its copy + structure.
- Keep the "Show technical detail" toggle + the expanded `<tr>` (P1-BRR-3).

## Tests

No new unit test file is mandated (logic is unchanged); rely on brr-04's parity verification + the existing suites. If a quick render smoke is cheap, assert the three action buttons render for a pending row and the Reassign dialog opens — optional.

## Acceptance criteria

- [x] Row cells + action buttons render via primitives (`Button` variants, `ConfidenceBadge`, `Badge` reason chips); no raw colour literals.
- [x] `ReassignDialog` + `CancelDialog` are `Dialog`-based; catalog/modality use `Select`; Esc/overlay close works via `onOpenChange`.
- [x] The reassign teaching payload (`correctServiceHintAppend` / `wrongServiceHintAppend`), the Skip-teaching path, and the modality/service submit are **byte-identical** to today.
- [x] `runAction`, okMessages, and the **409 → refetch** branch are unchanged; Confirm/Reassign/Cancel fire the same API calls.
- [x] The "Show technical detail" expander still works.
- [x] `npx tsc --noEmit` + `npm run lint` clean.
- [x] No edit to `page.tsx`, the backend, or `staff-review-match-explain.ts`.

## Out of scope (explicit)

- One-tap assist-resolve (Phase 2 / R-QUICKRESOLVE) — the assist hint stays read-only copy here.
- Replacing the expander with a `Sheet` drawer (Phase 3 / R-DRAWER).
- Optimistic update / undo (Phase 2 / R-OPTIMISTIC) — keep the refetch-after-action flow.
- SLA chip (brr-03).

## Decision log

- **Teaching logic moved, never modified:** it writes matcher hints that change future routing; a reskin must not perturb it (BR-DL-2). New wrappers, identical computation + payload.
- **Expander kept (not drawer-ified):** the `Sheet` drawer is a Phase 3 feature with its own task; keeping the expander here bounds this to a reskin (P1-BRR-3).
- **Refetch-after-action retained:** optimistic update is Phase 2; pairing a reskin with a concurrency change would muddy parity verification (BR-DL-7).

## References

- [`frontend/components/service-reviews/ServiceReviewsInbox.tsx`](../../../../../../frontend/components/service-reviews/ServiceReviewsInbox.tsx) — rows ~333–524; actions ~450–479; `ReassignDialog` ~583–835; `CancelDialog` ~837–909; `runAction` ~144–178.
- [`frontend/components/ui/dialog.tsx`](../../../../../../frontend/components/ui/dialog.tsx) · [`select.tsx`](../../../../../../frontend/components/ui/select.tsx) · [`button.tsx`](../../../../../../frontend/components/ui/button.tsx) · [`tooltip.tsx`](../../../../../../frontend/components/ui/tooltip.tsx).
- [`frontend/lib/staff-review-match-explain.ts`](../../../../../../frontend/lib/staff-review-match-explain.ts) — reused match-explanation copy.
- Batch: [`plan-p1-booking-review-redesign-batch.md`](../plan-p1-booking-review-redesign-batch.md) · Order: [`EXECUTION-ORDER-p1-booking-review-redesign.md`](./EXECUTION-ORDER-p1-booking-review-redesign.md).

---

**Status:** `Done` (2026-05-31).  
**Done when:** acceptance criteria checked; status stamped here.
