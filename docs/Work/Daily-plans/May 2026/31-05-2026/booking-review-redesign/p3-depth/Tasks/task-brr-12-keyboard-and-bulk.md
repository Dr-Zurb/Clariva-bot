# brr-12 — Keyboard triage + bulk-select / bulk-confirm

| Field | Value |
|---|---|
| **Batch** | [Booking review redesign Phase 3 — depth + platform](../plan-p3-booking-review-depth-batch.md) |
| **Wave** | 2 (Lane A — serial, after brr-11) |
| **Depends on** | brr-10 (drawer), Phase 2 dispatcher (brr-05) |
| **Blocks** | brr-13 |
| **Size** | **M–L** |
| **Model** | **Auto** |
| **Decision locks** | BR-DL-7, P2-BRR-1, P3-BRR-4, P3-BRR-5 |

---

## Objective

Make the queue clearable at keyboard speed, and let staff clear a run of confident items at once — both routed through the **Phase-2 deferred-commit dispatcher** (no new call path). In [`ServiceReviewsInbox.tsx`](../../../../../../frontend/components/service-reviews/ServiceReviewsInbox.tsx) + a new keyboard/selection hook:

- **Row selection model:** a "focused row" index over `displayReviews`, with visible focus + `aria` selection state.
- **Shortcuts** (window-scoped, but **inert while typing or while a `Dialog`/`Sheet` is open** — P3-BRR-5):
  - `j` / `k` — move focus down / up
  - `c` — confirm focused row · `r` — reassign (open dialog) · `x` — cancel (open dialog)
  - `Enter` — open the detail drawer (`setDetailReview`) · `/` — focus the filter input · `?` — toggle a shortcuts help
- **Bulk-select** (checkbox per pending row + "select all visible") → **Bulk-confirm**: fire Confirm **per row** through the same deferred-commit dispatcher (per-row 409 reconcile); show **one batch toast** ("N confirmed · Undo") whose Undo cancels all still-pending commits in the batch.
- **Confirm-only bulk** this phase — no bulk reassign/cancel.

## Why this task

After Phase 2 made actions instant and the queue filterable, the mouse is the last bottleneck. j/k/c/x lets a doctor clear confident items without leaving the home row, and bulk-confirm collapses "10 obvious approvals" into one gesture. Routing everything through the Phase-2 dispatcher means instant feel + Undo + the 409 reconcile come for free, and parity is preserved (BR-DL-7).

## Files

| File | Change |
|---|---|
| `frontend/lib/service-reviews/useReviewKeyboard.ts` | **New** — effect-bound keyboard hook (mirror [`use-composer-hotkeys.ts`](../../../../../../frontend/lib/text/use-composer-hotkeys.ts)): takes focused index + counts + callbacks (`onMove`, `onConfirm`, `onReassign`, `onCancel`, `onOpenDetail`, `onFocusFilter`, `onToggleHelp`); guards typing/modal; `preventDefault` only when it acts. |
| `frontend/lib/service-reviews/bulk-confirm.ts` | **New (small, pure-ish)** — given selected ids + the per-row dispatch fn, run bulk-confirm through the deferred-commit controller and return a batch handle (cancel-all for Undo). Unit-testable with an injected dispatcher. |
| `frontend/components/service-reviews/ServiceReviewsInbox.tsx` | **Edit** — focused-row state + selection set; render row/card checkboxes + a bulk action bar when selection non-empty; wire the hook; a small `?` help popover. Reuse the brr-10 drawer + Phase-2 dispatcher. |

> **No new endpoint, no new payload.** `c`/bulk-confirm call the same `onConfirm` path as the button; `r`/`x` open the same dialogs. Parity is the rule.

## Implementation sketch

```ts
// useReviewKeyboard.ts (shape — mirrors use-composer-hotkeys priority/guard style)
export function useReviewKeyboard(opts: {
  enabled: boolean;            // false when a Dialog/Sheet is open
  count: number;
  onMove: (delta: number) => void;
  onConfirm: () => void; onReassign: () => void; onCancel: () => void;
  onOpenDetail: () => void; onFocusFilter: () => void; onToggleHelp: () => void;
}) {
  useEffect(() => {
    if (!opts.enabled) return;
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) {
        if (e.key === "/") { /* allow focusing filter is handled elsewhere */ }
        return; // never trigger triage keys while typing
      }
      switch (e.key) {
        case "j": e.preventDefault(); opts.onMove(1); break;
        case "k": e.preventDefault(); opts.onMove(-1); break;
        case "c": e.preventDefault(); opts.onConfirm(); break;
        case "r": e.preventDefault(); opts.onReassign(); break;
        case "x": e.preventDefault(); opts.onCancel(); break;
        case "Enter": e.preventDefault(); opts.onOpenDetail(); break;
        case "/": e.preventDefault(); opts.onFocusFilter(); break;
        case "?": e.preventDefault(); opts.onToggleHelp(); break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [opts]);
}
```

```ts
// bulk-confirm.ts (shape)
export function runBulkConfirm(ids: string[], dispatchConfirm: (id: string) => DeferredHandle): BatchHandle {
  const handles = ids.map(dispatchConfirm);     // each schedules a deferred commit (brr-05)
  return { count: ids.length, cancelAll: () => handles.forEach((h) => h.cancel()) };
}
```

- **`enabled` gate:** false when `dialog !== null` or `detailReview !== null` (a `Sheet`/`Dialog` is up) → satisfies P3-BRR-5.
- **Focus visibility:** the focused row/card gets a ring + `aria-selected` (or `aria-current`); keep it scrolled into view on `j`/`k`.
- **Bulk bar:** appears when ≥1 selected — "N selected · Confirm selected · Clear". Confirm selected → `runBulkConfirm` over the dispatcher; render **one** `ActionToast` for the batch; Undo → `cancelAll()`.
- **Per-row reconcile:** each deferred commit already handles 409 (already-resolved) from Phase 2 — bulk inherits it; a partially-stale batch still resolves cleanly.

## Tests

- [x] `useReviewKeyboard`: `j`/`k` call `onMove(+1/-1)`; `c` calls `onConfirm`; keys are ignored when target is an input; ignored when `enabled` is false.
- [x] `runBulkConfirm`: dispatches once per id; `cancelAll` cancels every handle (no commit fires). Use a fake dispatcher.
- [x] Bulk-confirm of a 3-row selection schedules 3 commits; Undo cancels all 3 → no network calls fired.
- [x] (Component) bulk-confirm where one row is already resolved → 409 reconciles that row, others commit; no crash, no double-send.

## Acceptance criteria

- [x] `j`/`k` move focus; `c`/`r`/`x` act on the focused row; `Enter` opens the drawer; `/` focuses filter; `?` toggles help (P3-BRR-4).
- [x] Shortcuts are **inert** while typing in an input/textarea/select or while a `Dialog`/`Sheet` is open (P3-BRR-5).
- [x] Bulk-select (per-row + select-all-visible) → bulk-confirm routes **per-row through the Phase-2 deferred-commit dispatcher**; one batch toast; Undo cancels all pending (P3-BRR-4).
- [x] Per-row 409 reconcile works inside a bulk batch.
- [x] All keyboard/bulk actions fire the **same endpoints + payloads** as the mouse path (BR-DL-7 / P2-BRR-1).
- [x] Visible focus + `aria` selection; no focus trap; help is discoverable.
- [x] `npx tsc --noEmit` + `npm run lint` clean; targeted tests green.

## Out of scope (explicit)

- Bulk reassign / bulk cancel (confirm-only this phase).
- Customisable keybindings.
- A new action endpoint/payload (parity is mandatory).
- Drawer/mobile internals (brr-10/11) beyond opening the drawer via `Enter`/tap.

## Decision log

- **Window-scoped but guarded:** the inbox is a full page; window scope is natural. The typing/modal guard (mirroring `use-composer-hotkeys`) keeps it from stealing keys mid-typing or over a dialog (P3-BRR-5).
- **Bulk = iterate the dispatcher, not a new bulk endpoint:** reuses Phase-2 instant-feel + Undo + 409 reconcile; preserves parity; avoids backend work (BR-DL-7).
- **Confirm-only bulk:** Reassign needs a target and Cancel is destructive — both are poor fits for a one-shot batch; deferred.
- **One batch toast:** simpler than N toasts and gives a single Undo for the whole gesture.

## References

- [`frontend/lib/text/use-composer-hotkeys.ts`](../../../../../../frontend/lib/text/use-composer-hotkeys.ts) — the hook convention to mirror.
- [`frontend/lib/service-reviews/deferred-commit.ts`](../../../../../../frontend/lib/service-reviews/deferred-commit.ts) — Phase-2 dispatcher reused for bulk.
- [`frontend/components/service-reviews/ActionToast.tsx`](../../../../../../frontend/components/service-reviews/ActionToast.tsx) — the batch toast.
- [`frontend/components/service-reviews/ServiceReviewsInbox.tsx`](../../../../../../frontend/components/service-reviews/ServiceReviewsInbox.tsx) — `onConfirm` / `setDialog` reused.
- Batch: [`plan-p3-booking-review-depth-batch.md`](../plan-p3-booking-review-depth-batch.md) · Order: [`EXECUTION-ORDER-p3-booking-review-depth.md`](./EXECUTION-ORDER-p3-booking-review-depth.md).

---

**Status:** `Done` (2026-05-31).  
**Done when:** acceptance criteria checked; status stamped here.
