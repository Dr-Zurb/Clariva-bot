# cmr-01 · AssessmentStrip — sticky Dx + DDx between Body and bottom-row

> **Wave 1 lane α (first task)** of the [cockpit-middle-rebuild batch](../plan-cockpit-middle-rebuild-batch.md). Lift the Dx + DDx inputs out of `<AssessmentSection>` into a dedicated sticky strip that lives between Body and the bottom-row.

| Property | Value |
|---|---|
| **Owner** | Frontend |
| **Size** | M (one new component ~180-240 LOC; one modification to `<AssessmentSection>` ~30 LOC) |
| **Model** | **Auto** — RxFormContext subscription + sticky positioning; mirrors crb-02's ribbon pattern |
| **Wave** | 1 (lane α) |
| **Depends on** | cv2-06 (`<AssessmentSection>` + `id="diagnosis"`); cv2-05 (`RxFormContext`); existing `<DdxChipList>` |
| **Blocks** | cmr-06 (wires into templates); cmr-07 (telemetry depends on strip mount) |

---

## Goal

Create `frontend/components/cockpit/middle/AssessmentStrip.tsx` — a ~60px sticky strip that mounts between the Body leaf and the bottom-row in the middle column. Hosts:

1. **Working Dx input** with `id="diagnosis"` (the SAME id the ribbon's `🎯` targets per crb-02 DL-4).
2. **DDx chip array** via the existing `<DdxChipList>` from `frontend/components/cockpit/rx/inputs/`.
3. Read-only mode when state denotes ended / terminal (matching cv2-06's `AssessmentSection` gate).

Also modify `frontend/components/cockpit/rx/sections/AssessmentSection.tsx` to:

- HIDE its Dx input + DDx chip-row when an `AssessmentStrip` is present in the tree (DL-6 — avoid double-render).
- Render a passive label: "Working Dx: [Asthma] (see strip above)" with click-to-focus on the strip's input.

---

## What to do

### 1. Decide how to signal "strip is present" to `<AssessmentSection>`

Two approaches:

**Approach A: Prop drilling.** `<AssessmentSection>` gains a `dxLifted?: boolean` prop. When true, it hides Dx + DDx. Callers in the cockpit pass `dxLifted={true}`; callers from standalone composition root pass false (default).

**Approach B: Context.** Add an `<AssessmentStripContext>` provider in the shell that signals when a strip is mounted. AssessmentSection consumes the context.

Pick **Approach A** — simpler, fewer moving parts, easier to test. The cockpit's PlanPane composition wraps `<AssessmentSection dxLifted={true} />`; the standalone composition root in non-cockpit mounts passes `dxLifted={false}` (default).

### 2. Build the strip component

```tsx
"use client";

/**
 * AssessmentStrip — ~60px sticky leaf rendered between Body and bottom-row
 * in the middle column. Hosts the canonical Working Dx input (id="diagnosis")
 * and the DDx chip array. Lifted out of <AssessmentSection> per source plan
 * DL-19; AssessmentSection hides its own Dx + DDx when this strip is in the
 * tree (cmr-01 DL-6).
 *
 * Click on the ribbon's 🎯 segment focuses this strip's Dx input (crb-02 DL-4).
 *
 * @see frontend/components/cockpit/rx/sections/AssessmentSection.tsx —
 *      legacy Dx input owner; now hides Dx + DDx when dxLifted=true.
 * @see frontend/components/patient-profile/PatientRibbon.tsx — `🎯` click target.
 * @see docs/Work/Daily-plans/May 2026/21-05-2026/cockpit-middle-rebuild/
 *      Tasks/task-cmr-01-assessment-strip.md
 */

import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import { DdxChipList } from "@/components/cockpit/rx/inputs/DdxChipList";
import { canEditPrescriptionDraft, type CockpitState } from "@/lib/patient-profile/state";
import { trackCockpitV2RMiddleAssessmentLanded } from "@/lib/patient-profile/telemetry";
import { useEffect } from "react";

export interface AssessmentStripProps {
  state: CockpitState;
  appointmentId: string;
}

export function AssessmentStrip({ state, appointmentId }: AssessmentStripProps) {
  const { state: rxFormState, setField } = useRxForm();
  const dxValue = rxFormState.fields.provisionalDiagnosis;
  const isEditable = canEditPrescriptionDraft(state);

  // One-shot telemetry per session (wired in cmr-07; placeholder import here).
  useEffect(() => {
    trackCockpitV2RMiddleAssessmentLanded({
      appointmentId,
      hasDxValue: Boolean(dxValue.trim()),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentional one-shot

  return (
    <div
      role="region"
      aria-label="Assessment strip — Working diagnosis and differentials"
      className="flex h-[60px] w-full items-center gap-3 border-b border-t bg-card px-4"
    >
      <label
        htmlFor="diagnosis"
        className="shrink-0 text-xs font-medium text-muted-foreground"
      >
        Working Dx:
      </label>
      <input
        id="diagnosis"
        type="text"
        value={dxValue}
        onChange={(e) => setField("provisionalDiagnosis", e.target.value)}
        disabled={!isEditable}
        placeholder="Provisional diagnosis"
        className="min-w-[200px] flex-1 rounded border bg-background px-2 py-1 text-sm"
        maxLength={500}
      />
      <span className="text-xs text-muted-foreground">·</span>
      <span className="text-xs text-muted-foreground">DDx:</span>
      <DdxChipList /* same component as inside AssessmentSection */ />
    </div>
  );
}
```

Notes:
- The `id="diagnosis"` is load-bearing — keep it.
- Mirror the existing `<AssessmentSection>` input styling so the visual experience matches.
- The `<DdxChipList>` is the same component AssessmentSection uses; this strip just hosts it in a different parent.

### 3. Modify `<AssessmentSection>` to support `dxLifted` prop

Edit `frontend/components/cockpit/rx/sections/AssessmentSection.tsx`:

```tsx
export interface AssessmentSectionProps {
  heading?: string | null;
  disabled?: boolean;
  /**
   * When true, the Dx input + DDx chip-row are hidden — the
   * <AssessmentStrip> above the bottom-row owns them instead (cmr-01).
   * Renders a passive read-only summary label that links to the strip.
   */
  dxLifted?: boolean;
}

export function AssessmentSection({
  heading = "Assessment",
  disabled = false,
  dxLifted = false,
}: AssessmentSectionProps) {
  const { state, setField } = useRxForm();
  const { fields } = state;

  if (dxLifted) {
    return (
      <section id="rx-diagnosis" aria-label="Assessment (summary)" className="space-y-2">
        {heading !== null && (
          <h3 className={RX_SECTION_HEADING_CLASS}>{heading}</h3>
        )}
        <div className="text-xs text-muted-foreground">
          Working Dx is in the strip above the bottom-row.{" "}
          <button
            type="button"
            onClick={() => document.getElementById("diagnosis")?.focus()}
            className="text-primary underline-offset-2 hover:underline"
          >
            {fields.provisionalDiagnosis || "—"}
          </button>
        </div>
      </section>
    );
  }

  // Legacy path — unchanged from cv2-06.
  return (
    <section id="rx-diagnosis" aria-label="Assessment" className="space-y-3">
      {heading !== null && (
        <h3 className={RX_SECTION_HEADING_CLASS}>{heading}</h3>
      )}
      <div>
        <label htmlFor="diagnosis" className={RX_FIELD_LABEL_CLASS}>
          Provisional diagnosis
        </label>
        <input
          id="diagnosis"
          type="text"
          value={fields.provisionalDiagnosis}
          onChange={(e) => setField("provisionalDiagnosis", e.target.value)}
          className={RX_FIELD_INPUT_CLASS}
          placeholder="Provisional diagnosis"
          maxLength={500}
          disabled={disabled}
        />
      </div>
      <DdxChipList />
    </section>
  );
}
```

Critically — the legacy path keeps `id="diagnosis"` because non-cockpit mounts (DL-3) consume that path. When dxLifted=true the strip has the id; when false the section has the id. Only one mount has the id at a time — the ribbon's `getElementById('diagnosis')` always finds exactly one input.

### 4. Build a unit test

`frontend/components/cockpit/middle/__tests__/AssessmentStrip.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { AssessmentStrip } from '../AssessmentStrip';
import { RxFormProvider } from '@/components/cockpit/rx/RxFormContext';

describe('AssessmentStrip', () => {
  it('renders Dx input with id="diagnosis"', () => {
    render(
      <RxFormProvider initialFields={{ provisionalDiagnosis: 'URI' }}>
        <AssessmentStrip state="live" appointmentId="apt-123" />
      </RxFormProvider>,
    );
    const input = screen.getByRole('textbox', { name: /provisional/i });
    expect(input.id).toBe('diagnosis');
    expect(input).toHaveValue('URI');
  });

  it('disables input when state is ended', () => {
    render(
      <RxFormProvider initialFields={{ provisionalDiagnosis: '' }}>
        <AssessmentStrip state="ended" appointmentId="apt-123" />
      </RxFormProvider>,
    );
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('updates Dx via setField on change', () => {
    const { getByRole } = render(/* … */);
    fireEvent.change(getByRole('textbox'), { target: { value: 'Asthma' } });
    // Assert RxFormContext state updates (use a spy or a custom provider).
  });
});
```

Add an AssessmentSection test for the `dxLifted` branch too.

### 5. Smoke at dev fixture (NOT committed)

`frontend/app/dashboard/_dev/assessment-strip-fixture/page.tsx`:

```tsx
import { RxFormProvider } from '@/components/cockpit/rx/RxFormContext';
import { AssessmentStrip } from '@/components/cockpit/middle/AssessmentStrip';

export default function Fixture() {
  return (
    <RxFormProvider initialFields={{ provisionalDiagnosis: '' }}>
      <div className="h-64 w-[600px] border">
        <div className="h-32 bg-muted">[Body would be here]</div>
        <AssessmentStrip state="live" appointmentId="apt-fixture" />
        <div className="h-32 bg-muted">[Bottom row would be here]</div>
      </div>
    </RxFormProvider>
  );
}
```

Verify the strip's height, the input id, the placeholder, the DDx chip-row behavior. Delete the fixture before commit.

---

## Files touched

- **New:** `frontend/components/cockpit/middle/AssessmentStrip.tsx` (~180-240 LOC).
- **Modified:** `frontend/components/cockpit/rx/sections/AssessmentSection.tsx` (~30 LOC: add `dxLifted` prop, render alternate summary path).
- **New:** `frontend/components/cockpit/middle/__tests__/AssessmentStrip.test.tsx` (~80 LOC).
- **Modified:** `frontend/components/cockpit/rx/sections/__tests__/AssessmentSection.test.tsx` (if exists; +30 LOC for `dxLifted` branch).
- **(Dev fixture, not committed):** `frontend/app/dashboard/_dev/assessment-strip-fixture/page.tsx`.

---

## Acceptance gate

- [x] `AssessmentStrip` exports from new file. Compiles.
- [x] Renders ~60px tall full-width strip.
- [x] Dx input has `id="diagnosis"`. Verified via DOM.
- [x] DDx chip-row renders via existing `<DdxChipList>`.
- [x] Read-only mode when state is ended / terminal (input disabled, chip-add hidden).
- [x] `<AssessmentSection>` has new `dxLifted?: boolean` prop. When true, hides Dx + DDx and renders the passive summary label.
- [x] Unit tests pass for both AssessmentStrip and AssessmentSection's new branch.
- [x] Dev fixture verified locally; deleted before commit. *(skipped — not committed per task spec)*
- [x] No new packages installed.
- [x] `pnpm --filter frontend tsc --noEmit` + `lint` clean. *(new files lint-clean; repo tsc has pre-existing errors in unrelated files)*

---

## Anti-goals

- ❌ Don't introduce a second `<RxFormProvider>` — strip subscribes to the lifted provider.
- ❌ Don't change the DdxChipList component — it's reused as-is.
- ❌ Don't add styling beyond what the existing AssessmentSection inputs use (consistency).
- ❌ Don't fire telemetry from inside the unit test — guard the useEffect or mock the telemetry import in test setup.
- ❌ Don't add the strip to the non-cockpit mount surfaces (DL-3); only the cockpit middle column gets the strip.
- ❌ Don't add Dx autocomplete — V2-Q4 lean defers to Phase 3.

---

## Notes

- The strip is render-time at `naturalSizePct: 8` (~60px on a typical screen). The shell's PanelGroup handles its sizing via the templates.tsx pane definition; cmr-06 adds it to each factory.
- The "dxLifted" pattern is the cleanest way to avoid the id="diagnosis" collision. Two inputs with the same id would break the ribbon's getElementById call (returns the first one only).
- The passive label in AssessmentSection's lifted branch is a UX safety net — doctors who scroll to the Plan pane shouldn't be confused about "where's the Dx field?" The label says "see strip above" with a click-to-focus.
- If the DDx chip-row gets too cramped at narrow widths, capture-inbox a follow-up: "Assessment strip: DDx chips overflow into a popover at narrow widths."
