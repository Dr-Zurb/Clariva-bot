# Task pf-04: `<WrapUpDialog>` component

## 07 May 2026 — Batch [Patient seeing flow](../plan-patient-flow-batch.md) — Phase 1, Lane β step 1 — **M, ~4h**

---

## Task overview

The keystone UI surface. A modal that opens from the cockpit header "Done with patient" CTA (pf-05) and from the auto-trigger after Send Rx. Two mandatory fields — diagnosis (free text + tag chips with autocomplete from pf-02's `/v1/diagnoses/recent`) and follow-up (one-click chips: `1 wk`, `1 mo`, `no follow-up`, plus custom date) with a kind radio (`In-person` / `Tele`).

On submit it calls `POST /v1/appointments/:id/wrap-up` (pf-02), closes the dialog, and the cockpit transitions to `ended` (or to `<NextPatientCountdown>` when pf-11 lands).

**Estimated time:** ~4h. Composition over `Dialog` + `Input` + `Badge` + `Button` primitives. Bulk of the time is autocomplete + form-validation polish.

**Status:** Shipped (2026-05-08).

**Hard deps:** [pf-02](./task-pf-02-wrapup-backend.md) shipped (endpoint contract), [pf-03](./task-pf-03-cockpit-state-wrapup.md) shipped (state).

**Source:** [plan-patient-seeing-flow.md § P1.1](../../../../Product%20plans/plan-patient-seeing-flow.md#p11--wrapupdialog-component).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**. Pattern A — bounded UI work, primitives all exist (A2 / D1 batch shipped them).

**Why not Opus:** the spec is concrete (sections, primary action, side-trigger). Composition over existing primitives.

**New chat?** **Yes — fresh chat.** Pre-load:
- This task file.
- `frontend/components/consultation/MarkCompletedForm.tsx` (the form this dialog absorbs).
- `frontend/components/ui/dialog.tsx`, `frontend/components/ui/input.tsx`, `frontend/components/ui/badge.tsx`, `frontend/components/ui/button.tsx`.
- `frontend/lib/api/appointments.ts` (or wherever your appointment-API client lives — model the wrap-up call after the existing PATCH appointment).
- pf-02's locked controller spec (paste the request shape).

**Composer-OK sub-steps:** none.

**Estimated turns:** 3–5 Sonnet turns. Escalate to Opus per-message if the form-validation logic gets thorny.

---

## Acceptance criteria

### Component shape

- [ ] New file `frontend/components/consultation/cockpit/WrapUpDialog.tsx` exporting:

  ```ts
  export interface WrapUpDialogProps {
    open: boolean;
    appointmentId: string;
    appointmentSummary?: { patientName?: string | null; modality: 'text' | 'voice' | 'video' | 'in_clinic' };
    initialDiagnosisText?: string | null;
    initialDiagnosisTags?: string[];
    initialFollowupDate?: string | null;     // ISO YYYY-MM-DD
    initialFollowupKind?: 'none' | 'in_person' | 'tele' | null;
    onClose: () => void;
    onSaved: (updated: Appointment) => void;
  }
  export function WrapUpDialog(props: WrapUpDialogProps): JSX.Element;
  ```

### Sections (in order, top-to-bottom)

1. **Header strip** — `Done with {patientName ?? 'walk-in'}` + a passive line **for telemedicine consults only**: *"We'll DM the chat history to the patient on close."* (Per source plan P-Q5.)

2. **Diagnosis section:**
   - `<Input>` for free text — `placeholder="Primary diagnosis (free text)"`, `maxLength=2000`.
   - Below: a row of `<Badge>` chips — toggleable. Source: `useRecentDiagnosisTags()` hook (see below).
   - Selected chips show as `Badge variant="default"`; unselected as `variant="outline"`. Click to toggle.
   - "+ tag" inline-input lets the doctor add a new tag. Capped at 20 selected (pf-02 validation).
   - **Mandatory:** at least one of `diagnosis_text` (non-empty after trim) OR `diagnosis_tags.length > 0` must be set. The submit button stays disabled with a tooltip otherwise.

3. **Follow-up section:**
   - Three primary one-click chips: `1 wk`, `1 mo`, `no follow-up`.
   - `1 wk` → sets `followup_date = today + 7d`, `followup_kind = 'in_person'` by default.
   - `1 mo` → sets `followup_date = today + 30d`, same kind default.
   - `no follow-up` → sets `followup_date = null`, `followup_kind = 'none'`.
   - Below the chips: `Custom date` toggle reveals a `<Input type="date">` + the kind radio: `In-person` / `Tele`.
   - **Mandatory:** one of the three chips selected OR a custom date set.

4. **Footer:**
   - Primary button **`Save & next ▸`** — submits, calls onSaved, closes the dialog. (pf-11 / pf-05 own what "next" means in the surrounding cockpit.)
   - Secondary button **`Save & stay`** — submits, calls onSaved with a flag like `{ stayOnPage: true }`, closes the dialog.
   - Tertiary `Cancel` — closes without submitting (also fires on `Esc`).

### Hooks

- [ ] **`useRecentDiagnosisTags()`** — `frontend/hooks/useRecentDiagnosisTags.ts` (NEW). Calls `GET /v1/diagnoses/recent?limit=20` once on first mount of any dialog instance per session. Caches via React Query / SWR (whichever this codebase uses; match neighbors). Returns `{ tags: Array<{ tag: string; uses: number }>, isLoading }`.

### Submit flow

- [ ] Submit button POSTs to `/v1/appointments/:id/wrap-up` with the validated body.
- [ ] On success: `onSaved(updated)` then `onClose()`.
- [ ] On error: surface in a small `<Alert>` strip below the footer; do not auto-close.
- [ ] Form is dirty-tracking: closing with unsaved changes prompts `"Discard wrap-up notes?"` — except when the dialog was auto-triggered (props get a `triggeredAt: 'auto' | 'manual'` discriminator so we skip the prompt for auto-triggered closes).

### General

- [ ] Type-check + lint clean.
- [ ] No new external dependencies — use existing `date-fns` / locale helpers and existing primitives.
- [ ] Accessible: `<Dialog>` traps focus correctly, `Esc` cancels, primary button has `autoFocus` after dirty.
- [ ] Renders cleanly in both light and dark modes (matches A1 design tokens).

---

## Out of scope

- **Auto-trigger logic** — pf-04 only owns the dialog. The decision "open dialog automatically after Send Rx" lives in `ConsultationCockpit` and is wired in pf-05.
- **Voice / dictation** — source plan P6.3 parked it for T6 (AI assist).
- **Per-specialty fields** — source plan P6.4 parked it.
- **`<MarkCompletedForm>` deletion** — pf-05 deletes it (after pf-04 absorbs the surface).

---

## Files expected to touch

**New:**
- `frontend/components/consultation/cockpit/WrapUpDialog.tsx` (~280 LOC)
- `frontend/hooks/useRecentDiagnosisTags.ts` (~40 LOC)

**Modified:** none — the component is mounted by pf-05.

**Deleted:** none.
**Backend / migrations:** none (pf-01 + pf-02 own).

---

## Notes / open decisions

1. **Default kind = `in_person`.** Most consults are; defaulting reduces taps. Telehealth doctors can flip via the radio in two clicks.
2. **Why "Save & next" vs "Save & stay" instead of one button.** Doctors need an escape hatch when they click Done but realise they want to look back at the call. The countdown (pf-11) only fires on Save & next.
3. **Telemed DM line is passive.** Per P-Q5 — no toggle, just informational. Doctors don't need another decision in this dialog.
4. **Cancelled / no-show appointments** — pf-05's CTA visibility check should NOT show the button for these states (prop-driven), so this dialog never opens for them. P-Q3 closure.
5. **Mandatory-field UX.** Tooltip on the disabled `Save & next` reads: *"Add a diagnosis or pick a follow-up to save."* Keep it forgiving; no red asterisks on inputs.

---

## References

- **Source plan:** [plan-patient-seeing-flow.md § P1.1](../../../../Product%20plans/plan-patient-seeing-flow.md#p11--wrapupdialog-component)
- **Endpoint contract:** [task-pf-02-wrapup-backend.md § Acceptance criteria](./task-pf-02-wrapup-backend.md#acceptance-criteria)
- **State this dialog produces:** [task-pf-03-cockpit-state-wrapup.md](./task-pf-03-cockpit-state-wrapup.md)
- **Form being absorbed:** `frontend/components/consultation/MarkCompletedForm.tsx`
- **Cost-aware model strategy — Pattern A:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md § Pattern A](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md#pattern-a-standard-sub-batch-execution-the-80-case)

---

**Owner:** TBD
**Created:** 2026-05-07
**Status:** Shipped (2026-05-08).
