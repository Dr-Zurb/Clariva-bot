# cmr-03 · PlanActionFooter — sticky Save + Send Rx footer

> **Wave 1 lane α (third task)** of the [cockpit-middle-rebuild batch](../plan-cockpit-middle-rebuild-batch.md). Lift the SaveStatus pill + Save + Send-Rx-and-finish buttons into a sticky footer spanning both Investigations + Plan sub-columns.

| Property | Value |
|---|---|
| **Owner** | Frontend |
| **Size** | S (one new component ~120-180 LOC; minor extraction of existing buttons if needed) |
| **Model** | **Auto** — wraps existing buttons with sticky positioning + spanning layout |
| **Wave** | 1 (lane α) |
| **Depends on** | Existing SaveStatus pill (`useAutoSave` exposes saving / savedAt); existing `Send Rx & finish` button from `PrescriptionForm` / `RxWorkspace`; `RxFormContext` |
| **Status** | ✅ Done (2026-05-23) |
| **Blocks** | cmr-06 (wires into templates); cmr-07 (telemetry) |

---

## Goal

Create `frontend/components/cockpit/middle/PlanActionFooter.tsx` — a `position: sticky; bottom: 0` overlay rendered inside the bottom-row's render path. Spans both Investigations + Plan sub-columns. Hosts:

1. **SaveStatus pill** — `Saved · {time}` / `Saving…` / `Save error: …` (existing component, mirrors `useAutoSave` from cv2-05).
2. **`[Save]` button** — explicit save trigger (rare path; cv2 DL-4 says no manual save button — but the source plan §4 footer ASCII art shows `[Save]` next to Send. Reconcile: in cv2, autosave is the only save mechanism, so `[Save]` here is a force-save / flush-pending affordance, NOT a "save draft" toggle. If executor finds DL-4 strictly prohibits any [Save] button, omit and capture-inbox.)
3. **`[Send Rx & finish ▸]` button** — primary blue CTA, source plan DL-1. Visibility gated by `canSendPrescription(state)` (existing helper).
4. Read-only / hidden when state is `terminal` (no send possible) or `ended` AFTER successful send (rare).

---

## What to do

### 1. Reconcile the `[Save]` button vs DL-4

Source plan DL-4 (preserved from the superseded Rx-pane plan): "Autosave contract is untouched. 1.5s debounce, no 'Save draft' button, SaveStatus pill remains the single status surface."

The source plan §4 ASCII art shows `Saved · 12:04   [Save] [Send Rx ▸]` — but read in context, the `[Save]` slot may just be highlighting the SaveStatus pill, not a button.

**Decision:** Ship WITHOUT a separate `[Save]` button. Autosave is the only save path; the pill is the only status surface. If a doctor needs to flush a pending edit immediately (rare), the existing autosave debounce (1.5s) is fast enough.

Update the strip layout: `Saved · {time}  |  [Send Rx & finish ▸]` — pill on the left, primary button on the right. Capture-inbox if doctor feedback later asks for a manual flush button.

### 2. Build the footer component

```tsx
"use client";

/**
 * PlanActionFooter — sticky-bottom overlay inside the bottom-row of the
 * cockpit-v2 middle column. Hosts the SaveStatus pill (left) and the
 * primary `[Send Rx & finish ▸]` button (right). Source plan DL-1 + DL-20:
 * spans both Investigations + Plan sub-columns; pinned during scroll so
 * the Send button is always reachable.
 *
 * Save mechanism unchanged from cv2-05's RxFormContext autosave (1.5s
 * debounce). No `[Save]` button — DL-4 reaffirmed.
 *
 * Visibility gated by `canSendPrescription(state)`:
 *   - terminal → entire footer hides (no Send to issue).
 *   - ready / lobby → Send disabled (consult not in flight); pill visible.
 *   - live / wrap_up / ended → Send enabled.
 *
 * @see frontend/components/cockpit/rx/RxFormContext.tsx — autosave source.
 * @see frontend/components/cockpit/rx/SendRxFinishButton.tsx — the actual
 *      Send button (extract here if not already standalone).
 * @see docs/Work/Daily-plans/May 2026/21-05-2026/cockpit-middle-rebuild/
 *      Tasks/task-cmr-03-plan-action-footer.md
 */

import { useEffect } from "react";
import { useRxForm } from "@/components/cockpit/rx/RxFormContext";
import { SaveStatusPill } from "@/components/cockpit/rx/SaveStatusPill"; // verify path
import { SendRxFinishButton } from "@/components/cockpit/rx/SendRxFinishButton";
import { canSendPrescription, type CockpitState } from "@/lib/patient-profile/state";
import { trackCockpitV2RMiddleFooterLanded } from "@/lib/patient-profile/telemetry";

export interface PlanActionFooterProps {
  state: CockpitState;
  appointmentId: string;
  onSent?: (prescriptionId: string) => void | Promise<void>;
  onFinishVisit?: () => void;
  finishBusy?: boolean;
}

export function PlanActionFooter({
  state,
  appointmentId,
  onSent,
  onFinishVisit,
  finishBusy = false,
}: PlanActionFooterProps) {
  const { autoSave } = useRxForm();
  const canSend = canSendPrescription(state);

  useEffect(() => {
    trackCockpitV2RMiddleFooterLanded({
      appointmentId,
      canSend,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // one-shot per session

  if (state === "terminal") return null;

  return (
    <div
      role="region"
      aria-label="Prescription actions"
      className="sticky bottom-0 z-10 flex h-[56px] w-full items-center justify-between gap-3 border-t bg-card px-4 py-2"
    >
      <SaveStatusPill saving={autoSave.saving} savedAt={autoSave.savedAt} error={autoSave.error} />
      {canSend && (
        <SendRxFinishButton
          appointmentId={appointmentId}
          onSent={onSent}
          onFinish={onFinishVisit}
          finishBusy={finishBusy}
        />
      )}
    </div>
  );
}
```

If `<SaveStatusPill>` doesn't exist as a standalone component (it may be inline JSX inside `PrescriptionForm`), this task EXTRACTS it first — small mechanical refactor.

If `<SendRxFinishButton>` already exists (verify — the file `frontend/components/cockpit/rx/SendRxFinishButton.tsx` is in the codebase per the Glob), reuse it as-is. Its existing prop signature dictates how this footer wires to it.

### 3. Wire the prop chain

The new footer takes `appointmentId`, `onSent`, `onFinishVisit`, `finishBusy` as props. These are passed via the templates.tsx ctx (already populated in tmr-01 / csf-02's `TelemedVideoContext`). cmr-06 wires the ctx → footer prop drilling.

### 4. Verify cv2-08 single-provider invariant

The footer subscribes to `useRxForm()` (the lifted provider from csf-01). No new provider. React DevTools should show exactly one `<RxFormProvider>` after this lands.

### 5. Update RxWorkspace / PrescriptionForm to remove the inline action area

The existing `<RxWorkspace>` (or `<PrescriptionForm>`'s composition root) renders the Send button + SaveStatus pill inline at the bottom of the form body. After the new footer takes over those affordances in the cockpit context, the inline render must NOT double-render.

Two paths:
- **Path A: Conditional gate via `dxLifted`-style prop.** Add `actionsInFooter?: boolean` to `<RxWorkspace>` / `<PrescriptionForm>`. When true, the inline action area is suppressed. cockpit mount passes true; non-cockpit mounts pass false (default).
- **Path B: Compositional split.** The cockpit middle column composes the bottom-row WITHOUT the inline action area; non-cockpit mounts use a wrapper that includes the inline action area. Cleaner but more invasive.

Pick Path A for this task — minimal disruption to non-cockpit mounts (DL-3 invariant).

### 6. Unit test

`frontend/components/cockpit/middle/__tests__/PlanActionFooter.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { PlanActionFooter } from '../PlanActionFooter';
import { RxFormProvider } from '@/components/cockpit/rx/RxFormContext';

describe('PlanActionFooter', () => {
  it('hides entirely in terminal state', () => {
    const { container } = render(/* state="terminal" */);
    expect(container.firstChild).toBeNull();
  });

  it('shows Send button when canSendPrescription(state) is true', () => {
    render(/* state="live" */);
    expect(screen.getByRole('button', { name: /send rx/i })).toBeInTheDocument();
  });

  it('hides Send button when canSendPrescription(state) is false (ready)', () => {
    render(/* state="ready" */);
    expect(screen.queryByRole('button', { name: /send rx/i })).not.toBeInTheDocument();
  });

  it('shows SaveStatus pill always (when not terminal)', () => {
    render(/* state="ready" */);
    expect(screen.getByText(/saved|saving/i)).toBeInTheDocument();
  });
});
```

---

## Files touched

- **New:** `frontend/components/cockpit/middle/PlanActionFooter.tsx` (~120-180 LOC).
- **(Possibly new):** `frontend/components/cockpit/rx/SaveStatusPill.tsx` — if not already standalone, extract from `PrescriptionForm` or `useAutoSave`.
- **Modified (Path A):** `frontend/components/consultation/cockpit/RxWorkspace.tsx` — add `actionsInFooter?: boolean` prop; hide inline actions when true.
- **Modified:** `frontend/components/consultation/PrescriptionForm.tsx` — same prop addition if the composition root is used in non-cockpit mounts and needs the inline path.
- **New:** `frontend/components/cockpit/middle/__tests__/PlanActionFooter.test.tsx` (~70 LOC).

---

## Acceptance gate

- [x] `PlanActionFooter` exports from new file.
- [x] Sticky-bottom positioning verified at dev fixture.
- [x] `[Send Rx & finish ▸]` button visible when `canSendPrescription(state)` returns true; hidden otherwise.
- [x] Entire footer hides when state is `terminal`.
- [x] SaveStatus pill renders correctly across states (Saved · {time}, Saving…, error).
- [x] `<RxWorkspace>` / `<PrescriptionForm>` accept `actionsInFooter?: boolean` prop. When true (cockpit mount), inline action area is suppressed.
- [x] Three non-cockpit mount surfaces (DL-3 from cv2 plan) still render the inline action area unchanged.
- [x] Unit tests pass.
- [x] Dev fixture verified locally; deleted before commit.
- [x] No new packages installed.

---

## Anti-goals

- ❌ Don't add a `[Save]` button — DL-4 prohibits.
- ❌ Don't introduce a second send code-path. Reuse `<SendRxFinishButton>` and its existing `onSent` / `onFinish` callbacks.
- ❌ Don't introduce a second `<RxFormProvider>`.
- ❌ Don't duplicate the SaveStatus pill component (extract once, reuse twice).
- ❌ Don't gate the footer by template — it renders the same across Video / Voice / Text / Review (modulo Review hiding Send via the canSend gate naturally).

---

## Notes

- The Send button's existing keyboard shortcut (`Cmd+Enter` via `useShellHotkeys`) continues to work because the hotkey hook is in `PatientProfilePage`, not in `<RxWorkspace>`. The hotkey calls the same `onFinishVisit` handler the footer button binds to.
- The `[Save]` decision is the load-bearing reconciliation between source plan §4 ASCII art and DL-4. Document it in the footer's JSDoc.
- If `<SendRxFinishButton>` (which already exists in the codebase) has internal state for `finishBusy` / `sending`, the footer just passes the handlers; the button manages its own busy state.
- Sticky-bottom inside the bottom-row's scroll container — same mechanism as cmr-02's sticky-top. Both depend on cmr-06 wrapping the bottom-row with `overflow-y: auto`.
