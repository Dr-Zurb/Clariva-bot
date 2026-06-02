# Task sl-03: Slot status filter chips + search box wiring

## 15 May 2026 — Batch [OPD Slot Hub](../plan-opd-slot-hub-batch.md) — Wave 2, Lane α step 1 — **S, ~1.5h**

---

## Task overview

Wire the URL-backed status filter chips + search box into the slot-mode hub. Mirror the queue-mode `OpdQueueStatusFilter` pattern — same chip shell, same accessibility, same telemetry — but with the slot-status vocabulary from [DL-4](../../../../Product%20plans/plan-opd-slot-hub.md#decision-locks-dl-1--dl-12) (6 chips: `All / Upcoming / Late / In consult / Done / Missed`).

**Reuse `OpdQueueSearchBox.tsx` as-is** — search semantics (name / phone / MRN / reason match) are identical for slot mode.

**Extend `useOpdQueueFilters.ts`** — add `running_late` and `cancelled` to the URL-backed status union. **Do NOT fork the hook** — both modes share one URL contract (`?status=&q=`); the union is just wider.

Mounts under the slot branch of `OpdTodayClient.tsx` (post-sl-02), replacing the filter-strip Skeleton placeholder.

**Estimated time:** ~1.5h (0.5h hook union widening + tests, 0.5h chip component, 0.5h mount + verification).

**Status:** Pending.

**Hard deps:** sl-02 (slot toolbar mounted; the slot branch's skeleton placeholders exist).

**Source:** [plan-opd-slot-hub-batch.md § Wave 2](../plan-opd-slot-hub-batch.md#wave-2--hub-ui-4-tasks-9h-single-sequential-lane) + `S1.3` and `DL-4` in [Product plans/plan-opd-slot-hub.md](../../../../Product%20plans/plan-opd-slot-hub.md).

---

## Model & execution guidance

**Recommended model:** **Auto** (default). Per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md) TL;DR rule #1 — Auto is the execution default. This is a small task: a near-copy of `OpdQueueStatusFilter` + a 5-line additive change to `useOpdQueueFilters`'s status union. Trivially well-spec'd; Auto's sweet spot. **Not on the hard-rules list.**

**Per-message escalation rule:** unlikely to be needed at this size; if Auto stalls, escalate that **one message** to Opus 4.7 Extra High.

**Manual-Sonnet fallback:** only if A/B-testing.

**New chat?** **Yes** — fresh chat. Pre-load:

- This task file.
- `frontend/components/opd/OpdQueueStatusFilter.tsx` (the entire ~180 LOC — the chip pattern; sl-03 ports it almost verbatim).
- `frontend/hooks/useOpdQueueFilters.ts` (the URL-backed filter hook — sl-03 widens the status union here).
- `frontend/components/opd/OpdQueueSearchBox.tsx` (used as-is in slot mode; pre-load for context only).
- `frontend/components/opd/OpdTodayClient.tsx` (post-sl-02 — mount point for the new chip + search; the skeleton placeholder is at lines ~440 today).
- `frontend/types/opd-doctor.ts` (post-sl-01 — `SlotStatus` and `SlotSessionCounts` shapes).
- `frontend/components/opd/opdQueueTelemetry.ts` (telemetry event shape — `opd_queue.filter_changed` is already wired; sl-03 will fire `opd_slot.filter_changed` via the prefix-aware track call).
- Source plan §DL-4.

**Estimated turns:** 2–3 turns (1 turn hook widening + chip component, 1 turn mount in `OpdTodayClient`, 1 turn verification).

---

## Acceptance criteria

### Step 1 — Widen `useOpdQueueFilters` status union

- [ ] In `frontend/hooks/useOpdQueueFilters.ts`, extend the `OpdQueueStatusFilterValue` (or whatever it's named — match the existing export) to include `running_late` and `cancelled`:

  ```ts
  export type OpdStatusFilterValue =
    | 'all'
    | 'waiting'             // queue-only; ignored by slot
    | 'called'              // queue-only; ignored by slot
    | 'upcoming'            // slot-only; rolls grace into upcoming per DL-4
    | 'running_late'        // slot-only
    | 'in_consultation'
    | 'completed'
    | 'no_show'             // queue-only
    | 'missed'              // slot-only
    | 'skipped'             // queue-only; URL-only
    | 'cancelled';          // slot-only; URL-only
  ```

  **Yes, the union is mode-mixed.** That's OK — the chip components in each mode render only their slice; the URL contract (`?status=`) accepts the union; the count look-ups are mode-specific. No change needed in queue chip's CHIP definitions array (it lists only its slice).

- [ ] Rename the exported type from `OpdQueueStatusFilterValue` → `OpdStatusFilterValue` if it's used by the chip components only. **Keep an alias `export type OpdQueueStatusFilterValue = OpdStatusFilterValue`** to avoid breaking queue-mode imports. (Lazy migration — drop the alias in a follow-up batch when usages are gone.)

- [ ] Verify the URL parsing logic accepts the new values without rejection. The hook should treat unknown URL values as `all` (defensive default — already the queue precedent).

- [ ] Update the JSDoc on the hook to mention slot-mode usage.

### Step 2 — `OpdSlotStatusFilter.tsx` component

- [ ] Create `frontend/components/opd/OpdSlotStatusFilter.tsx`. Port the queue chip's structure verbatim, with these differences:

  - Chip definitions (`CHIPS` array):

    ```ts
    const CHIPS: ChipDef[] = [
      { value: "all", label: "All" },
      { value: "upcoming", label: "Upcoming" },
      { value: "running_late", label: "Late" },
      { value: "in_consultation", label: "In consult" },
      { value: "completed", label: "Done" },
      { value: "missed", label: "Missed" },
    ];
    ```

  - **Counts source:** the `counts: SlotSessionCounts` from the snapshot payload (server-derived per sl-01). Map chip values to count keys:

    ```ts
    const chipCounts: Record<string, number> = {
      all: counts.all,
      upcoming: counts.upcoming,         // includes 'grace' per DL-4
      running_late: counts.running_late,
      in_consultation: counts.in_consultation,
      completed: counts.completed,
      missed: counts.missed,
    };
    ```

  - Telemetry event: emit `opd_slot.filter_changed` via `trackOpdSlotEvent` once `trackOpdSlotEvent` exists (**sl-04** adds the minimal sink in `opdQueueTelemetry.ts`; **sl-05** widens the type union — if sl-03 lands before sl-04, temporarily omit telemetry and add the emit in the same PR as sl-04, or stub `trackOpdSlotEvent` in sl-03's branch only if unavoidable). **Do not** route through `trackOpdQueueEvent` with an `opd_slot.*` event name (sl-04 / sl-05 mechanical `rg` forbids it).

  - Accessibility identical: `role="tablist"`, `role="tab"`, `aria-selected`, ←/→ arrow navigation.

- [ ] Export `OpdSlotStatusFilterProps` for typing in `OpdTodayClient`.

### Step 3 — Mount in `OpdTodayClient.tsx`

- [ ] In the slot branch (post-sl-02), **replace the filter-strip skeleton placeholder** with:

  ```tsx
  {/* Sticky filter strip — sl-03. Mirrors the queue branch's stickiness pattern. */}
  <div
    className={cn(
      "sticky top-0 z-10 flex flex-wrap items-center gap-2",
      "rounded-md border border-border bg-background/95 px-3 py-2 shadow-sm backdrop-blur",
      "supports-[backdrop-filter]:bg-background/80"
    )}
  >
    <OpdSlotStatusFilter
      value={slotStatusFilter}
      onChange={setSlotStatusFilter}
      counts={slotCounts ?? EMPTY_SLOT_COUNTS}
    />
    <div className="ml-auto w-full sm:w-auto sm:max-w-xs">
      <OpdQueueSearchBox value={slotSearchQuery} onChange={setSlotSearchQuery} />
    </div>
  </div>
  ```

  *(Class names mirror the queue branch's filter strip wrapper — same look, same stickiness behaviour. Pre-load `OpdTodayClient.tsx` lines ~360–415 to confirm the queue precedent's exact classes before copying.)*

- [ ] Add new state at the top of `OpdTodayClient`:

  ```tsx
  // ── Slot-mode filter state (sl-03) ──────────────────────────────────────
  const {
    statusFilter: slotStatusFilter,
    setStatusFilter: setSlotStatusFilter,
    searchQuery: slotSearchQuery,
    setSearchQuery: setSlotSearchQuery,
  } = useOpdQueueFilters({ namespace: "slot" }); // Hook accepts namespace if it already supports it; else use one shared namespace and rely on mode switching.

  const [slotCounts, setSlotCounts] = useState<SlotSessionCounts | null>(null);
  ```

  **Note on `namespace` prop:** if `useOpdQueueFilters` does not currently accept a namespace (i.e., it only manages one set of `?status=&q=` params), keep using the single shared URL key. Both modes never render simultaneously, so URL collision is not a real risk. Document this in a comment + capture a follow-up to add namespacing if needed.

- [ ] Update `handleSlotRefresh` (added in sl-02) to also persist counts:

  ```tsx
  const handleSlotRefresh = useCallback(async () => {
    try {
      const res = await getDoctorOpdSlotSession(token, sessionDate);
      setSlotEntries(res.data.entries);
      setSlotCounts(res.data.counts);
      setSlotLastUpdatedAt(Date.now());
    } catch {
      /* sl-05 wires the proper banner */
    }
  }, [token, sessionDate]);
  ```

- [ ] Define the `EMPTY_SLOT_COUNTS` constant near the top of the file:

  ```ts
  const EMPTY_SLOT_COUNTS: SlotSessionCounts = {
    all: 0,
    upcoming: 0,
    running_late: 0,
    in_consultation: 0,
    completed: 0,
    missed: 0,
    cancelled: 0,
    overflow: 0,
  };
  ```

- [ ] **Search-matching logic.** For sl-03, the parent passes the unfiltered `slotEntries` to sl-04's list, but the **filter chip + search query are both in URL state already** (managed by the hook). sl-04 will read these via the hook + apply the matcher. sl-03's job stops at "chip + search are mounted, URL-synced, and visually present"; the filtering itself happens in sl-04.

### Step 4 — Verification

- [ ] `pnpm --filter frontend tsc --noEmit` clean.
- [ ] `pnpm --filter frontend lint` clean.
- [ ] **Queue regression:** queue branch chip + search behaviour byte-identical to before. The hook union widening should be additive only.
  - `pnpm --filter frontend test -- OpdQueueStatusFilter` all green (or update snapshot if a test pins the exact union — visually verify only the additive diff).
  - Visit `/dashboard/opd-today` as a queue-mode doctor: chips render, counts work, URL syncs, telemetry fires.
- [ ] **Slot smoke** (logged in as a slot-mode doctor):
  - Filter strip is visible above the (still-skeleton) list area, with 6 chips and a search box on the right (sm+).
  - Each chip shows a count next to its label (e.g., `Upcoming 4`, `Done 2`). Counts match the snapshot's `counts` object (verify via DevTools network tab + the snapshot payload).
  - Click each chip → URL updates `?status=upcoming` etc. Reload page → chip restores from URL.
  - Type into search box → URL updates `?q=…` (debounced or live, whichever the queue precedent does — match it).
  - On mobile (DevTools 375px): chip strip horizontally scrolls (or wraps, matching queue precedent); search box wraps to its own row below.
  - Keyboard: tab to chip strip, ←/→ moves focus, Enter/Space selects.
  - Screen reader: `role="tablist" / role="tab" / aria-selected` announce correctly.
- [ ] `rg "OpdSlotStatusFilter" frontend/` returns the new component file + the mount in `OpdTodayClient.tsx`.

---

## Out of scope

- **Actually filtering the rendered list by chip / search** — that's sl-04. The filter state is in the URL hook; sl-04's list reads the same hook and applies the matcher.
- **Cancelled chip** — DL-4 keeps `cancelled` URL-only (no chip). The URL accepts `?status=cancelled` (and the list renders cancelled rows accordingly), but no chip in the strip.
- **Overflow chip** — SL-Q4 locked: overflow is a sub-state badge, not a chip.
- **Search matcher logic / fuzzy matching tweaks** — `OpdQueueSearchBox` already provides the input; the matcher (`opdQueueMatcher.ts`) is reused by sl-04. sl-03 doesn't touch matcher logic.
- **Status filter for mode switching** — the URL hook accepts the wider union but doesn't enforce mode-validity. A doctor in queue mode with `?status=running_late` in URL → no rows match (silent no-op), chip renders default. Acceptable; not worth a runtime guard.
- **Renaming `useOpdQueueFilters` → `useOpdHubFilters`** — defer (matches SL-Q6 spirit). Keep the name; add a JSDoc note that it now serves both modes.

---

## Files expected to touch

**New:**

- `frontend/components/opd/OpdSlotStatusFilter.tsx` (~180 LOC — port of `OpdQueueStatusFilter.tsx` with slot vocabulary).

**Modified:**

- `frontend/hooks/useOpdQueueFilters.ts` (~10 LOC delta — widen status union with `running_late`, `cancelled`; add JSDoc note about slot mode).
- `frontend/components/opd/OpdTodayClient.tsx` (~30 LOC delta — mount filter strip + add slot filter state + extend `handleSlotRefresh` to persist counts + define `EMPTY_SLOT_COUNTS`).

**Tests:** existing queue chip tests stay green. New slot chip tests deferred to sl-05 (one comprehensive UI test pass at the wave's end).

---

## Notes / open decisions

1. **Why widen the queue hook's union instead of forking a `useOpdSlotFilters`?** The URL contract is shared (`?status=&q=` is one query string per page; only one mode renders at a time). Forking would create two hooks that maintain the same URL state — more code, more risk of drift. Widen and live with the slightly mode-mixed union; it's a 5-line change.
2. **Why does sl-03 not actually filter the list?** Because the list doesn't exist yet — sl-04 ships it. Splitting the filter mount (sl-03) from the filter consumption (sl-04) keeps both tasks small and reviewable. The URL hook is the contract between them.
3. **`cancelled` chip is hidden but URL-accepted — what's the use case?** Mirrors queue's `skipped`: doctors who want to audit cancellations can append `?status=cancelled` to the URL or click a "View cancellations" link in some future overflow menu. No first-class chip; cheap to support.
4. **Why hardcode `EMPTY_SLOT_COUNTS` and not derive from a default object factory?** Six numeric properties; a literal is more readable than a factory. Drift risk is zero — `tsc` errors out if the shape changes.
5. **What if a doctor has `?status=running_late` in URL but switches to queue mode mid-day?** The queue chip array doesn't include `running_late`, so no chip is highlighted — it falls back to "All" visually but the URL keeps the value. Not a real-world workflow; not worth a guard.
6. **Telemetry — `opd_slot.filter_changed` event uses the same payload shape as queue's?** Yes — `{ event, kind, statusValue, queryLength }`. Only the prefix differs. sl-05 lands the formal event-taxonomy update; sl-03 is allowed to emit using the queue helper with the slot prefix in the meantime.

---

## References

- **Affected files:** see "Files expected to touch" above.
- **Read but do not modify:**
  - `frontend/components/opd/OpdQueueStatusFilter.tsx` — chip pattern.
  - `frontend/components/opd/OpdQueueSearchBox.tsx` — used as-is.
  - `frontend/components/opd/opdQueueTelemetry.ts` — telemetry shape.
- **Source decisions:** [Product plans/plan-opd-slot-hub.md § DL-4, SL-Q4](../../../../Product%20plans/plan-opd-slot-hub.md).
- **Wave gate:** [`EXECUTION-ORDER-opd-slot-hub.md` § Wave 2 gate](./EXECUTION-ORDER-opd-slot-hub.md#wave-2-gate-after-sl-05).
- **Previous task:** [`task-sl-02-slot-session-toolbar.md`](./task-sl-02-slot-session-toolbar.md) — must be merged or green on the same branch.
- **Next task:** [`task-sl-04-slot-session-list-and-row-actions.md`](./task-sl-04-slot-session-list-and-row-actions.md) — fresh chat (the big list + row-actions task).

---

**Owner:** TBD
**Created:** 2026-05-15
**Status:** Pending
