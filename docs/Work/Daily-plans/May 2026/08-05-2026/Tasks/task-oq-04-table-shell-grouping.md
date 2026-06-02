# Task oq-04: `<OpdQueueTable>` — table shell, sticky header, status grouping

## 08 May 2026 — Batch [OPD queue redesign](../plan-opd-queue-redesign-batch.md) — Phase 2, Lane β step 2 — **M, ~4h**

---

## Task overview

The container component that renders the dense rows (`oq-03`) as a clinical-grade table:

- **Sticky 12-column header** that aligns with the row grid template.
- **Status grouping** — `Active` (waiting / called / in_consultation) always at the top, then `Done today (N) ▾` (collapsible — defaults open when `N ≤ 10`), then `No-show / skipped (N) ▾` (defaults open when `N ≤ 5`).
- **"Next up" emphasis** on the first `waiting` row.
- **Full pipeline** is rendered (no client-side row cap) — scrolling is the table body, not the page.
- **Replaces** `frontend/components/opd/DoctorQueueBoard.tsx` as the surface mounted by `OpdTodayClient`.

**Estimated time:** ~4h. Bulk is column-template plumbing (header ↔ row alignment), the disclosure component, and getting the sticky-stack right (page header + section dividers + table header).

**Status:** Drafted.

**Hard deps:** [oq-03](./task-oq-03-dense-row-component.md) shipped (the row component).

**Source:** [plan-opd-queue-redesign-batch.md § OQ-D5](../plan-opd-queue-redesign-batch.md#decision-lock-locked-2026-05-08-copied-here-for-stability).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**Why not Opus:** the pattern (sticky header + grouped sections + disclosures) is identical to `OpdQueueStrip`. Sonnet has the precedent already loaded.

**New chat?** **Yes** — fresh chat. Pre-load:
- This task file.
- `frontend/components/opd/OpdQueueDenseRow.tsx` (post-oq-03).
- `frontend/components/dashboard/cockpit/OpdQueueStrip.tsx` (precedent — copy the `Disclosure` component pattern; see lines ~91–131).
- `frontend/types/opd-doctor.ts` (post-oq-02).
- `frontend/components/opd/OpdTodayClient.tsx` (current — to plan the mount swap).

**Composer-OK sub-steps:** the `<DoctorQueueBoard>` deletion (or thin re-export) at the end can be Composer.

**Estimated turns:** 3–4 Sonnet turns.

---

## Acceptance criteria

### Component shape

- [ ] New file `frontend/components/opd/OpdQueueTable.tsx` exporting:

  ```ts
  export interface OpdQueueTableProps {
    entries: DoctorQueueSessionRow[];
    /** Density preset; default `'default'`. Persisted via `useOpdQueueDensity` (oq-12). */
    density?: OpdQueueDensity;
    /** Currently-expanded row entryId (single-row expand at a time). */
    expandedEntryId?: string | null;
    /** Handler to toggle the inline expand for a given entry. */
    onToggleExpand?: (entryId: string) => void;
    /** Handler called when a row's primary action fires (Open). Idempotently marks called via oq-10. */
    onOpenRow: (entry: DoctorQueueSessionRow) => void;
    /** Slot supplier — given an entry, returns the row's right-edge actions JSX. */
    renderActions?: (entry: DoctorQueueSessionRow) => React.ReactNode;
    /** Loading, error states for empty / error rendering. */
    isLoading: boolean;
    error: Error | null;
    onRetry: () => void;
  }

  export function OpdQueueTable(props: OpdQueueTableProps): JSX.Element;
  ```

### Layout

- [ ] **Sticky header row** with the 12 column labels matching `oq-03`'s grid template. Use the same CSS grid template definition (export it from a shared constant, e.g. `OPD_QUEUE_GRID_TEMPLATE` in `frontend/components/opd/OpdQueueGrid.ts` consumed by both files).
- [ ] **Section dividers** (`<thead>` rows or styled grid rows) between groups:

  ```
  ─── Active (8) ──────────────────────────────────────────────────────────
    [rows]
  ─── Done today (12) ────────────────────────────────────────────────── ▾
    [rows]
  ─── No-show / skipped (3) ──────────────────────────────────────────── ▾
    [rows]
  ```

  - Each divider has the section label, count, and (for collapsible sections) a chevron. Click toggles the section.
  - Active section is **never** collapsible.
- [ ] Sticky stacking (top-to-bottom):
  1. Page header (handled by `OpdTodayClient`).
  2. Session toolbar from `oq-11` (mounted above the table).
  3. Filter chips from `oq-07` (above the table header).
  4. **Table column header (sticky here).**
  5. Body — scrolls inside `max-h-[calc(100vh-${stack}px)]`. Pick a height that leaves room for the action bar.
- [ ] Use the codebase's existing sticky utility (`sticky top-0 z-…`); follow the cockpit batch's sticky precedent for z-index ordering.

### Grouping logic

- [ ] Compute three buckets in a memoised helper:

  ```ts
  function groupEntries(entries: DoctorQueueSessionRow[]) {
    const active = entries
      .filter((e) => ['waiting', 'called', 'in_consultation'].includes(e.queueStatus))
      .sort(compareActive); // see below
    const done = entries
      .filter((e) => e.queueStatus === 'completed')
      .sort((a, b) => a.tokenNumber - b.tokenNumber);
    const missed = entries
      .filter((e) => ['missed', 'skipped', 'cancelled'].includes(e.queueStatus))
      .sort((a, b) => a.tokenNumber - b.tokenNumber);
    return { active, done, missed };
  }
  ```

  Active sort: `in_consultation` first, then `called`, then `waiting`, all secondarily by `tokenNumber` ascending. (The cockpit strip's `sortGroup` from status meta is the canonical source — reuse if convenient.)

### "Next up" emphasis

- [ ] In the `active` bucket, find the **first row with `queueStatus === 'waiting'`** by `tokenNumber` ascending. Pass `isNextUp={true}` to that one row only.
- [ ] If `active` has no `waiting` rows, no row gets the next-up treatment.

### Disclosure component

- [ ] Define a local `Disclosure` component (or import one — match the `OpdQueueStrip` precedent at lines ~91–131; copying that component into a shared location like `frontend/components/ui/Disclosure.tsx` is **optional** but encouraged):

  ```ts
  interface DisclosureProps {
    label: string;        // "Done today"
    count: number;
    defaultOpen: boolean;
    children: React.ReactNode;
  }
  function Disclosure(props: DisclosureProps): JSX.Element;
  ```

  Behavior:
  - `Done today` → `defaultOpen={done.length <= 10}`.
  - `No-show / skipped` → `defaultOpen={missed.length <= 5}`.
  - State is preserved via component-local `useState` (no URL persistence in this task — `oq-07` may upgrade later).
  - Use the CSS grid row trick from cockpit strip (`grid-rows-[1fr]` ↔ `grid-rows-[0fr]`) for smooth height transition.

### Empty / loading / error states

- [ ] **Loading + empty** (initial fetch, no entries yet): `<Skeleton>` rows × 5.
- [ ] **Loaded + empty** (no rows for the day): centered card "No queue for this day" + helper line "Bookings in queue mode will appear here." (Move the existing copy from `DoctorQueueBoard` into the new component.)
- [ ] **Error** (`error != null` and `entries.length === 0`): destructive notice with retry button — text: "Couldn't load the queue. Tap to retry."
- [ ] **Stale-while-revalidate** (`error != null` but stale `entries.length > 0`): render the stale list + a top-row banner: `Couldn't refresh just now. Last update: <relative-time>. [Retry]`. Don't drop the data on transient failure.

### Replacement / mount swap

- [ ] Edit `frontend/components/opd/OpdTodayClient.tsx`:
  - Replace `import DoctorQueueBoard from "./DoctorQueueBoard";` with `import { OpdQueueTable } from "./OpdQueueTable";`.
  - Replace `<DoctorQueueBoard token={token} sessionDate={sessionDate} />` with `<OpdQueueTable …props />` where the props are wired via either:
    - **Option A (preferred for this task):** keep `DoctorQueueBoard` as a thin wrapper that calls `useOpdSnapshot` (deferred to `oq-06`) + renders `<OpdQueueTable>`. Pass-through.
    - **Option B (cleaner):** delete `DoctorQueueBoard.tsx` entirely; `OpdTodayClient` calls a small data-source helper directly (likely `useOpdSnapshot` post-`oq-06`).
  - **Pick A in this task** — keeps the diff small. `oq-06` will collapse the wrapper.

### Files modified / deleted

- [ ] `frontend/components/opd/DoctorQueueBoard.tsx` becomes a ~30-LOC wrapper:
  - Calls a temporary inline data-source (the existing `getDoctorOpdQueueSession` polling) until `oq-06` migrates to `useOpdSnapshot`.
  - Renders `<OpdQueueTable>` with the data.
- [ ] **Old action handlers** (`runAction(entryId, "called" | "skipped")`) are kept inside the wrapper temporarily and passed in via `renderActions`. `oq-10` will rewrite this whole action surface; for `oq-04` it's enough to render a placeholder Open button.

### Type-check + lint

- [ ] `cd frontend && npx tsc --noEmit && npx next lint` passes.

---

## Out of scope

- **Filter chips** — `oq-07`.
- **Search box** — `oq-08`.
- **Snapshot wiring (`useOpdSnapshot`)** — `oq-06`.
- **Action menu contents** — `oq-10`. This task ships a placeholder Open button per row.
- **Inline expand panel** — `oq-05`.
- **Density toggle UI** — `oq-12`. This task accepts a `density` prop and uses `'default'` as fallback.
- **Mobile fallback** — `oq-12`.
- **Telemetry** — `oq-14`.

---

## Files expected to touch

**New:**
- `frontend/components/opd/OpdQueueTable.tsx` (~280 LOC)
- `frontend/components/opd/OpdQueueGrid.ts` (~30 LOC — exported grid template constant + density helpers)

**Modified:**
- `frontend/components/opd/OpdTodayClient.tsx` (~5 LOC — import swap + prop wiring)
- `frontend/components/opd/DoctorQueueBoard.tsx` (~80 LOC delta — collapse to a thin wrapper that delegates rendering to `<OpdQueueTable>`)
- `frontend/components/opd/OpdQueueDenseRow.tsx` (1 LOC — import the shared grid template constant if it lives in the new shared file)

**Deleted:** none in this task; `DoctorQueueBoard.tsx` is fully retired in `oq-06`.

---

## Notes / open decisions

1. **Why keep `DoctorQueueBoard` as a wrapper for one task.** Letting `oq-04` ship without depending on `useOpdSnapshot` migration (which is `oq-06`) keeps the lane parallelism intact. `oq-06` is intentionally tiny and folds the wrapper away.
2. **Sticky stack vs. virtualized list.** No virtualization in v1. Even 200 rows render fine with native scrolling. If perf becomes a problem we revisit with `react-virtual`.
3. **Why active is never collapsible.** It's the doctor's actionable work. Collapsing it would defeat the entire density goal.
4. **Section divider count rendering.** Update on every snapshot refresh — counts are derived from `entries`, not stored.
5. **Grid template constant.** Live in `frontend/components/opd/OpdQueueGrid.ts` so row + header consume the same widths. Otherwise alignment drift is inevitable.

---

## References

- **Source plan:** [plan-opd-queue-redesign-batch.md § OQ-D5](../plan-opd-queue-redesign-batch.md)
- **Disclosure precedent:** `frontend/components/dashboard/cockpit/OpdQueueStrip.tsx § Disclosure`
- **Row component:** [task-oq-03-dense-row-component.md](./task-oq-03-dense-row-component.md)
- **Mount surface:** `frontend/components/opd/OpdTodayClient.tsx`

---

**Owner:** TBD
**Created:** 2026-05-08
**Status:** Drafted
