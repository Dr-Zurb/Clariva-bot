# cmi-01 · InvestigationsPane component

> **Wave 1** of the [cockpit-middle-investigations batch](../plan-cockpit-middle-investigations-batch.md). Extract the existing investigations chip-row + autocomplete from `PrescriptionFormCompositionRoot` into a standalone pane component.

| Property | Value |
|---|---|
| **Owner** | Frontend |
| **Size** | M (one new file ~120-180 LOC; small mod to composition root ~15 LOC) |
| **Model** | **Auto** — extraction + RxFormContext subscription; mirrors SubjectivePane / ObjectivePane |
| **Wave** | 1 |
| **Depends on** | cv2-04 (`investigationsOrders` field), cv2-05 (`RxFormContext`), csf-03 (existing placeholder this replaces) |
| **Blocks** | cmi-02 (template wire-up) |

---

## Goal

Create `frontend/components/patient-profile/panes/InvestigationsPane.tsx` that:

1. Mirrors the shape of `SubjectivePane` / `ObjectivePane`: small wrapper that mounts the real input UI via `RxFormContext`.
2. Hosts the existing investigations chip-row + autocomplete from `PrescriptionFormCompositionRoot.tsx`.
3. Subscribes to `useRxForm()` for `fields.investigationsOrders` (string slot — DL-2).
4. Renders read-only when the cockpit state denotes ended / terminal (DL-5).
5. Coexists with the standalone `<PrescriptionForm>` composition root used in appointment-detail / in-call / post-call mounts (DL-3 from `plan-cockpit-v2.md` — three-mount-surface invariant).

---

## What to do

### 1. Inventory the existing investigations chip-row

Open `frontend/components/cockpit/rx/PrescriptionFormCompositionRoot.tsx`. Find the JSX block that renders the investigations chip-row + the autocomplete input. Likely a sub-block inside the Plan section render — search for `investigationsOrders` or `investigations` keywords.

Identify:

- The chip-row sub-component (likely `<InvestigationsChipRow>` or inline JSX; could be in its own file under `frontend/components/cockpit/rx/inputs/` already).
- The autocomplete component (likely `<DrugAutocomplete>` reused, or a dedicated `<InvestigationAutocomplete>`).
- Any free-text override field (e.g., a single textarea that mirrors the chip-row as a fallback for unstructured input).
- The current state subscription pattern — how does the chip-row read / write `fields.investigationsOrders`?
- The read-only gate — does the existing implementation already check `canEditPrescriptionDraft(state)`? If not, this task adds it.

Document the inventory at the top of the new file as a comment, mirroring SubjectivePane's header style.

### 2. Create the new pane component

`frontend/components/patient-profile/panes/InvestigationsPane.tsx`:

```tsx
"use client";

/**
 * InvestigationsPane — pane wrapper that hosts the cv2-04 investigations
 * chip-row in its own pane within the Telemed-Video tree (and siblings).
 * Created by cmi-01 (2026-05-21) replacing the csf-03 `<PanePlaceholder>`.
 *
 * Reads `RxFormContext.fields.investigationsOrders` via the lifted provider
 * in PatientProfilePage (csf-01). Edits flow back through `setField` and
 * trigger the existing single-debounce autosave.
 *
 * Read-only mode (DL-5): when state denotes ended / terminal, the `[+ add]`
 * affordance is hidden and existing chips render as static badges.
 *
 * @see frontend/components/cockpit/rx/PrescriptionFormCompositionRoot.tsx —
 *      source of the chip-row UI; this file consumes the same sub-component
 *      so the standalone composition root and the pane share behavior.
 * @see frontend/components/cockpit/rx/RxFormContext.tsx — state owner.
 * @see docs/Work/Daily-plans/May 2026/21-05-2026/cockpit-middle-investigations/
 *      Tasks/task-cmi-01-investigations-pane.md
 */

import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import { canEditPrescriptionDraft, type CockpitState } from "@/lib/patient-profile/state";
import { InvestigationsChipRow } from "@/components/cockpit/rx/inputs/InvestigationsChipRow";
// (Adjust the import to wherever the existing chip-row component lives — see §1 inventory.)

export interface InvestigationsPaneProps {
  /** Cockpit state — drives read-only mode (DL-5). */
  state: CockpitState;
  hideHeader?: boolean;
}

export default function InvestigationsPane({
  state,
  hideHeader = false,
}: InvestigationsPaneProps): JSX.Element {
  const { state: rxFormState, setField } = useRxForm();
  const value = rxFormState.fields.investigationsOrders;
  const isEditable = canEditPrescriptionDraft(state);

  return (
    <div className="flex h-full flex-col overflow-y-auto px-4 py-3">
      {!hideHeader && (
        <h3 className="mb-2 text-sm font-medium text-foreground">Investigations</h3>
      )}
      <InvestigationsChipRow
        value={value}
        onChange={(next) => setField("investigationsOrders", next)}
        disabled={!isEditable}
      />
    </div>
  );
}
```

If the existing chip-row component doesn't live in its own file (i.e., it's inline JSX inside `PrescriptionFormCompositionRoot`), this task EXTRACTS it first into `frontend/components/cockpit/rx/inputs/InvestigationsChipRow.tsx`. The extraction is mechanical: take the JSX, move it to the new file, replace the inline props with explicit `value` + `onChange` + `disabled` props. Re-import into both `PrescriptionFormCompositionRoot.tsx` (still consumes it inline for the standalone mount) and the new `InvestigationsPane.tsx`.

### 3. Update `PrescriptionFormCompositionRoot.tsx`

Two cases:

**Case A: Cockpit-only mount.** The composition root is only used in non-cockpit mounts (appointment-detail / in-call / post-call). In this case, the chip-row stays exactly where it is. The new pane consumes the SAME chip-row component, so both surfaces render identical UI.

**Case B: Composition root also used in legacy 3-pane cockpit (`?v1=1`).** In this case, the composition root must continue rendering the chip-row inline because the legacy 3-pane layout doesn't have a separate Investigations pane. Both pathways consume the same `<InvestigationsChipRow>` component.

Either way, the rule is: **don't remove the chip-row from the composition root**. It stays so that:
- The 3 non-cockpit mounts (DL-3 invariant) keep working.
- The `?v1=1` kill-switch keeps working.

The cockpit 8-pane tree consumes `<InvestigationsPane>`; the legacy / standalone mounts consume `<PrescriptionFormCompositionRoot>` which still renders the chip-row inline. The chip-row component itself is the shared dependency.

### 4. Unit test

Add a minimal render test to `frontend/components/patient-profile/panes/__tests__/InvestigationsPane.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import InvestigationsPane from '../InvestigationsPane';
import { RxFormProvider } from '@/components/cockpit/rx/RxFormContext';

describe('InvestigationsPane', () => {
  it('renders the chip-row when in editable state', () => {
    render(
      <RxFormProvider initialFields={{ investigationsOrders: 'ECG; Trop-I' }}>
        <InvestigationsPane state="live" hideHeader />
      </RxFormProvider>,
    );
    // Expect chip-row to render with the value visible.
    expect(screen.getByText(/ECG/i)).toBeInTheDocument();
  });

  it('hides the add affordance in read-only state', () => {
    render(
      <RxFormProvider initialFields={{ investigationsOrders: '' }}>
        <InvestigationsPane state="ended" hideHeader />
      </RxFormProvider>,
    );
    // No "+ add" button visible.
    expect(screen.queryByRole('button', { name: /add/i })).not.toBeInTheDocument();
  });
});
```

(Adjust the test fixtures to match the actual chip-row UI — exact assertion patterns depend on what the existing component renders.)

### 5. Smoke at dev fixture (NOT committed)

Build a temporary fixture page at `frontend/app/dashboard/_dev/inv-pane-fixture/page.tsx`:

```tsx
"use client";
import { RxFormProvider } from '@/components/cockpit/rx/RxFormContext';
import InvestigationsPane from '@/components/patient-profile/panes/InvestigationsPane';

export default function InvPaneFixturePage() {
  return (
    <RxFormProvider initialFields={{ investigationsOrders: '' }}>
      <div className="h-64 w-96 border">
        <InvestigationsPane state="live" hideHeader />
      </div>
    </RxFormProvider>
  );
}
```

Verify chip-add, chip-remove, autocomplete suggestions, read-only mode (by passing `state="ended"`). **Do NOT commit this file.**

---

## Files touched

- **New:** `frontend/components/patient-profile/panes/InvestigationsPane.tsx` (~120-180 LOC).
- **(Possibly new):** `frontend/components/cockpit/rx/inputs/InvestigationsChipRow.tsx` — if the chip-row didn't already have its own file. Otherwise unchanged.
- **Modified:** `frontend/components/cockpit/rx/PrescriptionFormCompositionRoot.tsx` (~5-15 LOC: import the extracted chip-row component instead of inline JSX, if extraction was needed).
- **New:** `frontend/components/patient-profile/panes/__tests__/InvestigationsPane.test.tsx` (~50 LOC).
- **(Dev fixture, not committed):** `frontend/app/dashboard/_dev/inv-pane-fixture/page.tsx`.

---

## Acceptance gate

- [x] `InvestigationsPane` exports default from new file. `pnpm --filter frontend tsc --noEmit` clean.
- [x] `pnpm --filter frontend lint` clean.
- [x] Component subscribes to `useRxForm()`; reads `state.fields.investigationsOrders`.
- [x] Chip-row component is shared with the composition root (single source of truth for chip-row UI).
- [x] Read-only mode when `state === 'ended'` or `'terminal'` — `[+ add]` affordance hidden; chips not removable.
- [x] PrescriptionFormCompositionRoot still renders the chip-row inline for non-cockpit mounts (DL-3 preserved).
- [x] Unit test passes (`InvestigationsPane.test.tsx`).
- [x] Existing investigations-related tests in `PrescriptionForm.test.tsx` (if any) still pass — regression-free.
- [x] Dev fixture verified locally; deleted before commit.
- [x] No new packages installed.

---

## Anti-goals

- ❌ Don't refactor the chip-row UI. Move + share; don't redesign.
- ❌ Don't add new autocomplete sources. The existing suggestion mechanism stays.
- ❌ Don't introduce a new save mechanism — autosave fires via the existing `RxFormContext` debounce.
- ❌ Don't wire this pane into `templates.tsx` yet — that's cmi-02.
- ❌ Don't migrate `investigations_orders` to a structured array — DL-2 keeps it as the existing string slot.
- ❌ Don't add the narrow-monitor auto-merge here — DL-6 defers to `cockpit-middle-rebuild`.
- ❌ Don't commit the dev fixture.

---

## Notes

- The extraction is the load-bearing decision. If `InvestigationsChipRow` becomes the single source of truth for the chip-row UI, future plans that want to tweak investigations UX (e.g., structured ordered tests in V2-D4-adjacent plans) update one file. Without the extraction, every change must update both pane + composition root in lockstep.
- The chip-row component already participates in autosave via the parent's `useRxForm()` setField call. The new pane uses the SAME hook in the SAME provider, so autosave Just Works.
- If the executor discovers the chip-row's existing component is tightly coupled to surrounding state (e.g., it expects a parent ref or a sibling component), the cleanest fix is to extract its props into an explicit `{ value, onChange, disabled }` interface and re-thread the parent's wiring. Document the prop refactor in a code comment.
- Read-only mode uses the existing `canEditPrescriptionDraft(state)` helper from `state.ts`. No new gate function.
- Add the pane to the React DevTools tree visualization — eyeballing the component count after this lands should show no new providers (cv2-08 invariant: single `<RxFormProvider>`).
