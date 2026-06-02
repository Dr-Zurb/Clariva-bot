# Task ppr-04: Extract `<ConsultationBodyPane>`

## 13 May 2026 — Batch [Patient profile shell rebuild](../plan-patient-profile-shell-rebuild-batch.md) — Wave 2, Lane α step 0 — **M, ~2h**

---

## Task overview

Cut the inline `BodyColumnContent` function out of `ConsultationCockpit.tsx` (lines 2371–2439, with its props interface at 2327–2369) into its own standalone component file. Convert closed-over parent-scope variables into explicit props. The component then runs in two homes simultaneously:

- **v1** (`ConsultationCockpit.tsx`): imports `<ConsultationBodyPane>` from the new file and mounts it where the inline function used to be. Behaviour byte-identical.
- **v2** (`<PatientProfilePage>`, via ppr-07): mounts the same `<ConsultationBodyPane>` as one of the panes in the `panes` array.

This extraction is the **template pattern** for ppr-05 (Rx) and ppr-06 (chart wrapper). Get it right and the other two are mechanical.

**Estimated time:** ~2h (45min identifying closure vars, 45min refactor + props, 30min smoke).

**Status:** Done.

**Hard deps:** ppr-03 (so v2 has a shell to plug into, even though ppr-04 itself doesn't touch v2 yet).

**Source:** R2.1 in [Product plans/plan-patient-profile-shell-rebuild.md](../../../../Product%20plans/plan-patient-profile-shell-rebuild.md).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**New chat?** **Yes** — fresh chat. Pre-load:
- This task file.
- `frontend/components/consultation/ConsultationCockpit.tsx`:
  - Lines 2327–2369 (`BodyColumnContentProps`).
  - Lines 2371–2439 (`BodyColumnContent`).
  - Lines 2609–end (`CenterPane` — referenced from `BodyColumnContent`).
  - Search for `<BodyColumnContent` (single mount site, somewhere around line ~1600 in the desktop branch's `panes.map`).
- `frontend/components/consultation/cockpit/CockpitColumnHeader.tsx` (the header primitive — kept, not changed).
- `frontend/lib/consultation/cockpit-state.ts` (for the `CockpitState` import).

**Estimated turns:** 4–5 turns.

---

## Acceptance criteria

### New file: `frontend/components/patient-profile/panes/ConsultationBodyPane.tsx`

- [ ] Create the file. Public surface:

  ```tsx
  "use client";

  import { Fragment, type ReactNode, type Ref } from "react";
  import { ChevronLeft, ChevronRight } from "lucide-react";
  import CockpitColumnHeader from "@/components/consultation/cockpit/CockpitColumnHeader";
  import ConsultationLauncher, {
    type ConsultationLauncherHandle,
  } from "@/components/consultation/ConsultationLauncher";
  import { type CockpitState } from "@/lib/consultation/cockpit-state";
  import type { Appointment } from "@/types/appointment";
  import CenterPane from "./internal/CenterPane";

  export interface ConsultationBodyPaneProps {
    state: CockpitState;
    appointment: Appointment;
    token: string;
    launcherRef: Ref<ConsultationLauncherHandle>;
    onRxSent?: () => void;
    onMarkNoShow?: () => void;
    /** Optional collapse handler for v1 side-slot use. v2 doesn't pass this. */
    onCollapse?: () => void;
    /** v1: gates the side-collapse chevron. v2: ignored (shell owns collapse). */
    isCollapsible?: boolean;
    /** v1 slot index for chevron direction. v2: ignored. */
    slotIndex?: number;
    /** v1: drag handle element rendered in the header. v2: ignored. */
    dragHandle?: ReactNode;
    /** v1: legacy `headerLeadingExtra`. v2: ignored — middle-collapse mechanism is gone. */
    headerLeadingExtra?: ReactNode;
    /** v1: legacy `headerTrailingExtra`. v2: ignored. */
    headerTrailingExtra?: ReactNode;
    /**
     * v2: render the pane WITHOUT its own header. Set when the shell
     * (`PatientProfileShell`) already renders a `<ColumnHeader>` on top of
     * the pane and the pane's responsibility is just the body content.
     * Defaults to `false` so v1 keeps working.
     */
    hideHeader?: boolean;
  }

  /**
   * The Consultation column body — state-driven center pane that hosts the
   * lobby card, the consultation launcher, the live room, the wrap-up card,
   * the ended card, or the terminal card depending on `state`.
   *
   * Extracted from `ConsultationCockpit.tsx`'s inline `BodyColumnContent`
   * function in ppr-04 so both the v1 shell (ConsultationCockpit) and the
   * v2 shell (PatientProfileShell, via PatientProfilePage in ppr-07) can
   * mount it. Props are explicit — no closure capture.
   *
   * v1 vs v2 prop behaviour:
   *   - v1 uses every prop. The inline function in ConsultationCockpit
   *     wires them all today.
   *   - v2 only uses { state, appointment, token, launcherRef, onRxSent,
   *     onMarkNoShow, hideHeader }. The shell owns collapse, drag handle,
   *     and header rendering, so the legacy header-slot props are no-ops
   *     when `hideHeader={true}`.
   */
  export default function ConsultationBodyPane(
    props: ConsultationBodyPaneProps,
  ): JSX.Element {
    // ... extracted body of BodyColumnContent goes here, parameterised by props
  }
  ```

- [ ] **Move `CenterPane`** (currently around line 2609 in `ConsultationCockpit.tsx`) into a co-located `frontend/components/patient-profile/panes/internal/CenterPane.tsx`. This is an internal helper of the body pane; keeping it close limits its blast radius.

- [ ] The extracted body is the SAME render tree as the existing `BodyColumnContent`. Do NOT change visual output. Only:
  - Rename inline `slotIndex === 0 ? ChevronLeft : ChevronRight` to use `props.slotIndex` instead of the closed-over value.
  - Replace the closure access to `onMarkNoShow` / `onRxSent` / `state` / `appointment` / `token` / `launcherRef` with their corresponding `props.` accessors.
  - When `props.hideHeader === true`, render `<CenterPane ... />` directly without the surrounding `<div className="flex h-full flex-col">` + `<CockpitColumnHeader>` wrapper. Just the body.

### Modify: `frontend/components/consultation/ConsultationCockpit.tsx`

- [ ] **Delete** the inline `BodyColumnContentProps` interface (lines 2327–2369) and the `BodyColumnContent` function (lines 2371–2439). Also delete `CenterPane` + `CenterPaneProps` since they migrate to the new internal folder.

- [ ] **Import** `ConsultationBodyPane` from the new file:

  ```tsx
  import ConsultationBodyPane from "@/components/patient-profile/panes/ConsultationBodyPane";
  ```

- [ ] **Replace** the `<BodyColumnContent .../>` mount site (search for it; should be exactly one usage in the desktop branch's pane map) with `<ConsultationBodyPane .../>` — props pass through 1:1 since the new component's prop interface is a superset of the inline one (just adds `hideHeader`). v1 callers leave `hideHeader` unset, so default `false` preserves the current behaviour.

### Tests

- [ ] Snapshot the desktop branch's body column BEFORE and AFTER the refactor (manual visual diff is fine for a one-off extraction). v1 must look identical.
- [ ] Run the existing test suite — anything that references `BodyColumnContent` should now reference `ConsultationBodyPane` (search `rg "BodyColumnContent" frontend/`):
  - `frontend/components/consultation/__tests__/ConsultationCockpit.resize.test.tsx`
  - `frontend/components/consultation/__tests__/ConsultationCockpit.shell.test.tsx`
  
  Update import paths + display names in these tests. Behaviour assertions should still hold.

- [ ] `pnpm --filter frontend tsc --noEmit` clean.
- [ ] `pnpm --filter frontend lint` clean (the new file is in `panes/` so the ppr-01 ESLint zone applies — verify it tolerates the imports from `@/components/consultation/**` because that's WHERE we put the new file, but… wait, see Notes 1 below).
- [ ] `pnpm --filter frontend vitest run components/consultation/__tests__/ConsultationCockpit` passes.

### Manual smoke

- [ ] Open `/dashboard/appointments/[some-real-id]` (v1, not v2). Consultation column renders identically — same lobby card / ready card / launcher / wrap-up button / ended state as before.
- [ ] Drag the consultation column to another slot via cc-07 drag handle. Header still renders, drag handle still works, collapse chevron (when on a side slot) still works.
- [ ] No console warnings.

---

## Out of scope

- **Rendering the new pane in v2** (`/dashboard/appointments/[id]/v2`). That's ppr-07.
- **Removing legacy props** (`onCollapse`, `isCollapsible`, `slotIndex`, `dragHandle`, `headerLeadingExtra`, `headerTrailingExtra`). They stay on the new component for v1's sake. v2 simply doesn't pass them and sets `hideHeader={true}`. ppr-14 deletes them when v1 is gone.
- **Changing the underlying behaviour** (state machine, launcher mounting, Rx-sent handler). Pure extraction.

---

## Files expected to touch

**New:**
- `frontend/components/patient-profile/panes/ConsultationBodyPane.tsx` (~150 LOC).
- `frontend/components/patient-profile/panes/internal/CenterPane.tsx` (~120 LOC — current `CenterPane` + its props).

**Modified:**
- `frontend/components/consultation/ConsultationCockpit.tsx` (~−200 LOC — delete the two inline functions + their props + add one import).
- `frontend/components/consultation/__tests__/ConsultationCockpit.resize.test.tsx` (~5 LOC — display-name update).
- `frontend/components/consultation/__tests__/ConsultationCockpit.shell.test.tsx` (~5 LOC — same).

**Tests:** none added (the new component's behaviour is identical to the inline one; existing tests cover it).

---

## Notes / open decisions

1. **Why does the new file live in `panes/` but import from `@/components/consultation/**`?** The ppr-01 ESLint zone covers `lib/patient-profile/**`, `Shell.tsx`, and `panes/**`. The forbidden imports are `@/components/consultation/*`, `@/components/ehr/*`, etc. **Re-read the rule:** the zone is `no-restricted-imports`, not `no-restricted-paths`. The restriction is on what FILES IN THE ZONE may import, not on which files can be in the zone. So `panes/ConsultationBodyPane.tsx` will be flagged for its imports of `@/components/consultation/*`.
   
   **Resolution:** the panes folder is the **expected exception**. ppr-04 amends ppr-01's ESLint zone to whitelist `panes/**` against the restriction. Concretely:

   ```json
   "overrides": [
     {
       "files": ["components/patient-profile/Shell.tsx", "lib/patient-profile/**"],
       "rules": { "no-restricted-imports": [ ... DL-2 patterns ... ] }
     }
   ]
   ```

   (Drops `components/patient-profile/panes/**` from the zone — panes are allowed to import medical components because that's their job.)

   Document this in the ESLint config comments. Update the ppr-01 task file footer to note "ppr-04 amended this zone — panes folder removed because panes wrap medical components by design."

2. **Why move `CenterPane` instead of re-exporting it?** `CenterPane` is referenced only from `BodyColumnContent`. After the move, `ConsultationCockpit.tsx` no longer references it. Moving keeps the body pane self-contained.

3. **Why preserve the legacy props (`headerLeadingExtra`, `slotIndex`, etc.) even though v2 won't use them?** v1 is still shipping during the kill-switch window. Removing them now would break v1. ppr-14 deletes them after the old shell is gone.

---

## References

- **Affected files:**
  - new `frontend/components/patient-profile/panes/ConsultationBodyPane.tsx`
  - new `frontend/components/patient-profile/panes/internal/CenterPane.tsx`
  - mod `frontend/components/consultation/ConsultationCockpit.tsx` (~ −200 LOC)
  - mod `frontend/.eslintrc.json` (drop `panes/**` from the DL-2 zone)
- **Source decision:** R2.1 in [Product plans/plan-patient-profile-shell-rebuild.md](../../../../Product%20plans/plan-patient-profile-shell-rebuild.md).
- **Next task:** [`task-ppr-05-extract-rx-pane.md`](./task-ppr-05-extract-rx-pane.md) — same chat OK, same pattern.

---

**Owner:** TBD
**Created:** 2026-05-13
**Status:** Done
