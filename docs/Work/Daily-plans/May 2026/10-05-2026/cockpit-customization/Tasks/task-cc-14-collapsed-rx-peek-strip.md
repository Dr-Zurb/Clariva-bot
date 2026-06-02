# Task cc-14: `<CollapsedRxRail>` — peek-text strip

## 10 May 2026 — Batch [Cockpit customization](../plan-cockpit-customization-batch.md) — Phase E, Lane β step 0 — **S, ~1.5h**

---

## Task overview

cc-12 made `<RailCollapsedStub>` renderer-prop-friendly. cc-14 ships the **Rx column's** custom renderer: a vertical "peek text" strip that summarizes the in-flight prescription so the doctor can glance at what they've written without expanding the rail.

Today the only piece of `<PrescriptionForm>` state lifted into `<RxWorkspace>` is `medicineCount` (via `onMedicineCountChange`). The peek strip ships **medicine count** today; the spec also documents the additional lifts (investigations / diagnosis-presence) that future tasks should add.

The strip is click-to-expand (the whole rail surface is a click target — clicking anywhere expands), with the chevron icon at the top retaining its existing role as the explicit affordance.

**Estimated time:** ~1.5h.

**Status:** Pending.

**Hard deps:** cc-12 (the renderer prop must exist).

**Source:** [plan-cockpit-customization-batch.md § CC-D4](../plan-cockpit-customization-batch.md#decision-lock-locked-2026-05-10-copied-here-for-stability).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**New chat?** **Yes** — fresh small chat (cc-13's chat is already heavy with chart-section work). Pre-load:
- This task file.
- The cc-12 output (renderer-prop signature on `<RailCollapsedStub>`).
- `frontend/components/consultation/cockpit/RxWorkspace.tsx` (where `medicineCount` is bubbled up via `onMedicineCountChange`; you'll lift it one level so the cockpit can pass it to the renderer).
- `frontend/components/consultation/ConsultationCockpit.tsx` (where the Rx panel is rendered; you'll add a `rxMedicineCount` state and pass it to `<CollapsedRxRail>`).

**Estimated turns:** 2 turns.

---

## Acceptance criteria

### Lift `medicineCount` from `<RxWorkspace>` to `<ConsultationCockpit>`

- [ ] In `<ConsultationCockpit>`, add state and a setter:

  ```ts
  const [rxMedicineCount, setRxMedicineCount] = useState<number>(0);
  ```

- [ ] Pass `setRxMedicineCount` to `<RxWorkspace>` as a new prop, e.g.:

  ```tsx
  <RxWorkspace
    … existing props …
    onMedicineCountChange={setRxMedicineCount}
  />
  ```

- [ ] In `<RxWorkspace>`'s prop signature, add `onMedicineCountChange?: (n: number) => void` (if not already present — based on the cs-NN code it currently keeps the count in local state for `<RxSectionNav>`'s badge; widen the existing prop or add a sibling).
- [ ] In `<RxWorkspace>`'s body, replace the local `medicineCount` `useState` with the prop callback if a parent supplies it; fall back to local state otherwise (backwards compat for non-cockpit uses).

  Implementation pattern:

  ```ts
  // controlled if parent supplies the change handler; uncontrolled otherwise
  const [internalCount, setInternalCount] = useState(0);
  const medicineCount = props.onMedicineCountChange ? rxMedicineCountFromParent : internalCount;
  // Or: keep internal state always but ALSO call props.onMedicineCountChange whenever it changes.
  ```

  - **Simpler approach** (recommended): keep `RxWorkspace`'s internal `medicineCount` state, and on every change also call `props.onMedicineCountChange?.(next)`. The cockpit mirrors into its own state. Two sources of truth, but they're always in sync because the propagation is one-way.

### Create `<CollapsedRxRail>` renderer

- [ ] Create `frontend/components/consultation/cockpit/CollapsedRxRail.tsx`:

  ```tsx
  'use client';

  /**
   * CC-14: Custom renderer for the collapsed Rx rail. Replaces the default
   * chevron + vertical-label content with a "peek text" strip that
   * summarizes the in-flight prescription. Currently surfaces:
   *   - Medicine count (from <RxWorkspace>'s form state via onMedicineCountChange)
   *
   * Future lifts (out of scope for cc-14, but documented here):
   *   - Investigations count — requires <PrescriptionForm> to expose
   *     an `onInvestigationCountChange` prop (mirrors the medicine pattern).
   *   - Diagnosis presence — requires the form to expose
   *     `onDiagnosisChange?: (text: string) => void` so the rail can show
   *     "diagnosis: written" / "diagnosis: pending".
   *
   * Click anywhere on the rail expands it (the whole `<aside>` is wrapped
   * in a click target). The chevron at the top is the explicit affordance
   * for keyboard / AT users.
   */

  import { ChevronRight, ChevronLeft, Pill } from 'lucide-react';
  import type { RailCollapsedStubRendererProps } from './RailCollapsedStub';

  interface CollapsedRxRailProps extends RailCollapsedStubRendererProps {
    /** Current medicine count from `<RxWorkspace>`'s form state. Default 0. */
    medicineCount?: number;
    /** Optional aria-keyshortcuts forwarded to the expand button. */
    ariaKeyShortcuts?: string;
  }

  export default function CollapsedRxRail({
    side,
    label,
    onExpand,
    medicineCount = 0,
    ariaKeyShortcuts,
  }: CollapsedRxRailProps) {
    const ExpandIcon = side === 'left' ? ChevronRight : ChevronLeft;
    const tooltipSide = side === 'left' ? 'right' : 'left';

    return (
      <button
        type="button"
        onClick={onExpand}
        aria-label={`Expand ${label.toLowerCase()} (${medicineCount} medicine${medicineCount === 1 ? '' : 's'})`}
        aria-keyshortcuts={ariaKeyShortcuts}
        className="flex h-full w-full flex-col items-center gap-2 rounded-none p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-inset"
      >
        <ExpandIcon className="h-4 w-4" aria-hidden />
        <span className="my-1 h-px w-6 bg-border" aria-hidden />
        <span className="flex flex-col items-center gap-1">
          <Pill className="h-4 w-4" aria-hidden />
          <span className="text-[11px] font-semibold">
            {medicineCount}
          </span>
          <span className="text-[9px] uppercase tracking-wide [writing-mode:vertical-rl]">
            {medicineCount === 1 ? 'medicine' : 'medicines'}
          </span>
        </span>
      </button>
    );
  }
  ```

  - **Why a `<button>` for the whole surface and not just the chevron?** "Click anywhere expands" — doctors are scanning, the explicit chevron is overhead. A single big-target button matches the user's mental model.
  - **Why vertical-text only for the "medicines" label?** The number reads horizontally (it's almost always 1–2 digits). The unit label needs to fit and vertical-rl handles ≥5 char labels gracefully.
  - **Future lift hooks.** When `<PrescriptionForm>` exposes diagnosis-presence, add a `Stethoscope` icon under the medicines section with "Dx: ✓" / "Dx: …" text. When it exposes investigations count, add a `Microscope` icon. Increase `collapsedSize` if the strip starts feeling cramped (consider 8 or 9 once 3+ items are present).

### Wire the renderer in `<ConsultationCockpit>`

- [ ] In `<ConsultationCockpit>`, when rendering the Rx column's collapsed branch:

  ```tsx
  {rxCollapsed ? (
    <RailCollapsedStub
      side="right"
      label="Prescription"
      onExpand={handleRxExpand}
      ariaKeyShortcuts="]"
      renderer={(props) => <CollapsedRxRail {...props} medicineCount={rxMedicineCount} ariaKeyShortcuts="]" />}
    />
  ) : (
    <RxColumnContent … />
  )}
  ```

  - Note: after cc-04, "right" might be "left" if the doctor reorders the Rx column. The `side` prop is whatever cc-04's render dispatch supplies for the Rx column's current slot.

### Tests

- [ ] In `frontend/components/consultation/cockpit/__tests__/CollapsedRxRail.test.tsx`:
  - "renders 0 medicines when count is 0".
  - "renders the count and 'medicines' label (plural) when count > 1".
  - "renders 'medicine' label (singular) when count is 1".
  - "calling the button calls onExpand".
- [ ] `pnpm --filter frontend tsc --noEmit` clean.

### Manual verification

- [ ] Open the cockpit. Add 2 medicines in the Rx form. Collapse the Rx rail. The collapsed rail shows the chevron, divider, pill icon, "2", and "medicines" (vertically).
- [ ] Add a 3rd medicine while the rail is collapsed. The count updates live to "3" without expanding (because cs-08's `onResize` mirroring keeps the cockpit's `rxMedicineCount` in sync via `<RxWorkspace>`'s state, which fires whether the rail is collapsed or expanded).
- [ ] Remove all medicines. The strip shows "0 medicines".
- [ ] Click anywhere on the collapsed rail. It expands.
- [ ] Press `]`. It collapses again (the existing hotkey wiring is unchanged).

---

## Out of scope

- **Investigation count** — requires `<PrescriptionForm>` to expose an `onInvestigationCountChange` prop. Document as a follow-up; do not change the form here.
- **Diagnosis presence indicator** — same; document as a follow-up.
- **Vitals / problem-list snippets** — those belong on the chart side; the Rx peek strip is for prescription content only.
- **Animated count change** — keep it instant; animation is polish-tier.
- **Customizable peek items per doctor preference** — out of scope for the first ship.

---

## Files expected to touch

**Modified:**
- `frontend/components/consultation/cockpit/RxWorkspace.tsx` (~5 LOC delta — add `onMedicineCountChange?` prop, fire it from the existing `setMedicineCount` call site).
- `frontend/components/consultation/ConsultationCockpit.tsx` (~10 LOC delta — `rxMedicineCount` state, pass-through, renderer wiring).

**New:**
- `frontend/components/consultation/cockpit/CollapsedRxRail.tsx` (~80 LOC).
- `frontend/components/consultation/cockpit/__tests__/CollapsedRxRail.test.tsx` (~80 LOC).

---

## Notes / open decisions

1. **Why a single big-target button instead of a vertically stacked icon?** The whole rail is "the Rx", and the doctor's intent when clicking the collapsed rail is always "expand it back". One unified target reduces decision overhead. The chart's collapsed rail (cc-13) splits into multiple targets because each section icon has a distinct destination — Rx doesn't.
2. **Why mirror `medicineCount` into the cockpit's state and not pass `<RxWorkspace>`'s internal state down via context?** A second source of truth is fine for a 1-int prop. Context would be heavier and the data flow would obscure (consumers wouldn't know where to look). One-way prop mirror via callback is the right shape here.
3. **What happens if the doctor opens the Rx column for the first time mid-session?** `<RxWorkspace>` mounts; the `useEffect` in `<PrescriptionForm>` loads existing draft state; `medicineCount` updates; the cockpit's `rxMedicineCount` updates. Then if the doctor immediately collapses, the peek strip shows the loaded count. Works.
4. **What about a `mode="collapsed"` prop on `<PrescriptionForm>` to skip rendering the heavy form when the rail is collapsed?** Out of scope — the form renders whether or not the panel is collapsed (the panel hides via flex/overflow, the form stays mounted to preserve draft state). If render perf becomes a concern, revisit.

---

## References

- **Affected files:**
  - new `frontend/components/consultation/cockpit/CollapsedRxRail.tsx`
  - `frontend/components/consultation/cockpit/RxWorkspace.tsx`
  - `frontend/components/consultation/ConsultationCockpit.tsx`
- **Predecessor:** [`task-cc-12-rail-collapsed-stub-renderer-refactor.md`](./task-cc-12-rail-collapsed-stub-renderer-refactor.md).
- **Sibling renderer:** [`task-cc-13-collapsed-chart-section-icons.md`](./task-cc-13-collapsed-chart-section-icons.md).

---

**Owner:** TBD
**Created:** 2026-05-10
**Status:** Pending
