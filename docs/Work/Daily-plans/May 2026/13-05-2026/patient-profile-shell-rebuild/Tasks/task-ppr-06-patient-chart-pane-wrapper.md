# Task ppr-06: `<PatientChartPane>` wrapper + co-located collapsed strip

## 13 May 2026 — Batch [Patient profile shell rebuild](../plan-patient-profile-shell-rebuild-batch.md) — Wave 2, Lane β step 1 — **XS, ~45min**

---

## Task overview

The chart column doesn't need extraction the way `BodyColumnContent` / `RxColumnContent` did — `<AppointmentChartRail>` is already a standalone 🟢 component. What ppr-06 does:

1. **Author a thin `<PatientChartPane>` wrapper** that the v2 shell uses (so v2 has a uniform "pane component per column" model).
2. **Co-locate the collapsed strip** (`<PatientChartCollapsedStrip>`) as a sibling component in the same file, so the v2 panes array can reference both via the `render` + `collapsedRender` fields.

The actual chart content is unchanged — `<AppointmentChartRail>` keeps its current responsibilities.

**Estimated time:** ~45min.

**Status:** Done.

**Hard deps:** ppr-04 (the panes folder + ESLint zone amendment are in place).

**Source:** R2.3 + R2.6 (chart half) in [Product plans/plan-patient-profile-shell-rebuild.md](../../../../Product%20plans/plan-patient-profile-shell-rebuild.md).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**New chat?** Optional — can stitch onto ppr-05's chat. Pre-load:
- This task file.
- `frontend/components/ehr/AppointmentChartRail.tsx` (the surface we wrap).
- `frontend/components/consultation/cockpit/CollapsedChartRail.tsx` (the existing collapsed strip — we re-export it as the chart pane's `collapsedRender`).

**Estimated turns:** 1–2 turns.

---

## Acceptance criteria

### New file: `frontend/components/patient-profile/panes/PatientChartPane.tsx`

- [ ] Create the file with two exports:

  ```tsx
  "use client";

  import { type Ref } from "react";
  import CockpitColumnHeader from "@/components/consultation/cockpit/CockpitColumnHeader";
  import AppointmentChartRail from "@/components/ehr/AppointmentChartRail";
  import CollapsedChartRail from "@/components/consultation/cockpit/CollapsedChartRail";
  import type { Appointment } from "@/types/appointment";

  export interface PatientChartPaneProps {
    appointment: Appointment;
    token: string;
    /** v2: shell already renders the column header. Defaults to false (v1). */
    hideHeader?: boolean;
  }

  /**
   * The Patient chart column body. Thin wrapper around `<AppointmentChartRail>`
   * that lets the v2 shell render a chart pane with the same API surface as
   * the body and Rx panes (props-in, single render function).
   *
   * The expanded surface (`PatientChartPane`) and the collapsed strip
   * (`PatientChartCollapsedStrip`) ship side-by-side so the v2 panes array
   * can wire both via `{ render, collapsedRender }`.
   */
  export default function PatientChartPane({
    appointment,
    token,
    hideHeader = false,
  }: PatientChartPaneProps): JSX.Element {
    return (
      <div className="flex h-full flex-col">
        {!hideHeader && (
          <CockpitColumnHeader title="Patient chart" titleId="chart-title" />
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <AppointmentChartRail
            appointment={appointment}
            token={token}
            layout="desktop"
          />
        </div>
      </div>
    );
  }

  /**
   * The collapsed 40px strip for the chart pane. Re-exports the existing
   * `<CollapsedChartRail>` icon stack — section-icon navigation that
   * expands the rail AND scrolls to the section on click (cc-13).
   */
  export function PatientChartCollapsedStrip(props: { onExpand: () => void }): JSX.Element {
    return <CollapsedChartRail onExpand={props.onExpand} />;
  }
  ```

- [ ] **Why the explicit `layout="desktop"` prop?** `<AppointmentChartRail>` has a desktop / mobile branch internally; this is the existing prop. v2's shell only mounts panes in the desktop path (DL-11 — mobile is page-scroll).

### Tests

- [ ] No new tests needed in ppr-06. The wrapper is a single-render-tree pass-through and the existing `<AppointmentChartRail>` tests cover its behaviour.
- [ ] `pnpm --filter frontend tsc --noEmit` clean.
- [ ] `pnpm --filter frontend lint` clean.

### Manual smoke

- [ ] Not visible until ppr-07 plugs it in. Skipped here.

---

## Out of scope

- **Refactoring `<AppointmentChartRail>`.** 🟢 component, unchanged.
- **Refactoring `<CollapsedChartRail>`.** 🟢 component, re-exported.
- **Wiring it into the v2 shell.** ppr-07.

---

## Files expected to touch

**New:**
- `frontend/components/patient-profile/panes/PatientChartPane.tsx` (~40 LOC).

**Modified:** none.

**Tests:** none added.

---

## Notes / open decisions

1. **Why does `<PatientChartCollapsedStrip>` accept an `onExpand` prop instead of consuming the shell's `setPaneCollapsed`?** The collapsed strip is a pane-level surface; it shouldn't know about the shell's state shape. The shell passes an `onExpand` callback that maps to `setPaneCollapsed("chart", false)`. Keeps the pane decoupled.
2. **Why re-export the existing `CollapsedChartRail` instead of re-implementing?** It's a 🟢 component (CC-D6, shipped by cc-13). Re-implementing would re-do all the section-anchor work and create drift. The re-export is the right port-by-reference pattern.

---

## References

- **Affected files:**
  - new `frontend/components/patient-profile/panes/PatientChartPane.tsx`
- **Source decision:** R2.3 + R2.6 (chart half) in [Product plans/plan-patient-profile-shell-rebuild.md](../../../../Product%20plans/plan-patient-profile-shell-rebuild.md).
- **Next task:** [`task-ppr-07-plug-panes-and-header-strip.md`](./task-ppr-07-plug-panes-and-header-strip.md) — fresh chat preferred (different concerns).

---

**Owner:** TBD
**Created:** 2026-05-13
**Status:** Done
