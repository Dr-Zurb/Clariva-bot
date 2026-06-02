# Task oq-11: Session toolbar (broadcast delay + offer early join)

## 08 May 2026 — Batch [OPD queue redesign](../plan-opd-queue-redesign-batch.md) — Phase 5, Lane ζ step 0 — **S, ~4h**

---

## Task overview

A horizontal toolbar above the table that exposes session-level actions doctors today can only reach from individual appointment detail pages: **Broadcast delay** (sets `opd_session_delay_minutes` so patients see a "running late" banner) and **Offer early join** (sets `opd_early_invite_expires_at` so the next eligible patient can accept an early call-in). Both are already wired in `lib/api.ts` (`postDoctorSessionDelay`, `postDoctorOfferEarlyJoin`); this task just surfaces them from the OPD queue page where doctors actually operate.

Also surfaces the **last-updated indicator** (from `oq-06`'s `lastUpdatedAt`) and a **manual refresh button** in the same toolbar so the doctor can confirm the queue is fresh without opening dev tools.

**Estimated time:** ~4h. Bulk is the popovers and the apply-to-which-appointment decision.

**Status:** Drafted.

**Hard deps:** [oq-04](./task-oq-04-table-shell-grouping.md) shipped (mount target), [oq-09](./task-oq-09-frontend-action-clients.md) shipped (so the toolbar can also call the new requeue/no-show clients if needed; mostly it uses the existing offer/delay clients).

**Source:** [plan-opd-queue-redesign-batch.md § Phase 5](../plan-opd-queue-redesign-batch.md#phase-5--session-controls--density--polish-4-tasks--1-dev-day).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**New chat?** **Yes**. Pre-load:
- This task file.
- `frontend/components/opd/OpdQueueTable.tsx` (post-oq-04).
- `frontend/components/opd/OpdTodayClient.tsx` (post-oq-06).
- `frontend/lib/api.ts § postDoctorOfferEarlyJoin, postDoctorSessionDelay`.
- `frontend/components/ui/popover.tsx`, `frontend/components/ui/button.tsx`.

**Composer-OK sub-steps:** none.

**Estimated turns:** 3–4 Sonnet turns.

---

## Acceptance criteria

### Component shape

- [ ] New file `frontend/components/opd/OpdQueueSessionToolbar.tsx`:

  ```ts
  export interface OpdQueueSessionToolbarProps {
    token: string;
    /** Snapshot data — used to (a) find the next eligible appointment for "Offer early join",
     *  (b) decide whether either action is currently sensible. */
    active: DoctorQueueSessionRow[];
    /** Wall-clock of last successful poll (ms epoch); from useOpdSnapshot. */
    lastUpdatedAt: number | null;
    /** Manual refetch handler from useOpdSnapshot. */
    onRefresh: () => void;
    /** Snapshot mutation success handler — same as oq-10 uses. */
    onMutationSuccess: () => void;
  }

  export function OpdQueueSessionToolbar(props: OpdQueueSessionToolbarProps): JSX.Element;
  ```

### Layout

- [ ] Single horizontal row, ~40 px tall, sticky directly under the page header (above the filter chips and table column header). Z-index just below the column header.
- [ ] Three regions, left → right:
  1. **Left** — `Broadcast delay` button + `Offer early join` button.
  2. **Center** — empty / flex-grow.
  3. **Right** — `Last updated 12 s ago` text + manual `Refresh` icon button.

### Broadcast delay

- [ ] `Broadcast delay` button opens a `<Popover>` with:
  - Numeric stepper (or quick-pick chips: `5 min`, `10 min`, `15 min`, `30 min`, plus a custom input).
  - `Apply` button — calls `postDoctorSessionDelay(token, ?, minutes)` for **the current `in_consultation` appointment** if one exists; otherwise falls back to the **first `waiting` appointment**. (The backend stores delay on a per-appointment row but patients reading the snapshot inherit the broadcast.)
  - `Clear` button — resets to `null`.
- [ ] Default delay value when popover opens = current value if any (best-effort: read from any active row's `appointment` object if exposed; otherwise blank).
- [ ] On apply: optimistic spinner on the button; refetch via `onMutationSuccess` on success; toast on error.

### Offer early join

- [ ] `Offer early join` button opens a `<Popover>` with:
  - Read-only label `"Offer early join to: ${nextEligible.patientName} (token #${nextEligible.tokenNumber})"` where `nextEligible` is the first row with `appointmentStatus ∈ {pending, confirmed}` AND `queueStatus === 'waiting'`.
  - Numeric input `Expires in (minutes)` defaulting to `5`.
  - `Send invite` button — calls `postDoctorOfferEarlyJoin(token, nextEligible.appointmentId, { expiresInMinutes })`.
- [ ] When no eligible patient exists, the button is **disabled** with tooltip `"No eligible upcoming patient to invite."`.

### Last updated + manual refresh

- [ ] Render `Last updated X ago` using a relative-time helper (search `rg "formatRelativeTime|timeAgo" frontend/lib`); if none, hardcode a tiny helper:

  ```ts
  function timeAgo(ms: number | null): string {
    if (ms == null) return '—';
    const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    return `${Math.floor(m / 60)}h ago`;
  }
  ```

  Re-render the label every 5 s via a tiny interval **owned by the toolbar** (not the snapshot hook).

- [ ] `Refresh` icon button (`<RefreshCcw>` from lucide). On click → `onRefresh()`. Disabled while a refetch is in flight (parent passes a flag or the toolbar tracks a local `pending`).

### Mount in `OpdTodayClient`

- [ ] Mount `<OpdQueueSessionToolbar>` directly under the page header / above the filter chips:

  ```tsx
  <OpdQueueSessionToolbar
    token={token}
    active={active}
    lastUpdatedAt={lastUpdatedAt}
    onRefresh={retry}
    onMutationSuccess={retry}
  />
  ```

### Accessibility

- [ ] Each popover has `role="dialog"`, `aria-label="Broadcast delay"` / `"Offer early join"`.
- [ ] `Refresh` button has `aria-label="Refresh queue"` and a tooltip.

### Type-check + lint

- [ ] Clean.

---

## Out of scope

- **New backend endpoints** — both actions are already wired.
- **Per-row "Offer early join" / "Set delay" actions** — these were already on the appointment detail page; this task surfaces them at the session level, not per-row.
- **Auto-refresh while a popover is open** — pause the visibility-aware polling? **No** — the popover is small; a stale next-eligible patient is fine because the row index in active is computed at click time.
- **Telemetry** — `oq-14` adds events.

---

## Files expected to touch

**New:**
- `frontend/components/opd/OpdQueueSessionToolbar.tsx` (~220 LOC)

**Modified:**
- `frontend/components/opd/OpdTodayClient.tsx` (~10 LOC — mount the toolbar, pass props)

---

## Notes / open decisions

1. **Where the broadcast delay applies.** The backend stores it on `appointments.opd_session_delay_minutes` (per-appointment column), but patients reading the OPD snapshot inherit it via the snapshot hint. Setting it on any active appointment is sufficient. Picking the in-consult one (if any) means the cleanup happens naturally when that consultation ends.
2. **Why a separate manual refresh.** Even though the snapshot polls every 30 s, doctors sometimes click around between waiting-area and screen and want immediate confirmation. The button is cheap; users expect it.
3. **Why include `Refresh` in the toolbar instead of a corner of the table.** Users associate the freshness indicator with the data ("when did this update?"); the action sits next to its evidence.
4. **`onRefresh` vs. `retry`.** They're the same call from `useOpdSnapshot` — `retry()`. Naming reflects the semantic.

---

## References

- **Existing api clients (already wired):** `frontend/lib/api.ts § postDoctorOfferEarlyJoin, postDoctorSessionDelay`
- **Snapshot hook:** `frontend/hooks/useOpdSnapshot.ts` (post-oq-06 — `lastUpdatedAt` + `retry`)
- **Backend service:** `backend/src/services/opd-doctor-service.ts § doctorOfferEarlyJoin, doctorSetSessionDelay`

---

**Owner:** TBD
**Created:** 2026-05-08
**Status:** Drafted
