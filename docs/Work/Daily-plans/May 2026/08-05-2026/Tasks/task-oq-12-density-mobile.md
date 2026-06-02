# Task oq-12: Density toggle + mobile fallback

## 08 May 2026 — Batch [OPD queue redesign](../plan-opd-queue-redesign-batch.md) — Phase 5, Lane ζ step 1 — **S, ~4h**

---

## Task overview

Two related polish jobs that share the breakpoint plumbing:

1. **Density toggle** — `Compact` (~28 px row) / `Default` (~32 px row). Persisted to localStorage so the doctor's preference sticks across reloads. Toggle UI lives in the session toolbar (`oq-11`) on the right side.
2. **Mobile fallback (`<lg`)** — replace the dense table with a 2-line card list (`<OpdQueueMobileCard>`) driven by the same hook. Same data, same actions, more vertical space.

**Estimated time:** ~4h. Mostly the mobile card and the localStorage hook — density already plumbs through `OpdQueueDenseRow` from `oq-03`.

**Status:** Drafted.

**Hard deps:** [oq-04](./task-oq-04-table-shell-grouping.md) shipped (table props accept `density`).

**Source:** [plan-opd-queue-redesign-batch.md § OQ-D4](../plan-opd-queue-redesign-batch.md#decision-lock-locked-2026-05-08-copied-here-for-stability).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**New chat?** **Yes**. Pre-load:
- This task file.
- `frontend/components/opd/OpdQueueDenseRow.tsx` (post-oq-03).
- `frontend/components/opd/OpdQueueTable.tsx` (post-oq-04).
- `frontend/components/opd/OpdQueueSessionToolbar.tsx` (post-oq-11) — toggle target.
- `frontend/lib/consultation/opd-status-meta.ts` (status meta — needed for the mobile card).

**Composer-OK sub-steps:** none.

**Estimated turns:** 3–4 Sonnet turns.

---

## Acceptance criteria

### Density hook

- [ ] New file `frontend/hooks/useOpdQueueDensity.ts`:

  ```ts
  export type OpdQueueDensity = 'compact' | 'default';

  export interface UseOpdQueueDensityState {
    density: OpdQueueDensity;
    setDensity: (next: OpdQueueDensity) => void;
  }

  export function useOpdQueueDensity(): UseOpdQueueDensityState;
  ```

  - Reads `localStorage['opd_queue_density']` on mount; defaults to `'default'` when absent or invalid.
  - `setDensity` writes to localStorage AND updates state.
  - Type-narrow read with a small validator (only `'compact'` / `'default'` accepted; anything else falls back to default).
  - `useEffect`-safe for SSR (no `window` access during render — wrap in `useEffect`).

### Density toggle UI

- [ ] Mount the toggle in `<OpdQueueSessionToolbar>` (right side, before the last-updated indicator). Two-state segmented control:

  ```
  [ Default | Compact ]
  ```

  - Use the same chip-button visual style as `<OpdQueueStatusFilter>` for consistency, but smaller.
  - Tooltip: `"Density: comfortable (Default) / dense (Compact)"`.
  - On toggle: `setDensity(next)` and pass `density` down to `<OpdQueueTable>`.

### Density propagation

- [ ] `OpdTodayClient` reads `useOpdQueueDensity()` and passes `density` to:
  - `<OpdQueueTable density={density}>` (already accepts the prop from `oq-04`).
  - `<OpdQueueSessionToolbar density={density} onChangeDensity={setDensity}>` (extend the toolbar's prop list).
- [ ] `<OpdQueueTable>` forwards `density` to each `<OpdQueueDenseRow>` and matches its column-header heights to the row densities (compact header text-xs, default text-sm).

### Mobile card component

- [ ] New file `frontend/components/opd/OpdQueueMobileCard.tsx`:

  ```ts
  export interface OpdQueueMobileCardProps {
    entry: DoctorQueueSessionRow;
    onOpen: (entry: DoctorQueueSessionRow) => void;
    actions?: React.ReactNode; // same slot as the dense row
    dimmed?: boolean;
    isNextUp?: boolean;
  }

  export function OpdQueueMobileCard(props: OpdQueueMobileCardProps): JSX.Element;
  ```

- [ ] Layout — 2 lines:

  ```
  ┌──────────────────────────────────────────────────────┐
  │ #04 ● Waiting · 32 m !                          ⋯    │
  │ Ravi Kumar · PT-2024-0218 · M · 28              ⏵    │
  └──────────────────────────────────────────────────────┘
  ```

  - Line 1: token + status pill + waited time. Right edge: `⋯` overflow only.
  - Line 2: name · MRN · sex/age. Right edge: `⏵` open chevron.
  - Tap anywhere on the card = `onOpen(entry)`.
  - Whole card has `role="button"`, `tabIndex={0}`.
  - Reason / phone / mode / scheduled-time live in a tap-to-expand sheet (use a `<Sheet>` primitive — search `rg "Sheet|Drawer" frontend/components/ui/`). If no sheet primitive exists, fall back to navigation to the appointment detail page (the dense row's behavior).

### Mobile mount swap

- [ ] In `OpdTodayClient`, conditionally render based on viewport:

  ```tsx
  const isCompactViewport = useMediaQuery('(max-width: 1023px)');
  return (
    <>
      <OpdQueueSessionToolbar … />
      <OpdQueueStatusFilter … />
      {isCompactViewport ? (
        <OpdQueueMobileList entries={visibleEntries} … />
      ) : (
        <OpdQueueTable entries={visibleEntries} density={density} … />
      )}
    </>
  );
  ```

  - `useMediaQuery` should already exist in the codebase (search `rg "useMediaQuery" frontend/hooks`); if not, write a tiny one (~15 LOC) using `window.matchMedia`.

- [ ] New tiny file `frontend/components/opd/OpdQueueMobileList.tsx` that maps over `visibleEntries` and renders `<OpdQueueMobileCard>` per row, with the same group dividers (`Active (8)`, `Done today (12)`, `No-show (3)`) as the table.
- [ ] **Filters + search still apply** on mobile — the same `useOpdQueueFilters` state drives both layouts.

### Type-check + lint

- [ ] Clean.

### Smoke

- [ ] Resize browser below 1024 px → mobile cards render.
- [ ] Resize back ≥ 1024 px → dense table renders.
- [ ] Toggle density on desktop → row height changes immediately + persists across reload.

---

## Out of scope

- **Custom mobile-only filter shapes** — same filter UI on both layouts (chips wrap on mobile).
- **Tablet-specific layout** — `lg` (1024 px) is the breakpoint; tablets in landscape get the desktop view.
- **Drag-to-reorder on mobile** — not part of this batch on either platform.
- **Telemetry** — `oq-14`.

---

## Files expected to touch

**New:**
- `frontend/hooks/useOpdQueueDensity.ts` (~50 LOC)
- `frontend/components/opd/OpdQueueMobileCard.tsx` (~140 LOC)
- `frontend/components/opd/OpdQueueMobileList.tsx` (~80 LOC)

**Modified:**
- `frontend/components/opd/OpdQueueSessionToolbar.tsx` (~20 LOC — accept density toggle props, render the segmented control)
- `frontend/components/opd/OpdQueueTable.tsx` (~5 LOC — confirm density propagates to header sizing)
- `frontend/components/opd/OpdTodayClient.tsx` (~15 LOC — useMediaQuery branch + density wiring)

---

## Notes / open decisions

1. **Why localStorage instead of doctor settings.** Density is a viewer preference, not a clinic policy. localStorage is the right abstraction; no migration / API needed. If a doctor wants their preference to follow them across devices, that's a future enhancement.
2. **Why 1024 px (`lg`) breakpoint.** Below that, the dense 12-column table starts truncating critical fields. Tablets in portrait fall into mobile view; landscape gets the desktop table.
3. **Why mobile cards don't have all 12 fields.** The card is a quick-scan surface — name, status, waited, that's the action-relevant subset. Phone / reason / mode are one tap away in the expand sheet (or the appointment detail).
4. **Filter chips on mobile.** Wrap to a second line; that's fine. The status filter and search box remain visible.

---

## References

- **Source plan:** [plan-opd-queue-redesign-batch.md § OQ-D4](../plan-opd-queue-redesign-batch.md)
- **Row component (desktop):** [task-oq-03-dense-row-component.md](./task-oq-03-dense-row-component.md)
- **Toolbar:** [task-oq-11-session-toolbar.md](./task-oq-11-session-toolbar.md)
- **Existing useMediaQuery patterns (look for):** `frontend/hooks/useMediaQuery.ts` if present.

---

**Owner:** TBD
**Created:** 2026-05-08
**Status:** Drafted
