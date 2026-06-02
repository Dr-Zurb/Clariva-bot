# brr-05 — Optimistic actions + deferred-commit Undo + reusable action-toast

| Field | Value |
|---|---|
| **Batch** | [Booking review redesign Phase 2 — workflow](../plan-p2-booking-review-workflow-batch.md) |
| **Wave** | 1 (Lane A — first, alone) |
| **Depends on** | Phase 1 (brr-01..04, shipped) |
| **Blocks** | brr-06, brr-07, brr-08, brr-09 |
| **Size** | **M–L** |
| **Model** | **Auto** |
| **Decision locks** | BR-DL-2, BR-DL-5, BR-DL-7, P2-BRR-2, P2-BRR-3 |

---

## Objective

Make Confirm / Cancel feel instant and reversible, and Reassign feel instant, **without a backend inverse** — by restructuring how actions commit in [`ServiceReviewsInbox.tsx`](../../../../../../frontend/components/service-reviews/ServiceReviewsInbox.tsx), plus a small reusable action-toast.

- **Action-toast host** (new, reusable) — a portal-mounted toast queue with auto-dismiss, `role="status"`, and an optional **Undo** action button (P2-BRR-3).
- **Deferred-commit for Confirm / Cancel** (P2-BRR-2) — on action: optimistically remove the row + show a toast ("Resolved · Undo" / "Cancelled · Undo") with a countdown; **schedule** the real API call after a window (default 5 s). **Undo cancels the scheduled call before it fires** and restores the row. On elapse: fire → reconcile (success → stays gone + success toast; **409 → refetch + "already resolved"**; other error → restore row + error toast).
- **Reassign stays immediate** — commits on dialog submit (optimistic removal + reconcile, **no** Undo window), teaching payload unchanged.
- **Flush on tab switch / unmount** — any in-flight deferred commit **fires immediately** (never silently dropped). Undo is only available while mounted on that tab.

This honours BR-DL-7: an action either fires for real (then reconciles) or never fires at all; we never fabricate a local undo of a committed server change.

## Why this task

This is the workflow spine. Quick-resolve (brr-07) dispatches through it; auto-refresh (brr-06) must respect its in-flight window. It's also the one place a bug has patient-facing impact: Confirm sends a real Instagram DM, so the deferred-commit window is both the speed win (instant UI) and a misclick safety net — but only if fire / cancel / elapse / flush are all exactly right. Build and test the state machine before any UI layers on it.

## Files

| File | Change |
|---|---|
| `frontend/components/service-reviews/ActionToast.tsx` | **New** — portal toast host + `useActionToasts()` hook (queue, auto-dismiss, Undo action). Self-contained; inbox-scoped but promotable (P2-BRR-3). |
| `frontend/lib/service-reviews/deferred-commit.ts` | **New** — a small, testable controller: schedule / cancel / flush a keyed deferred action with a timeout. Pure-ish (inject `setTimeout`/`clearTimeout` or accept a delay + callbacks) so it unit-tests without real timers. |
| `frontend/components/service-reviews/ServiceReviewsInbox.tsx` | **Edit** — replace the direct `runAction`→refetch path for Confirm/Cancel with the optimistic + deferred-commit flow; wire Reassign to immediate optimistic-remove + reconcile; mount the toast host; flush on tab-switch/unmount. Keep `okMessage` copy + the 409 reconcile. |
| `frontend/lib/service-reviews/__tests__/deferred-commit.test.ts` | **New** — schedule fires after delay; cancel prevents fire; flush fires immediately; double-cancel safe. |

> **Reuse discipline:** the toast host composes existing primitives + tokens (no new colour literals, BR-DL-1). Do **not** add a global provider or migrate other toasts (P2-BRR-3).

## Implementation sketch

### `deferred-commit.ts` (testable controller)

```ts
export interface DeferredCommit { fire: () => void; cancel: () => void; }

/** Schedule `commit` after `delayMs`; returns handles. `onElapse` runs the real call. */
export function scheduleCommit(
  commit: () => void,
  delayMs: number,
  timers: { set: typeof setTimeout; clear: typeof clearTimeout } = { set: setTimeout, clear: clearTimeout },
): DeferredCommit {
  let done = false;
  const id = timers.set(() => { if (!done) { done = true; commit(); } }, delayMs);
  return {
    fire() { if (!done) { done = true; timers.clear(id); commit(); } },
    cancel() { if (!done) { done = true; timers.clear(id); } },
  };
}
```

### Inbox commit flow (Confirm / Cancel)

```tsx
// pendingCommits: Map<reviewId, DeferredCommit> kept in a ref.
function startDeferred(r, kind: "confirm" | "cancel", payload) {
  setReviews((rows) => rows.filter((x) => x.id !== r.id));      // optimistic remove
  const commit = scheduleCommit(() => void fireReal(r, kind, payload), UNDO_MS);
  pendingCommits.current.set(r.id, commit);
  toasts.show({
    id: r.id,
    text: kind === "confirm" ? "Booking link queued" : "Cancelled",
    undo: () => { commit.cancel(); pendingCommits.current.delete(r.id); restoreRow(r); },
    durationMs: UNDO_MS,
  });
}

async function fireReal(r, kind, payload) {
  pendingCommits.current.delete(r.id);
  try {
    await (kind === "confirm" ? postConfirmServiceStaffReview(token, r.id, {})
                              : postCancelServiceStaffReview(token, r.id, payload));
    await loadTab(activeTab);            // reconcile
  } catch (e) {
    if (status(e) === 409) { setBanner(alreadyResolved); await loadTab(activeTab); }
    else { restoreRow(r); toasts.error("Couldn't save. Restored."); }
  }
}
```

- **Restore** = re-insert the row and let `displayReviews` re-sort (Phase 1 sort handles ordering).
- **Flush:** in a `useEffect` cleanup + in `selectTab`, call `.fire()` on every entry in `pendingCommits` before changing tabs/unmounting.
- **Keep** the existing `okMessage` strings (now surfaced via toast/banner) and the 409 message.

> **Reassign:** keep the dialog; on submit, optimistically remove + call `postReassignServiceStaffReview` immediately + reconcile (no `scheduleCommit`). The teaching payload (`correctServiceHintAppend`/`wrongServiceHintAppend`) is unchanged.

### `ActionToast` host

A `fixed` portal (bottom-right), `role="status"`, mapping a queue of `{ id, text, undo?, durationMs }` to toast cards with a `Button variant="ghost" size="sm"` Undo; auto-dismiss on `durationMs`; dismiss clears from queue. Model the markup on [`NewOutputToast.tsx`](../../../../../../frontend/components/consultation/NewOutputToast.tsx) but token-styled.

## Tests (`deferred-commit.test.ts`)

- [x] `scheduleCommit` fires `commit` after `delayMs` (fake timers).
- [x] `cancel()` before elapse → `commit` never called.
- [x] `fire()` before elapse → `commit` called once, timer cleared.
- [x] `cancel()` then `fire()` (and vice-versa) → `commit` called at most once.

## Acceptance criteria

- [x] Action-toast host renders queued toasts (portal, `role="status"`, auto-dismiss, Undo button).
- [x] Confirm / Cancel optimistically remove the row + schedule the real call after the window; Undo cancels **before fire** + restores; elapse fires + reconciles (success / 409-refetch / error-restore).
- [x] Tab switch / unmount flushes in-flight commits (fires the real call), losing none.
- [x] Reassign commits immediately (optimistic remove + reconcile, no window) with the teaching payload byte-identical to Phase 1.
- [x] The 409 "already resolved → refetch" reconcile is preserved on every path.
- [x] No PHI in toast text sent off-screen; nothing logged (BR-DL-5).
- [x] `npx tsc --noEmit` + `npm run lint` clean; `deferred-commit.test.ts` green.
- [x] No backend / `page.tsx` / match-explain edits.

## Out of scope (explicit)

- Auto-refresh polling + "N new" pill (brr-06) — but leave a clear hook for it to pause around `pendingCommits`.
- Quick-resolve buttons (brr-07) — they will call `startDeferred` / the reassign path.
- Filters/sort/density (brr-08).
- True post-commit undo via a reopen endpoint (needs backend — out of scope, P2-BRR-2).

## Decision log

- **Deferred-commit, not server inverse:** no reopen endpoint exists and Confirm sends a real DM; delaying the call is the only honest, backend-free Undo (P2-BRR-2 / BR-DL-7).
- **Reassign immediate:** a deliberate multi-field action that may teach the matcher; an Undo window over a taught hint is error-prone — optimistic remove + reconcile is enough.
- **Flush rather than drop on navigation:** silently dropping a queued action would lose a staff decision; flushing (fire) is the safe default, matching Gmail-style send-undo.
- **Inbox-scoped toast:** the repo has no shared toast; a minimal local host avoids an app-wide refactor while staying promotable (P2-BRR-3).

## References

- [`frontend/components/service-reviews/ServiceReviewsInbox.tsx`](../../../../../../frontend/components/service-reviews/ServiceReviewsInbox.tsx) — `runAction` ~208–242; `onConfirm` ~244; reassign/cancel dialogs ~619–648.
- [`frontend/lib/api.ts`](../../../../../../frontend/lib/api.ts) — `postConfirm…` / `postReassign…` / `postCancel…` (~4604–4724); **no inverse endpoint**.
- [`frontend/components/consultation/NewOutputToast.tsx`](../../../../../../frontend/components/consultation/NewOutputToast.tsx) — bespoke-toast markup reference.
- Batch: [`plan-p2-booking-review-workflow-batch.md`](../plan-p2-booking-review-workflow-batch.md) · Order: [`EXECUTION-ORDER-p2-booking-review-workflow.md`](./EXECUTION-ORDER-p2-booking-review-workflow.md).

---

**Status:** `Done` (2026-05-31).  
**Done when:** acceptance criteria checked; status stamped here.
