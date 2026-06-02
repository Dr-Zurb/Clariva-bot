# Task oq-10: Row primary action + overflow menu + row click target

## 08 May 2026 — Batch [OPD queue redesign](../plan-opd-queue-redesign-batch.md) — Phase 4, Lane ε step 1 — **M, ~4h**

---

## Task overview

Replace the current `[Open] [Call] [Skip]` triplet with **one** primary action (Open chevron) plus a **single** overflow menu (`⋯`) carrying the four real outcomes. The whole row becomes a click target. Clicking Open (or the row) auto-marks `waiting → called` (idempotent — already-called rows don't re-fire) and routes to the appointment.

**Why one button instead of two:** "Call" today is a state marker only — it triggers no patient notification (verified in code: `backend/src/services/opd-doctor-service.ts § doctorUpdateQueueEntryStatus` only mutates `opd_queue_entries.status`). So `Open` and `Call` were two clicks doing one thing. **Why no Skip button:** the bare Skip is destructive-feeling and ambiguous — the doctor actually has four real outcomes (`Mark called silently`, `Requeue after current`, `Send to end of queue`, `Mark as no-show`). Those go in the overflow.

**Estimated time:** ~4h. Bulk is the menu component, optimistic state, error rollback, and the confirm-or-not decision per action.

**Status:** Drafted.

**Hard deps:** [oq-03](./task-oq-03-dense-row-component.md) shipped (the row exposes the `actions` slot), [oq-09](./task-oq-09-frontend-action-clients.md) shipped (clients for `requeue` + `markNoShow`).

**Source:** [plan-opd-queue-redesign-batch.md § OQ-D2, OQ-D3](../plan-opd-queue-redesign-batch.md#decision-lock-locked-2026-05-08-copied-here-for-stability).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**New chat?** **Yes**. Pre-load:
- This task file.
- `frontend/components/opd/OpdQueueDenseRow.tsx` (post-oq-03 — the `actions` slot signature).
- `frontend/components/opd/OpdQueueTable.tsx` (post-oq-04 — `renderActions` prop).
- `frontend/lib/api.ts` (post-oq-09 — confirm `postDoctorRequeueQueueEntry` and `postDoctorMarkNoShow` exist).
- `frontend/components/ui/dropdown-menu.tsx` (existing UI primitive).

**Composer-OK sub-steps:** none.

**Estimated turns:** 3–4 Sonnet turns.

---

## Acceptance criteria

### Component shape

- [ ] New file `frontend/components/opd/OpdQueueRowActions.tsx`:

  ```ts
  export interface OpdQueueRowActionsProps {
    entry: DoctorQueueSessionRow;
    /** Doctor JWT for the action calls. */
    token: string;
    /** Triggered on Open (chevron) click; the parent navigates. */
    onOpen: (entry: DoctorQueueSessionRow) => void;
    /** Refetch the snapshot after a successful mutation; useOpdSnapshot.refetch. */
    onMutationSuccess: () => void;
    /** Optional confirm dialog renderer (sonner / built-in confirm dialog from the codebase).
     *  Defaults to `window.confirm` for v1 if no codebase pattern is found. */
    confirm?: (opts: { title: string; description?: string }) => Promise<boolean>;
  }

  export function OpdQueueRowActions(props: OpdQueueRowActionsProps): JSX.Element;
  ```

### Visible affordances (right-aligned in the row's `actions` slot)

- [ ] **Primary action — `Open` chevron** (`<ChevronRight>` icon, ghost button, ~28 px square):
  - On click: stop propagation (so the wrapping row click doesn't double-fire); call `onOpen(entry)`.
  - Tooltip: `"Open patient (and mark as called)"` if `queueStatus === 'waiting'`; otherwise just `"Open patient"`.
- [ ] **Overflow — `⋯` button** (`<MoreHorizontal>` icon, ghost button, ~28 px square):
  - Anchors a `<DropdownMenu>` with the four items below.
  - On click: stop propagation.

### Overflow menu items

The menu items adapt to the row's current status (don't show actions that don't make sense):

| Item | Show when | Action | Confirm? |
|---|---|---|---|
| `Mark called silently` | `queueStatus === 'waiting'` | `patchDoctorQueueEntry(token, entryId, 'called')` | No |
| `Requeue after current` | `queueStatus ∈ {waiting, called, skipped, missed}` | `postDoctorRequeueQueueEntry(token, entryId, 'after_current')` | No |
| `Send to end of queue` | `queueStatus ∈ {waiting, called, skipped, missed}` | `postDoctorRequeueQueueEntry(token, entryId, 'end_of_queue')` | No |
| `Mark as no-show` | `appointmentStatus ∈ {pending, confirmed}` AND `queueStatus !== 'completed'` | `postDoctorMarkNoShow(token, appointmentId)` | **Yes** (irreversible from this surface) |

- [ ] Items are rendered with their lucide icons: `BellRing` for Mark called, `Undo2` for Requeue after current, `ChevronsRight` for Send to end, `X` (destructive style) for Mark as no-show.
- [ ] When **no items** are applicable for the row, render the overflow button as **disabled** (faded, no popover). E.g. for an already-completed row.

### Optimistic state + error rollback

- [ ] Each mutation flow:
  1. Set local `pending` state (disable both buttons, show a small spinner inside the chevron).
  2. Call the api function.
  3. On success: clear `pending`, call `onMutationSuccess()` (parent refetches the snapshot — the row re-renders with the new status).
  4. On error: clear `pending`, surface a toast `"Couldn't update. Please retry."` with the error message; **do not** call `onMutationSuccess` (no refetch).
- [ ] No optimistic UI for the row itself in v1 — the snapshot refetch is fast (≤200 ms locally) and the optimism complexity isn't worth it. Just spinner + refetch.

### `Open` click idempotent call-then-navigate

- [ ] `onOpen` handler in the parent (`OpdTodayClient`):
  1. If `entry.queueStatus === 'waiting'`, fire-and-forget `patchDoctorQueueEntry(token, entry.entryId, 'called')`. **Do not await.**
  2. Immediately `router.push(/dashboard/appointments/${entry.appointmentId})`.
  3. The snapshot refetch on next poll picks up the new `called` status; if the navigation lands on the appointment detail page first, that page's own data fetch will read the updated status.
- [ ] Idempotency: when `entry.queueStatus !== 'waiting'`, **skip the call** — already-called / in-consult / completed rows don't re-fire.

### Whole-row click target

- [ ] `OpdQueueDenseRow.tsx` already accepts `onOpen` (`oq-03`); this task wires the same handler from the parent.
- [ ] The row's grid container is `role="button"`, `tabIndex={0}`, `onKeyDown` for `Enter` → `onOpen(entry)`.

### Confirm dialog (Mark as no-show only)

- [ ] Use whatever confirm primitive the codebase has (search `rg "ConfirmDialog|AlertDialog" frontend/components/`). If none exists, fall back to `window.confirm("Mark ${patientName} as no-show? They'll be removed from today's queue.")` for v1.
- [ ] On user-confirm = false, do nothing. Don't even fire the api call.

### Wiring into table

- [ ] Update `OpdQueueTable`'s `renderActions` prop default in `OpdTodayClient`:

  ```tsx
  renderActions={(entry) => (
    <OpdQueueRowActions
      entry={entry}
      token={token}
      onOpen={handleOpenRow}
      onMutationSuccess={refetchSnapshot}
    />
  )}
  ```

- [ ] `handleOpenRow` is the idempotent call-then-navigate helper; lives in `OpdTodayClient` so the row click and the chevron click share it.

### Accessibility

- [ ] Each menu item has `aria-label` if its visual text is ambiguous (Mark as no-show should literally say "Mark patient as no-show").
- [ ] Destructive item (`Mark as no-show`) uses the `destructive` variant of the menu primitive if available (red text + maybe a leading icon).
- [ ] Keyboard nav inside the overflow menu uses the existing `<DropdownMenu>` primitive's nav (typically arrow keys + Enter).

### Type-check + lint

- [ ] Clean.

---

## Out of scope

- **Bulk actions on multiple rows** — out of batch.
- **Reordering rows by drag** — out of batch.
- **Custom confirm dialog component** — use existing primitive or `window.confirm`.
- **Telemetry events** — `oq-14` adds them on top of this task's hooks.

---

## Files expected to touch

**New:**
- `frontend/components/opd/OpdQueueRowActions.tsx` (~180 LOC)

**Modified:**
- `frontend/components/opd/OpdTodayClient.tsx` (~30 LOC — wire `handleOpenRow` + `renderActions`)
- `frontend/components/opd/OpdQueueDenseRow.tsx` (~5 LOC — confirm chevron column hover-show CSS is correct after the slot fills)

---

## Notes / open decisions

1. **Why fire-and-forget `called`.** The user-perceived primary action is "open the chart". Awaiting the network round-trip would add ~150 ms to the navigation. The mutation is safe (idempotent server-side; backend already filters out invalid current statuses).
2. **Why no confirm on Requeue.** Both requeue strategies are reversible (the doctor can re-call via the chevron). No confirm = faster flow.
3. **Confirm only on mark-no-show.** It flips `appointment.status → 'no_show'`, which can fan out to billing / patient notification (search `rg "no_show" backend/src/services` to verify). Worth a click.
4. **`queueStatus === 'in_consultation'` rows.** The chevron still works (re-opens the chart), but no requeue / call / no-show options apply. The overflow button renders disabled for these rows.
5. **Visual: Open chevron always visible (not hover-only)?** Per `oq-03`'s spec the action slot is hover-only. **Override here:** the Open chevron stays visible always; the `⋯` button is hover-only. The chevron is the primary affordance — always-on signals the row is interactive. Update `oq-03`'s `actions` slot rendering accordingly (a tiny edit; coordinate via the lane lock).

---

## References

- **Source plan:** [plan-opd-queue-redesign-batch.md § OQ-D2, OQ-D3](../plan-opd-queue-redesign-batch.md)
- **Backend handlers (read-only):** `backend/src/controllers/opd-doctor-controller.ts § patchQueueEntryHandler, postRequeueQueueEntryHandler, postMarkNoShowHandler`
- **API clients:** [task-oq-09-frontend-action-clients.md](./task-oq-09-frontend-action-clients.md)
- **Row slot:** [task-oq-03-dense-row-component.md](./task-oq-03-dense-row-component.md)
- **Table renderer:** [task-oq-04-table-shell-grouping.md](./task-oq-04-table-shell-grouping.md)

---

**Owner:** TBD
**Created:** 2026-05-08
**Status:** Drafted
