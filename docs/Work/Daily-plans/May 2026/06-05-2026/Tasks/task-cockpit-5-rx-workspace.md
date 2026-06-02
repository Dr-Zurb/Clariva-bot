# Task cockpit-5: Rx workspace shell + PreviousRxPopover + sticky action bar

## 06 May 2026 — Batch [Cockpit redesign](../plan-cockpit-redesign-batch.md) — Lane β (parallel after cockpit-2) — **M, ~4h**

---

## Task overview

Builds the **Rx workspace** that lives in the cockpit's right column. It wraps the existing `<PrescriptionForm>` (no logic surgery on the form itself) and adds the cockpit-specific affordances:

- **Top:** allergy clash banner (`AllergyClashBanner`) + drug interactions chips (`InteractionChips`) — pinned to the top of the pane, not buried inside the form scroll.
- **Header chip strip:** "Templates ▾" (existing `TemplatePicker`) and "Previous (n) ▾" — a new collapsible popover that lists the last 3 prescriptions with a one-click "Copy medicines" action.
- **Body:** the existing `<PrescriptionForm>` rendered without its own card chrome (the workspace owns the chrome).
- **Sticky bottom action bar:** `<SaveStatus>` pill + `Send to patient` button. Send button **disabled** unless `state ∈ {live, ended}` (per K3).

Lane β is **independent** — it builds new files only and never edits cockpit-2's `ConsultationCockpit.tsx`. cockpit-3 will import `<RxWorkspace>` and wire it; β just builds the component.

**Estimated time:** ~4h. ~3.5h impl, ~30min smoke.

**Status:** Shipped (2026-05-06).

**Hard deps:** [cockpit-2](./task-cockpit-2-shell.md) ships the mount slot. cockpit-1's state helper is also referenced for the Send button gate.

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium** for the whole task. Wrapping an existing component + small new popover + sticky bar — no architectural calls.

**Why no Opus design call:** Lane β is "additive UI". The behaviour of `PrescriptionForm` is preserved verbatim; β builds a new shell around it.

**New chat?** **Yes — own chat for lane β.** Pre-load: this task file + the **first 200 lines** of `frontend/components/consultation/PrescriptionForm.tsx` (don't paste the full 1476-line file — it'll blow up context. Just the props interface + the existing imports for `AllergyClashBanner` / `InteractionChips` / `SaveStatus` / `TemplatePicker`). The component is the dependency surface, not the impl detail.

**Multi-chat coordination:**
- This chat is **lane β**. Tell the agent in the first prompt: *"This is lane β — Rx workspace. I am only allowed to create new files under `frontend/components/consultation/cockpit/`. I must NOT edit `ConsultationCockpit.tsx`, `PrescriptionForm.tsx`, or any file in lanes γ / δ."*
- Wait until cockpit-2 has shipped the mount slot. The plan-batch's parent will ping the β window.

**Escalate per-message to Opus** if Sonnet tries to "improve" `PrescriptionForm` itself. The form's autosave logic, allergy matching, pre-send checks, attachments, episode link, etc. are PHI-touching code; do not let a free-floating refactor slip into this task.

**Composer-OK sub-steps:** none.

---

## Acceptance criteria

### `RxWorkspace` component

- [ ] New file `frontend/components/consultation/cockpit/RxWorkspace.tsx`. Props:

  ```ts
  interface RxWorkspaceProps {
    appointmentId: string;
    patientId: string | null;
    token: string;
    state: CockpitState;
    onSent?: (prescriptionId: string) => void | Promise<void>;
  }
  ```

- [ ] Layout (top to bottom inside the right column):
  1. **Banners block** (sticky `top-0`): `<AllergyClashBanner>` + `<InteractionChips>` if either has content. Renders nothing if both empty.
  2. **Header chip strip** (sticky `top-${banners-height}`): `<TemplatePicker>` (existing) + `<PreviousRxPopover>` (new, see below).
  3. **Form body** (scrolls): `<PrescriptionForm>` mounted without its own card. Pass `mode="cockpit"` IF the form supports it; else mount directly. (If a `mode` prop doesn't exist, leave a TODO; β does NOT modify the form to add it.)
  4. **Sticky action bar** (sticky `bottom-0`, `bg-background border-t`): left = `<SaveStatus>` pill (existing); right = `<Button>Send to patient</Button>`.

- [ ] **Send button gate:**
  ```ts
  const canSend = canSendPrescription(state); // from cockpit-1
  <Button disabled={!canSend} ...>Send to patient</Button>
  ```
  When disabled, tooltip: *"Available once the consult is live or ended."*

- [ ] When `state === "ended"`, the form body switches to **read-only** mode (existing form prop / fall back to wrapping in a `pointer-events: none` div with explanatory banner if no readonly prop). A small "+ Add follow-up Rx" button appears below the read-only block — clicking creates a new draft.

### `PreviousRxPopover` component

- [ ] New file `frontend/components/consultation/cockpit/PreviousRxPopover.tsx`. Props:

  ```ts
  interface PreviousRxPopoverProps {
    appointmentId: string;
    patientId: string | null;
    token: string;
    onCopyMedicines?: (medicines: ParsedMedicine[]) => void;
  }
  ```

- [ ] UI: a chip showing `Previous (n)`. `n` is the count of prior Rx for this patient (uses the same data source `PreviousPrescriptions` does — `listPrescriptionsByAppointment` or `listPatientPrescriptions`). Reuse the existing data fetcher; do not duplicate.
- [ ] Click → `<Popover>` with the last 3 prescriptions, each row showing: date, medicines summary (first 2, "+N more"), status pill (`draft` / `sent`).
- [ ] Each row has a small "Copy medicines" button that fires `onCopyMedicines(parsedMedicines)`. The cockpit wires this into `PrescriptionForm`'s state via a new ref-based imperative method? **No — keep it simple:** popover writes to a draft URL (`?fromRx=<id>`); `PrescriptionForm` already has the wiring to hydrate from a `fromPrescriptionId` query (verify in code; if not, leave a TODO and skip "Copy medicines" in V1, just show the list).
- [ ] Empty state: *"No previous prescriptions for this patient."*

### Pinning rules

- [ ] Both banners and the header chip strip use `position: sticky` so they stay visible as the form body scrolls. Stack order: banners on top, chip strip below.
- [ ] Sticky bottom action bar always visible. On Rx forms with many medicines (which can be 10+ rows), the action bar must NOT be lost in the scroll.

### Behavior preservation

- [ ] All `PrescriptionForm` props passed through unchanged: `appointmentId`, `patientId`, `token`, `onSuccess`, `onSent`.
- [ ] Autosave still fires every 1.5s (form behavior).
- [ ] Pre-send checks (`PrescriptionPreSendCheck`) still run on Send.
- [ ] Attachments, episode links, episode follow-up logic — **untouched**.

### General

- [ ] Type-check + lint clean.
- [ ] No console errors.
- [ ] Mobile (≤768px) → see cockpit-7 (the workspace renders inside a `<Sheet>`; cockpit-5 doesn't need to handle that — Sheet just wraps the workspace).

---

## Out of scope

- **Modifying `PrescriptionForm`.** Even adding a `mode="cockpit"` prop is out of scope unless it's a 5-line conditional. If the form's chrome interferes with the workspace layout, leave a TODO and revisit in a follow-up task.
- **The chart pane.** Lane α (cockpit-2/3).
- **The header / Send button placement in the header.** Per K1 + cockpit-4: send is in the Rx pane action bar, not in the header.
- **Mobile sheet wiring.** That's cockpit-7.
- **Walk-in Rx flow.** When `patientId === null`, pass through to `PrescriptionForm`'s existing walk-in handling. β doesn't add new walk-in UX.

---

## Files expected to touch

**New (lane β only creates new files):**
- `frontend/components/consultation/cockpit/RxWorkspace.tsx` (~150 LOC)
- `frontend/components/consultation/cockpit/PreviousRxPopover.tsx` (~120 LOC)

**Modified:** none. (cockpit-3 imports `RxWorkspace`; that's α's edit, not β's.)

**Deleted:** none.

**Backend / migrations:** none.

---

## Notes / open decisions

1. **Why not absorb `<PrescriptionForm>` into `RxWorkspace`.** PHI-touching, autosave, allergy / interaction logic — too much surface to refactor in a UI task. Wrap, don't rewrite.
2. **Why "Previous (n)" as a popover not a list.** The Prescriptions tab in D1 stacked previous Rx above the form. In a side-by-side cockpit the right column is too narrow for a stacked list; a popover keeps it accessible without eating vertical space.
3. **Why pin allergy + interactions banners to the top.** They're the only content where doctors get hurt if they miss them. Burying them inside form scroll is the failure mode the cockpit is fixing.
4. **Why a sticky action bar at the bottom.** Rx forms can have 8+ medicine rows. The doctor should be able to hit "Send" without scrolling back to the top — the form's existing send button is in its header.
5. **`mode="cockpit"` on `PrescriptionForm`.** If we end up adding it: it'd suppress the form's own card chrome + send button (since the workspace owns those). Defer to a follow-up task if the form interference is real.

---

## References

- **Batch plan:** [plan-cockpit-redesign-batch.md § Lane β](../plan-cockpit-redesign-batch.md#lane-β--rx-workspace-1-task-4h-parallel-after-cockpit-2)
- **Hard dep:** [task-cockpit-2-shell.md](./task-cockpit-2-shell.md) (mount slot)
- **State helper:** `frontend/lib/consultation/cockpit-state.ts` (cockpit-1) — `canSendPrescription`, `canEditPrescriptionDraft`.
- **Existing wraps:** `PrescriptionForm` (verbatim), `AllergyClashBanner`, `InteractionChips`, `SaveStatus`, `TemplatePicker`, `PrescriptionPreSendCheck`.

---

**Owner:** TBD  
**Created:** 2026-05-06  
**Status:** Shipped (2026-05-06).
