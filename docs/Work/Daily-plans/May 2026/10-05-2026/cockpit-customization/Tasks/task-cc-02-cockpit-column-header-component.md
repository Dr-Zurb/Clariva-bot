# Task cc-02: Extract `<CockpitColumnHeader>` shared component

## 10 May 2026 — Batch [Cockpit customization](../plan-cockpit-customization-batch.md) — Phase B, Lane α step 0 — **S, ~1.5h**

---

## Task overview

Yesterday's `cs-05` added an in-flow `<header>` block at the top of `<AppointmentChartRail>` to host the chart-rail's collapse chevron. That header is bespoke — it lives inside the chart rail file and is the only column header in the cockpit. The body and Rx columns have no header at all.

This batch needs all three columns to look identical (uniform headers), and each header needs to host:

1. A **title** (e.g. "Patient chart" / "Consultation" / "Prescription").
2. **Actions** (today: collapse chevron when collapsible; cc-07: drag handle for reorder).

Rather than copy-paste the chart-rail header pattern into the body / Rx columns, **lift it into a shared `<CockpitColumnHeader>` component** with named slots for title and actions. cc-02 introduces the component and refactors `<AppointmentChartRail>` to use it; cc-03 mounts it on the body and Rx columns.

**Estimated time:** ~1.5h (45 min component design + chart-rail refactor, 30 min test updates, 15 min visual diff).

**Status:** Pending.

**Hard deps:** cc-01 (independent, but cc-01 lands first — cleaner diff).

**Source:** [plan-cockpit-customization-batch.md § Phase B](../plan-cockpit-customization-batch.md#phase-b--uniform-column-headers-2-tasks-3h-1-lane-sequential).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**New chat?** **Yes** — fresh small chat. Pre-load:
- This task file.
- `frontend/components/ehr/AppointmentChartRail.tsx` (the bespoke header at lines ~152–167 — the source pattern).
- `frontend/components/consultation/cockpit/CockpitHeader.tsx` (style precedent for cockpit-related headers — same `text-sm font-semibold`, same border treatment).
- `frontend/components/ui/` (read-only — confirm shadcn primitives available).

**Estimated turns:** 2–3 turns.

---

## Acceptance criteria

### New `<CockpitColumnHeader>` component

- [ ] Create `frontend/components/consultation/cockpit/CockpitColumnHeader.tsx`. Public surface:

  ```tsx
  import { cn } from "@/lib/utils";

  export interface CockpitColumnHeaderProps {
    /** Title text shown at the left of the header. Required. */
    title: string;
    /** Optional ARIA id for the title — useful when callers want to label the column body. */
    titleId?: string;
    /** Right-aligned actions (e.g. collapse chevron, drag handle). Optional. */
    actions?: React.ReactNode;
    /**
     * Drag handle slot rendered to the LEFT of the title. Optional. cc-07
     * fills this with a `<DragHandle>` button; today it stays empty so the
     * cc-02 / cc-03 ship doesn't introduce drag affordance prematurely.
     */
    dragHandle?: React.ReactNode;
    /** Extra class hook for the outer wrapper. */
    className?: string;
  }

  /**
   * Shared column-header strip rendered at the top of every cockpit
   * column on lg+. Hosts the column title, the (future) drag handle for
   * reorder (cc-07), and column-specific actions like the collapse
   * chevron. cc-02 introduces this; cc-03 mounts it on body + Rx.
   */
  export default function CockpitColumnHeader({
    title,
    titleId,
    actions,
    dragHandle,
    className,
  }: CockpitColumnHeaderProps) {
    return (
      <header
        className={cn(
          "flex shrink-0 items-center justify-between border-b bg-background px-3 py-2",
          className,
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          {dragHandle}
          <h3
            id={titleId}
            className="truncate text-sm font-semibold"
          >
            {title}
          </h3>
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
      </header>
    );
  }
  ```

  - **Why two slots (`actions` + `dragHandle`) instead of one `children`?** Future cc-07 needs the drag handle on the LEFT (next to the title) and the collapse chevron on the RIGHT (existing pattern). Two slots make the layout invariants explicit and prevent callers from accidentally reordering them.
  - **Why `truncate` on the `<h3>`?** Column titles can be long (e.g. "Previous prescriptions") and the column may be narrow after drag-resize. Truncation keeps the header on one line.
  - **Why `text-sm font-semibold`?** Matches yesterday's cs-05 chart-rail header. Same visual weight everywhere.

### Refactor `<AppointmentChartRail>` to use it

- [ ] In `frontend/components/ehr/AppointmentChartRail.tsx`, find the in-flow header at lines ~152–167:

  ```tsx
  <header className="flex shrink-0 items-center justify-between border-b bg-background px-3 py-2">
    <h3 className="text-sm font-semibold">Patient chart</h3>
    <button
      type="button"
      onClick={toggle}
      aria-expanded={true}
      aria-controls="chart-body"
      aria-label="Collapse patient chart"
      aria-keyshortcuts="["
      className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
    >
      <ChevronLeft className="h-4 w-4" aria-hidden />
    </button>
  </header>
  ```

  Replace with:

  ```tsx
  <CockpitColumnHeader
    title="Patient chart"
    titleId="chart-title"
    actions={
      <button
        type="button"
        onClick={toggle}
        aria-expanded={true}
        aria-controls="chart-body"
        aria-label="Collapse patient chart"
        aria-keyshortcuts="["
        className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </button>
    }
  />
  ```

- [ ] Add the import: `import CockpitColumnHeader from "@/components/consultation/cockpit/CockpitColumnHeader";`.

- [ ] Verify the chart-body `aria-labelledby` references the new `titleId` if it does so today (it likely doesn't — confirm with `rg "aria-labelledby" frontend/components/ehr/`).

### Tests

- [ ] **Add a unit test** at `frontend/components/consultation/cockpit/__tests__/CockpitColumnHeader.test.tsx`:
  - Renders the title.
  - Renders `actions` when provided.
  - Renders `dragHandle` when provided.
  - Sets `id` on the `<h3>` when `titleId` is provided.
  - Truncates a very long title (assert `truncate` class is present).
- [ ] Existing chart-rail tests pass after the refactor (selectors targeting "Patient chart" should still match; the heading text didn't change, only the wrapping component did).
- [ ] `pnpm --filter frontend tsc --noEmit` is clean.
- [ ] `pnpm --filter frontend lint` — clean for changed files.

### Manual verification

- [ ] Open `/dashboard/appointments/[id]` for an appointment in `ready` state. The chart rail's header looks identical to before — title on the left, chevron on the right, the `border-b` line below.
- [ ] Click the chevron. Rail collapses. Click the collapsed-rail expand button. Rail re-expands. Behavioural parity with pre-cc-02.

---

## Out of scope

- **Mounting the new component on body / Rx columns** — that's cc-03.
- **Drag handle inside the header** — that's cc-07; the `dragHandle` slot is reserved but not filled.
- **Slot-based collapsibility logic** — the chart rail keeps owning its collapse boolean here. cc-04 / cc-05 lift it.
- **Restyling the header (different border, different bg, different padding)** — keep the cs-05 visuals byte-identical so this is a true refactor, not a redesign.

---

## Files expected to touch

**Modified:**
- `frontend/components/ehr/AppointmentChartRail.tsx` (~15 LOC delta — replace bespoke `<header>` with `<CockpitColumnHeader>`).

**New:**
- `frontend/components/consultation/cockpit/CockpitColumnHeader.tsx` (~50 LOC).
- `frontend/components/consultation/cockpit/__tests__/CockpitColumnHeader.test.tsx` (~80 LOC).

**Tests:** none removed.

---

## Notes / open decisions

1. **Why put the new component under `consultation/cockpit/` not `ui/`?** It's cockpit-specific. It encodes cockpit visual conventions (the `border-b` line, the `bg-background`, the height implied by `py-2`). A generic `ui/ColumnHeader` would invite reuse outside the cockpit and drift its styling.
2. **Why not use shadcn's `<Card>` primitives?** Cards have radius, shadow, and self-contained padding that don't compose with the resizable-panel-edge layout. The bespoke `<header>` shape is correct for this context.
3. **What about the `<aside>` semantics?** The chart rail is wrapped in `<aside>` already (in the collapsed branch). The expanded branch uses `<div>`. The new `<CockpitColumnHeader>` renders as `<header>` which sits inside whatever wrapper the column owns. Semantics unchanged.

---

## References

- **Affected files:**
  - `frontend/components/ehr/AppointmentChartRail.tsx` (the cs-05 header that this task lifts out)
  - new `frontend/components/consultation/cockpit/CockpitColumnHeader.tsx`
- **Style precedent:** [Daily-plans/May 2026/09-05-2026/cockpit-shell-redesign/Tasks/task-cs-05-chart-rail-toggle-position.md](../../../09-05-2026/cockpit-shell-redesign/Tasks/task-cs-05-chart-rail-toggle-position.md) — the bespoke header this task generalises.
- **Stitched follow-up:** [`task-cc-03-mount-headers-on-body-and-rx.md`](./task-cc-03-mount-headers-on-body-and-rx.md) — mounts the new component on the other two columns. Same chat, same PR.

---

**Owner:** TBD
**Created:** 2026-05-10
**Status:** Pending
