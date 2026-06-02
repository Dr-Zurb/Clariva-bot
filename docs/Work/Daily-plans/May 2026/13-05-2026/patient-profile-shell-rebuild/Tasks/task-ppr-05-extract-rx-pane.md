# Task ppr-05: Extract `<RxPane>`

## 13 May 2026 — Batch [Patient profile shell rebuild](../plan-patient-profile-shell-rebuild-batch.md) — Wave 2, Lane β step 0 — **S, ~1.5h**

---

## Task overview

Same extraction pattern as ppr-04, applied to `RxColumnContent` (lines 2479–end of `ConsultationCockpit.tsx`, with props at lines 2441–2477). Lift the inline function into a standalone `<RxPane>` component that both shells (v1 + v2) import.

ppr-04 is the template; this task is mechanical.

**Estimated time:** ~1.5h.

**Status:** Done.

**Hard deps:** ppr-04 (sets the pattern + amends the ESLint zone for `panes/**`).

**Source:** R2.2 in [Product plans/plan-patient-profile-shell-rebuild.md](../../../../Product%20plans/plan-patient-profile-shell-rebuild.md).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**New chat?** Optional — if continuing from ppr-04's chat in the same session, stitch; otherwise fresh chat. Pre-load:
- This task file.
- ppr-04's task file (the pattern).
- `frontend/components/consultation/ConsultationCockpit.tsx` lines 2441–2607 (`RxColumnContent` + its props).
- `frontend/components/consultation/cockpit/RxWorkspace.tsx` (the surface that `<RxPane>` wraps — kept unchanged).

**Estimated turns:** 2–3 turns.

---

## Acceptance criteria

### New file: `frontend/components/patient-profile/panes/RxPane.tsx`

- [ ] Create the file. Public surface mirrors ppr-04's pattern:

  ```tsx
  "use client";

  import { type ReactNode } from "react";
  import { ChevronLeft, ChevronRight } from "lucide-react";
  import CockpitColumnHeader from "@/components/consultation/cockpit/CockpitColumnHeader";
  import RxWorkspace from "@/components/consultation/cockpit/RxWorkspace";
  import PreviousRxPopover from "@/components/consultation/cockpit/PreviousRxPopover";
  import { type CockpitState } from "@/lib/consultation/cockpit-state";
  import type { Appointment } from "@/types/appointment";

  export interface RxPaneProps {
    appointment: Appointment;
    token: string;
    state: CockpitState;
    onRxSent?: () => void;
    onFinishVisit?: () => void;
    onCollapse?: () => void;
    onMedicineCountChange?: (count: number) => void;
    isCollapsible?: boolean;
    slotIndex?: number;
    dragHandle?: ReactNode;
    headerLeadingExtra?: ReactNode;
    headerTrailingExtra?: ReactNode;
    /** v2: shell already renders the column header. Defaults to false (v1). */
    hideHeader?: boolean;
  }

  /**
   * The Prescription column body. Hosts the Rx workspace, the previous-Rx
   * popover, and the prescription-related actions.
   *
   * Extracted from `ConsultationCockpit.tsx`'s inline `RxColumnContent`
   * function in ppr-05. Same pattern as ppr-04 — explicit props, both
   * shells (v1 + v2) import this file. v2 sets `hideHeader={true}` so the
   * shell-owned column header isn't doubled.
   */
  export default function RxPane(props: RxPaneProps): JSX.Element { ... }
  ```

- [ ] Replace closure access to `appointment` / `token` / `state` / `onRxSent` / `onFinishVisit` / `onMedicineCountChange` etc. with `props.*`.
- [ ] Honour `hideHeader === true` by rendering just the `<RxWorkspace>` body without the `<CockpitColumnHeader>` wrapper.
- [ ] Preserve the chevron-direction logic (`slotIndex === 0 ? ChevronLeft : ChevronRight`) for v1.

### Modify: `frontend/components/consultation/ConsultationCockpit.tsx`

- [ ] **Delete** the inline `RxColumnContentProps` interface and `RxColumnContent` function (lines 2441–2607 inclusive).
- [ ] **Import** `RxPane` from the new file:

  ```tsx
  import RxPane from "@/components/patient-profile/panes/RxPane";
  ```

- [ ] **Replace** the single `<RxColumnContent .../>` mount site (find via `rg "<RxColumnContent"` in `ConsultationCockpit.tsx`) with `<RxPane .../>`. Prop-pass-through identical; defaults preserve v1 behaviour.

### Tests

- [ ] Search `rg "RxColumnContent" frontend/` and rename any matches in tests / fixtures to `RxPane`.
- [ ] `pnpm --filter frontend tsc --noEmit` clean.
- [ ] `pnpm --filter frontend lint` clean.
- [ ] `pnpm --filter frontend vitest run components/consultation/__tests__/ConsultationCockpit` — all tests still green.

### Manual smoke

- [ ] Open `/dashboard/appointments/[some-real-id]` (v1). Rx column renders identically — same workspace surface, same "Send to patient" button, same previous-Rx popover, same collapse chevron when on a side slot.
- [ ] Reorder Rx to the middle via the Layout dropdown. Header still renders, collapse chevron disappears (CC-D2 — middle slot non-collapsible), no regressions.
- [ ] No console warnings.

---

## Out of scope

- **Plugging `<RxPane>` into the v2 shell.** ppr-07.
- **Co-located `collapsedRender` (`<RxPaneCollapsedStrip>`).** Will land alongside ppr-07 when the panes array is constructed — keeping it here would force premature wiring. Reuse the existing `CollapsedRxRail` for now.
- **Refactoring `<RxWorkspace>` itself.** It's a 🟢 component, ported by reference.

---

## Files expected to touch

**New:**
- `frontend/components/patient-profile/panes/RxPane.tsx` (~110 LOC).

**Modified:**
- `frontend/components/consultation/ConsultationCockpit.tsx` (~−170 LOC delete + 1 LOC import).

**Tests:** identifier renames only.

---

## Notes / open decisions

1. **Why no co-located internal helpers (vs ppr-04's `internal/CenterPane.tsx`)?** `RxColumnContent` doesn't have a sub-component the size of `CenterPane`. The full body is the `<RxWorkspace>` mount + the previous-Rx popover trigger; both are already standalone files. Nothing to extract internally.
2. **Why is the chevron direction still `slotIndex`-based?** v1 still uses it. ppr-14 strips it after the old shell is deleted. v2 sets `hideHeader={true}` and never sees this code path.

---

## References

- **Affected files:**
  - new `frontend/components/patient-profile/panes/RxPane.tsx`
  - mod `frontend/components/consultation/ConsultationCockpit.tsx` (~−170 LOC)
- **Source decision:** R2.2 in [Product plans/plan-patient-profile-shell-rebuild.md](../../../../Product%20plans/plan-patient-profile-shell-rebuild.md).
- **Pattern source:** [task-ppr-04-extract-consultation-body-pane.md](./task-ppr-04-extract-consultation-body-pane.md).
- **Next task:** [`task-ppr-06-patient-chart-pane-wrapper.md`](./task-ppr-06-patient-chart-pane-wrapper.md) — same chat OK.

---

**Owner:** TBD
**Created:** 2026-05-13
**Status:** Done
