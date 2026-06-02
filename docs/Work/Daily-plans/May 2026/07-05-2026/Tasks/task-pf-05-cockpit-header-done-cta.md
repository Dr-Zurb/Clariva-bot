# Task pf-05: Cockpit header — "Done with patient" CTA + retire kebab

## 07 May 2026 — Batch [Patient seeing flow](../plan-patient-flow-batch.md) — Phase 1, Lane β step 2 — **XS, ~1h**

---

## Task overview

Adds the primary-styled `Done with patient` button to the right side of `CockpitHeader`. Visible at state ∈ `{live, wrap_up}`. Wires the click → opens `<WrapUpDialog>` (pf-04). Removes the now-redundant `Mark completed` `DropdownMenuItem` from the existing kebab. Deletes the `<MarkCompletedForm>` component once nothing imports it.

This is the visible keystone — before this lands, the wrap-up flow has no entry point.

**Estimated time:** ~1h. Mostly composition + an import-audit grep pass.

**Status:** Shipped (2026-05-08).

**Hard deps:** [pf-04](./task-pf-04-wrapup-dialog.md) shipped.

**Source:** [plan-patient-seeing-flow.md § P1.5](../../../../Product%20plans/plan-patient-seeing-flow.md#p15--retire-kebab-mark-completed-new-header-cta).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium** for the JSX edit. **Composer 2 Fast** for the kebab item delete + the import-audit + `<MarkCompletedForm>` deletion (these are mechanical).

**Why split:** Sonnet for the header JSX is overkill on diff size but the wiring (state from `ConsultationCockpit`, prop drilling for `appointmentId` / `appointmentSummary`) is non-trivial. The deletion sweep is rote — Composer territory.

**New chat?** **Yes** — fresh chat (Sonnet) for the JSX work. The Composer sub-step can stay in the same chat OR run as a tiny follow-up Composer chat (your call; the second turn doesn't need history).

**Composer-OK sub-steps:** kebab item delete + grep-and-delete `<MarkCompletedForm>` + import audit.

**Estimated turns:** 2 Sonnet turns + 1 Composer turn.

**Multi-chat coordination:**
- This task is the **mount slot** for pf-08 (`<CockpitQueueRail>`). When this lands, post a one-line ping in the γ chat: *"pf-05 has landed; the queue rail mount slot is the new sub-row directly below the existing sticky header strip in `CockpitHeader.tsx:LXX`."*

---

## Acceptance criteria

### Header CTA

- [ ] In `frontend/components/consultation/cockpit/CockpitHeader.tsx`, add a `<DoneWithPatientButton>` (inline component or extracted to a sibling file — your call) on the right side of the header strip, before the kebab.
- [ ] Button is **visible** when `state === 'live' || state === 'wrap_up'`. **Hidden otherwise.**
- [ ] Button is **enabled** when `state === 'wrap_up'` always. When `state === 'live'`:
  - Enabled. (Per source plan: encourages but does not force Rx-first.)
  - If `Rx never sent` AND `consultation_session.actual_started_at` is null → tooltip reads *"You can complete now, but consider sending an Rx first."* (Soft nudge, not a block.)
- [ ] Click → opens `<WrapUpDialog>` with the right props (appointmentId, appointmentSummary, initial values from the appointment row).
- [ ] After `onSaved`, the dialog closes; the parent `ConsultationCockpit` mutates its appointment state so `deriveCockpitState()` re-runs and the cockpit transitions to `ended`. (No router push — the page stays on the same appointment until the countdown / pf-11 fires.)

### Auto-trigger after Send Rx

- [ ] In `ConsultationCockpit` (or wherever `PrescriptionForm.onSent` bubbles up), add the trigger: when `onSent` fires AND `consultation_session.status === 'ended'` AND `doctor_settings.patient_flow_advance !== 'manual'` (default behaviour pre-pf-09 is `'countdown'` so this triggers), open the dialog with `triggeredAt: 'auto'`.
- [ ] Pre-pf-09 (settings column doesn't exist yet): treat the value as `'countdown'` for now (i.e. trigger). Add a `// TODO(pf-09): wire from doctor_settings.patient_flow_advance` comment.

### Retire kebab item

- [ ] Remove the `Mark completed` `DropdownMenuItem` (and its onClick / dialog wiring) from `CockpitHeader.tsx`.
- [ ] Delete `frontend/components/consultation/MarkCompletedForm.tsx`.
- [ ] Run `rg -l "MarkCompletedForm"` from `frontend/` — must return 0 hits after deletion. Fix any orphans.
- [ ] If `<AppointmentConsultationActions>` becomes empty / single-section after this delete, leave it for now and add a one-line entry to `docs/Work/capture/inbox.md` flagging it for cleanup.

### General

- [ ] Type-check + lint clean.
- [ ] No regressions in: kebab still has its remaining items (Modality switch, etc); cockpit header layout doesn't break at `lg` breakpoint.
- [ ] Recent screenshots (header before / after) saved in PR description.

---

## Out of scope

- **`<NextPatientCountdown>`** — pf-11 lands the auto-advance overlay. This task fires the dialog but takes no opinion on what happens after.
- **Settings UI** — pf-09 lands the settings column + UI. This task uses the default `'countdown'` behaviour explicitly.
- **Kebab redesign** — kebab keeps its other items; we only remove `Mark completed`.

---

## Files expected to touch

**New:** none.

**Modified:**
- `frontend/components/consultation/cockpit/CockpitHeader.tsx` (~40 LOC additive — button + click handler; remove ~12 LOC for the kebab item)
- `frontend/components/consultation/ConsultationCockpit.tsx` (~30 LOC — wire the auto-trigger + dialog open state + pass props)

**Deleted:**
- `frontend/components/consultation/MarkCompletedForm.tsx`

**Backend / migrations:** none.

---

## Notes / open decisions

1. **Why a button, not a kebab item.** Source plan's central thesis (P-D1) — the keystone has to be impossible to miss. Buried = ignored.
2. **`live` state still allows wrap-up.** Some consults end without a "session ended" event (e.g., text consult timeouts, or doctor closes the room manually). Allowing wrap-up from `live` covers those.
3. **Auto-trigger soft default before pf-09.** We default to `'countdown'` so the trigger fires today. Doctors who hate it can wait one batch step (pf-09) for the opt-out toggle. Acceptable given this batch ships as a unit.
4. **`appointmentSummary` for the dialog.** Pull from the appointment row — patient name (`appointment.patient.full_name` or fall back to `'walk-in'` for null `patient_id`), modality.

---

## References

- **Source plan:** [plan-patient-seeing-flow.md § P1.5](../../../../Product%20plans/plan-patient-seeing-flow.md#p15--retire-kebab-mark-completed-new-header-cta)
- **Dialog this CTA opens:** [task-pf-04-wrapup-dialog.md](./task-pf-04-wrapup-dialog.md)
- **Inbox entry already noted:** `docs/Work/capture/inbox.md` — patient seeing flow entry
- **Predecessor (kebab origin):** [Daily-plans/May 2026/06-05-2026/Tasks/task-cockpit-4-header.md](../../06-05-2026/Tasks/task-cockpit-4-header.md) — Notes #2

---

**Owner:** TBD
**Created:** 2026-05-07
**Status:** Shipped (2026-05-08).
