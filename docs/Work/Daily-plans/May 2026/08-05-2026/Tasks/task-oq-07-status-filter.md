# Task oq-07: Status segmented control + counts

## 08 May 2026 — Batch [OPD queue redesign](../plan-opd-queue-redesign-batch.md) — Phase 3, Lane γ step 0 — **S, ~4h**

---

## Task overview

A horizontal segmented control above the queue table that lets the doctor filter visible rows by status. Each chip shows a live count and the chips are derived from the canonical `OpdStatus` enum so adding a new status anywhere in the system auto-updates the filter UI.

**Default selection: `All`.** Selecting a single status filters the table to entries of that status (still respecting the table's grouping; selected status's section auto-expands; other sections hide).

Filter state is persisted via URL search params (`?status=waiting`) so the doctor can refresh, share a link with reception ("here are the waiting patients right now"), or bookmark a view.

**Estimated time:** ~4h. Bulk is the count derivation + URL-param hookup + visual polish to match cockpit segmented controls.

**Status:** Shipped (2026-05-08).

**Hard deps:** [oq-04](./task-oq-04-table-shell-grouping.md) shipped (the table shell exposes the data we filter against).

**Source:** [plan-opd-queue-redesign-batch.md § OQ-D5](../plan-opd-queue-redesign-batch.md#decision-lock-locked-2026-05-08-copied-here-for-stability).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**New chat?** **Yes**. Pre-load:
- This task file.
- `frontend/components/opd/OpdQueueTable.tsx` (post-oq-04).
- `frontend/lib/consultation/opd-status-meta.ts` (`OpdStatus` enum + meta).
- An existing segmented-control / filter-chip in the codebase if any (search `rg "segmented|tabs.*filter" frontend/components`); otherwise build a `<button>`-based group following the cockpit batch's pill style.

**Composer-OK sub-steps:** none.

**Estimated turns:** 2–3 Sonnet turns.

---

## Acceptance criteria

### Component shape

- [ ] New file `frontend/components/opd/OpdQueueStatusFilter.tsx`:

  ```ts
  export type OpdQueueStatusFilterValue =
    | 'all'
    | 'waiting'
    | 'called'
    | 'in_consultation'
    | 'completed'
    | 'no_show'   // groups missed + skipped + cancelled
    | 'skipped';  // explicit, just skipped (rare; for audit)

  export interface OpdQueueStatusFilterProps {
    value: OpdQueueStatusFilterValue;
    onChange: (next: OpdQueueStatusFilterValue) => void;
    /** Counts per filter value, computed by the parent. */
    counts: Record<OpdQueueStatusFilterValue, number>;
  }

  export function OpdQueueStatusFilter(props: OpdQueueStatusFilterProps): JSX.Element;
  ```

- [ ] **Note on `no_show`:** the filter chip groups `missed + skipped + cancelled` because doctors think of them as one bucket ("didn't make it"). The dedicated `skipped` chip is intentionally **not** rendered by default — see Notes #2.

### Visible chips

- [ ] Render this exact set, in this order, separated by 6 px:

  | Chip label | `value` | Count source |
  |---|---|---|
  | `All` | `'all'` | `entries.length` |
  | `Waiting` | `'waiting'` | filtered by `queueStatus === 'waiting'` |
  | `Called` | `'called'` | `queueStatus === 'called'` |
  | `In consult` | `'in_consultation'` | `queueStatus === 'in_consultation'` |
  | `Done` | `'completed'` | `queueStatus === 'completed'` |
  | `No-show` | `'no_show'` | `queueStatus ∈ {missed, skipped, cancelled}` |

- [ ] Each chip renders as `${label} · ${count}` with `font-tabular-nums` on the count. Zero counts render the chip in muted style but **stay visible** (so the doctor knows "Waiting · 0" — none waiting right now).
- [ ] The active chip uses `variant="default"` (filled); inactive uses `variant="outline"`.
- [ ] On `<sm` breakpoints, scrollable horizontally (`overflow-x-auto`); on `≥sm`, wrap-to-second-line is acceptable.

### Hook + URL-param wiring

- [ ] New hook `frontend/hooks/useOpdQueueFilters.ts`:

  ```ts
  export interface OpdQueueFiltersState {
    status: OpdQueueStatusFilterValue;
    setStatus: (next: OpdQueueStatusFilterValue) => void;
    /** Search query — wired in oq-08; this hook owns the URL param surface. */
    q: string;
    setQ: (next: string) => void;
  }

  export function useOpdQueueFilters(): OpdQueueFiltersState;
  ```

  - Reads from URL `?status=…&q=…` on mount.
  - `setStatus` / `setQ` push a new history entry with `router.replace` so back-button doesn't get noisy.
  - Defaults: `status='all'`, `q=''`.
  - `q` is owned here so `oq-08` is a one-line wiring task.

### Filter application in `OpdQueueTable`

- [ ] `OpdQueueTable` accepts an optional `filter: OpdQueueStatusFilterValue` prop and applies it before grouping. **For non-`all` filters:**
  - Only the matching status's section is rendered.
  - The other group dividers are hidden.
  - Selected section is auto-expanded regardless of count thresholds.
- [ ] When `filter === 'all'`, table renders all three groups exactly as `oq-04` did.
- [ ] **Counts are computed once** in `OpdTodayClient` from `[...active, ...done, ...missed]` and passed to both the filter component AND the table.

### Mount in `OpdTodayClient`

- [ ] Mount `<OpdQueueStatusFilter>` directly above the table, **inside** the sticky stack so it stays visible while scrolling. (Below the page header but above the table column header.)
- [ ] Pass `filter` from `useOpdQueueFilters()` into `<OpdQueueTable filter={…} />`.

### Empty / partial states

- [ ] When the active filter results in zero rows, the table renders a per-filter empty state (handled in `oq-13`'s spec — leave the wire in place, the message comes from a helper that defaults to `"No matching patients."`).

### Telemetry-friendly callback

- [ ] `OpdQueueStatusFilter` doesn't call any analytics directly; the parent (`OpdTodayClient`) wraps `setStatus` with a telemetry hook (`oq-14`).

### Accessibility

- [ ] Implement as `role="tablist"` with each chip as `role="tab"` and `aria-selected`. Keyboard nav: `←` / `→` move focus across chips; `Enter` / `Space` selects.
- [ ] Each chip has visible text — color is never the sole signal.

### Type-check + lint

- [ ] Clean.

---

## Out of scope

- **Search box** — `oq-08` (this task ships the `q` state in the shared hook).
- **Mode / consultation-type / service-key / waiting-overdue filters** — out of batch (track in inbox).
- **Per-filter empty-state copy refinement** — `oq-13`. This task wires a default fallback.
- **Telemetry events** — `oq-14`.

---

## Files expected to touch

**New:**
- `frontend/components/opd/OpdQueueStatusFilter.tsx` (~110 LOC)
- `frontend/hooks/useOpdQueueFilters.ts` (~70 LOC)

**Modified:**
- `frontend/components/opd/OpdQueueTable.tsx` (~15 LOC — accept `filter` prop, apply before grouping)
- `frontend/components/opd/OpdTodayClient.tsx` (~10 LOC — mount filter, pass state)

---

## Notes / open decisions

1. **`no_show` chip lumping.** Three statuses (`missed`, `skipped`, `cancelled`) all look the same to a doctor scanning "who didn't make it". Lumping reduces chip count from 9 to 6.
2. **No standalone `Skipped` chip.** Filtering on `skipped` alone is a rare audit case; if a doctor needs it, a query param `?status=skipped` still works (the `OpdQueueStatusFilterValue` enum includes it). It's just not rendered as a chip in v1.
3. **Why the same hook owns both `status` and `q`.** Both write to the same URL param surface; co-locating means we only call `useSearchParams()` / `router.replace` once per change.
4. **`router.replace` not `router.push`.** Filter clicks shouldn't fill the back-button history with intermediate states; replacing keeps the user's history clean.
5. **Counts computation vs. memoization.** With ~80 entries the loop is a few microseconds; no `useMemo` needed in v1. If the OPD pages ever serve large clinics, revisit.

---

## References

- **Source plan:** [plan-opd-queue-redesign-batch.md § OQ-D5](../plan-opd-queue-redesign-batch.md)
- **Status enum:** `frontend/lib/consultation/opd-status-meta.ts § OpdStatus`
- **Table shell:** [task-oq-04-table-shell-grouping.md](./task-oq-04-table-shell-grouping.md)
- **Search box (downstream):** [task-oq-08-search-box.md](./task-oq-08-search-box.md)

---

**Owner:** TBD
**Created:** 2026-05-08
**Status:** Drafted
